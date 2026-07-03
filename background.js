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

let localGlossary = {};

// Load local curated database on initialization
fetch(chrome.runtime.getURL('local_terms.json'))
    .then(response => response.json())
    .then(data => {
        localGlossary = data;
        console.log("Defined: Local wordbase loaded.");
    })
    .catch(err => {
        console.error("Defined: Failed to load local wordbase:", err);
    });

// Long-lived Port connection listener to survive automatic lifecycle sleeping
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'defined-communication-channel') {
    port.onMessage.addListener((request) => {
      if (request.action === 'fetchDefinition') {
        const rawWord = request.word.trim();
        const queryTerm = rawWord.toLowerCase();

        // 1. Check local wordbase
        if (localGlossary[queryTerm]) {
          port.postMessage({
            success: true,
            word: rawWord,
            data: {
              source: 'local',
              word: rawWord,
              subtitle: "Developer Tool/Command",
              definition: localGlossary[queryTerm],
              audio: null
            }
          });
          return;
        }

        // 2. Check Dictionary API
        const dictUrl = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(queryTerm)}`;
        
        fetch(dictUrl)
          .then(response => {
            if (!response.ok) {
              throw new Error('Not found in standard dictionary');
            }
            return response.json();
          })
          .then(data => {
            const entry = data[0];
            const word = entry.word;
            const phonetic = entry.phonetic || (entry.phonetics && entry.phonetics.find(p => p.text)?.text) || '';
            
            let audioUrl = null;
            if (entry.phonetics && Array.isArray(entry.phonetics)) {
              const audioObj = entry.phonetics.find(p => p.audio && p.audio !== '');
              if (audioObj) {
                audioUrl = audioObj.audio;
              }
            }

            let definition = 'No definition found.';
            if (entry.meanings && entry.meanings.length > 0) {
              const firstMeaning = entry.meanings[0];
              const partOfSpeech = firstMeaning.partOfSpeech;
              const firstDefObj = firstMeaning.definitions && firstMeaning.definitions[0];
              if (firstDefObj) {
                definition = `(${partOfSpeech}) ${firstDefObj.definition}`;
              }
            }

            port.postMessage({
              success: true,
              word: rawWord,
              data: {
                source: 'dictionary',
                word: word,
                subtitle: phonetic,
                definition: definition,
                audio: audioUrl
              }
            });
          })
          .catch(dictError => {
            // TIER 3: Fall back to Wikipedia Page Summary API
            const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(queryTerm)}`;
            
            fetch(wikiUrl)
              .then(wikiRes => {
                if (!wikiRes.ok) {
                  throw new Error('Not found on Wikipedia');
                }
                return wikiRes.json();
              })
              .then(wikiData => {
                if (wikiData.type === 'standard') {
                  port.postMessage({
                    success: true,
                    word: rawWord,
                    data: {
                      source: 'wikipedia',
                      word: wikiData.title,
                      subtitle: wikiData.description || "Tech / Encyclopedia Term",
                      definition: wikiData.extract,
                      audio: null
                    }
                  });
                } else {
                  throw new Error('Not a standard Wikipedia page');
                }
              })
              .catch(wikiError => {
                // Wikipedia capitalization retry
                const capitalizedTerm = queryTerm.charAt(0).toUpperCase() + queryTerm.slice(1);
                const wikiRetryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(capitalizedTerm)}`;
                
                fetch(wikiRetryUrl)
                  .then(retryRes => {
                    if (!retryRes.ok) throw new Error('Not found');
                    return retryRes.json();
                  })
                  .then(retryData => {
                    if (retryData.type === 'standard') {
                      port.postMessage({
                        success: true,
                        word: rawWord,
                        data: {
                          source: 'wikipedia',
                          word: retryData.title,
                          subtitle: retryData.description || "Tech / Encyclopedia Term",
                          definition: retryData.extract,
                          audio: null
                    }
                  });
                } else {
                  throw new Error('Not standard page on retry');
                }
              })
              .catch(() => {
                port.postMessage({ 
                  success: false, 
                  word: rawWord, 
                  error: 'Definition not found in local database, dictionary, or Wikipedia.' 
                });
              });
          });
      });
      }
    });
  }
});