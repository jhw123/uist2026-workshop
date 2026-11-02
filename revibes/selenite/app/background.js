chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['logic.js', 'app.js']});
  } catch (error) {
    console.warn('Selenite cannot open on this page:', error.message);
  }
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== 'selenite-api') return;
  if (!['health', 'topic', 'criteria', 'page', 'detail', 'recommend'].includes(message.action)) {
    respond({error: 'Unknown action'});
    return;
  }
  fetch(`http://localhost:8792/api/${message.action}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(message.payload || {})
  }).then(async (response) => {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Local backend failed');
    respond({result});
  }).catch((error) => respond({error: error.message}));
  return true;
});
