function setEmojiIcon(emoji) {
  const canvas = new OffscreenCanvas(16, 16);
  const context = canvas.getContext('2d');
  
  context.font = '18px serif';
  context.textBaseline = 'top';
  context.fillText(emoji, -2, 1);

  const imageData = context.getImageData(0, 0, 16,16);
  chrome.action.setIcon({ imageData: imageData });
}

// Set the icon when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  setEmojiIcon('🌸');
});