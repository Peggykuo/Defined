// Content script for text selection detection and inline popup rendering for Defined

(function () {
  // Prevent duplicate injection
  if (window.dictionaryExtensionInjected) return;
  window.dictionaryExtensionInjected = true;

  // Create root container for Shadow DOM
  const container = document.createElement('div');
  container.id = 'dictionary-extension-root';
  container.style.position = 'absolute';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100%';
  container.style.height = '0';
  container.style.overflow = 'visible';
  container.style.zIndex = '2147483647';
  container.style.pointerEvents = 'none'; // Click through the container wrapper
  document.body.appendChild(container);

  // Attach Shadow Root to insulate styles
  const shadow = container.attachShadow({ mode: 'open' });

  // CSS Styles for the popup (sleek, compact, unobtrusive pink theme)
  const style = document.createElement('style');
  style.textContent = `
    .dict-popup {
      position: absolute;
      pointer-events: auto; /* Re-enable clicks for the popup itself */
      width: 240px;
      max-height: 180px;
      background: linear-gradient(135deg, rgba(255, 240, 245, 0.97), rgba(255, 225, 235, 0.97));
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1.2px solid rgba(255, 105, 180, 0.35);
      border-radius: 12px;
      box-shadow: 0 6px 20px rgba(244, 143, 177, 0.22);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #4a1223;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      opacity: 0;
      transform: translateY(6px) scale(0.97);
      transition: opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      box-sizing: border-box;
      direction: ltr;
      text-align: left;
    }

    .dict-popup.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .dict-header {
      padding: 8px 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 105, 180, 0.1);
      background: rgba(255, 255, 255, 0.45);
    }

    .dict-word-container {
      display: flex;
      flex-direction: column;
      max-width: 75%;
    }

    .dict-word {
      font-size: 13.5px;
      font-weight: 700;
      color: #c2185b;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dict-subtitle {
      font-size: 9px;
      color: #ad1457;
      font-style: italic;
      margin-top: 1px;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dict-actions {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .dict-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      color: #c2185b;
    }

    .dict-btn:hover {
      background: rgba(255, 105, 180, 0.12);
      transform: scale(1.05);
    }

    .dict-btn svg {
      width: 14px;
      height: 14px;
      fill: currentColor;
    }

    .dict-content {
      padding: 10px 12px;
      overflow-y: auto;
      flex-grow: 1;
      font-size: 11.5px;
      line-height: 1.45;
    }

    /* Webkit scrollbar customization */
    .dict-content::-webkit-scrollbar {
      width: 4px;
    }
    .dict-content::-webkit-scrollbar-track {
      background: transparent;
    }
    .dict-content::-webkit-scrollbar-thumb {
      background: rgba(255, 105, 180, 0.3);
      border-radius: 2px;
    }

    .dict-definition {
      margin: 0;
      color: #3e0c1b;
      font-weight: 400;
    }

    .dict-loader {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 60px;
    }

    .dict-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 105, 180, 0.2);
      border-top-color: #c2185b;
      border-radius: 50%;
      animation: dictSpin 0.7s linear infinite;
    }

    @keyframes dictSpin {
      to { transform: rotate(360deg); }
    }

    .dict-error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 65px;
      text-align: center;
      padding: 0 12px;
      color: #880e4f;
    }

    .dict-error-msg {
      font-size: 11.5px;
      font-weight: 500;
      margin: 0 0 3px 0;
    }

    .dict-error-sub {
      font-size: 9.5px;
      color: #ad1457;
      opacity: 0.8;
      margin: 0;
    }
  `;
  shadow.appendChild(style);

  // Popup state variables
  let popup = null;
  let activeAudioUrl = null;
  let activeWord = '';

  // Helper to create the popup DOM structure
  function createPopup() {
    if (popup) return;

    popup = document.createElement('div');
    popup.className = 'dict-popup';
    
    // Stop propagation of events to prevent unexpected dismissal/selection loops
    popup.addEventListener('mouseup', (e) => e.stopPropagation());
    popup.addEventListener('mousedown', (e) => e.stopPropagation());
    popup.addEventListener('click', (e) => e.stopPropagation());

    shadow.appendChild(popup);
  }

  // Helper to remove the popup
  function removePopup() {
    if (popup) {
      popup.classList.remove('visible');
      const currentPopup = popup;
      setTimeout(() => {
        if (currentPopup && currentPopup.parentNode) {
          currentPopup.parentNode.removeChild(currentPopup);
        }
      }, 150);
      popup = null;
      activeAudioUrl = null;
      activeWord = '';
    }
  }

  // Position the popup based on the selection coordinates (240px wide)
  function positionPopup(selectionRect) {
    if (!popup) return;

    const popupWidth = 240;
    const popupHeight = popup.offsetHeight || 120;

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    // Selection horizontal center
    const selectionCenter = selectionRect.left + scrollLeft + (selectionRect.width / 2);
    
    // Attempt above positioning
    let top = selectionRect.top + scrollTop - popupHeight - 10;
    let left = selectionCenter - (popupWidth / 2);

    // If it goes off the top, position below instead
    if (selectionRect.top - popupHeight - 10 < 0) {
      top = selectionRect.bottom + scrollTop + 10;
    }

    // Clamp horizontal coordinates to viewport bounds
    const minLeft = scrollLeft + 10;
    const maxLeft = scrollLeft + window.innerWidth - popupWidth - 10;
    left = Math.max(minLeft, Math.min(maxLeft, left));

    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
  }

  // Fetch and display definition
  function showDefinition(word, selectionRect) {
    createPopup();
    
    // Render Loading State
    popup.innerHTML = `
      <div class="dict-loader">
        <div class="dict-spinner"></div>
      </div>
    `;
    
    popup.classList.add('visible');
    positionPopup(selectionRect);

    activeWord = word;
    activeAudioUrl = null;

    // Request background service worker to fetch definition
    chrome.runtime.sendMessage({ action: 'fetchDefinition', word: word }, (response) => {
      if (!popup || activeWord !== word) return;

      if (response && response.success) {
        renderDefinition(response.data);
      } else {
        renderError(response ? response.error : 'Failed to look up term');
      }
      
      // Re-position because height changed
      setTimeout(() => {
        if (popup) positionPopup(selectionRect);
      }, 20);
    });
  }

  // Render definition payload
  function renderDefinition(entry) {
    const word = entry.word;
    const subtitle = entry.subtitle || '';
    const definition = entry.definition || 'No definition found.';
    
    activeAudioUrl = entry.audio; // Saved from dictionary entries if available

    // Build header HTML
    let headerHtml = `
      <div class="dict-word-container">
        <h3 class="dict-word" title="${word}">${word}</h3>
        ${subtitle ? `<span class="dict-subtitle" title="${subtitle}">${subtitle}</span>` : ''}
      </div>
      <div class="dict-actions">
    `;

    // Add speaker button (plays audio URL or runs local SpeechSynthesis)
    if (activeAudioUrl || 'speechSynthesis' in window) {
      headerHtml += `
        <button class="dict-btn" id="dict-btn-speak" title="Listen pronunciation">
          <svg viewBox="0 0 24 24">
            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          </svg>
        </button>
      `;
    }

    // Add close button
    headerHtml += `
        <button class="dict-btn" id="dict-btn-close" title="Close">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
    `;

    popup.innerHTML = `
      <div class="dict-header">
        ${headerHtml}
      </div>
      <div class="dict-content">
        <p class="dict-definition">${definition}</p>
      </div>
    `;

    // Wire up buttons
    const speakBtn = popup.querySelector('#dict-btn-speak');
    if (speakBtn) {
      speakBtn.addEventListener('click', speakWord);
    }
    
    const closeBtn = popup.querySelector('#dict-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', removePopup);
    }
  }

  // Speech helper
  function speakWord() {
    if (activeAudioUrl) {
      const audio = new Audio(activeAudioUrl);
      audio.play().catch(() => {
        fallbackSpeak();
      });
    } else {
      fallbackSpeak();
    }
  }

  function fallbackSpeak() {
    if ('speechSynthesis' in window && activeWord) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(activeWord);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }

  // Render error payload
  function renderError(message) {
    popup.innerHTML = `
      <div class="dict-header" style="justify-content: flex-end; padding: 6px 12px 2px;">
        <button class="dict-btn" id="dict-btn-close" title="Close">
          <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      <div class="dict-error-container">
        <p class="dict-error-msg">🌸 Term not found.</p>
        <p class="dict-error-sub">No definition available.</p>
      </div>
    `;

    const closeBtn = popup.querySelector('#dict-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', removePopup);
    }
  }

  // Listen for selection events
  document.addEventListener('mouseup', (e) => {
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      // Check if selection is a valid term (allow spaces, hyphens, and dots for libraries/commands)
      if (text.length > 0 && text.length < 60 && /^[a-zA-Z0-9\s'.-]+$/.test(text)) {
        const wordCount = text.split(/\s+/).length;
        if (wordCount <= 4) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          if (rect.width > 0 && rect.height > 0) {
            showDefinition(text, rect);
          }
        } else {
          removePopup();
        }
      } else {
        removePopup();
      }
    }, 10);
  });

  // Handle clicking outside selection and popup to dismiss
  document.addEventListener('mousedown', (e) => {
    if (container && !e.composedPath().includes(container)) {
      removePopup();
    }
  });

  // Handle resizing window to re-position popup
  window.addEventListener('resize', () => {
    if (popup && window.getSelection().rangeCount > 0) {
      const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        positionPopup(rect);
      }
    }
  });
})();
