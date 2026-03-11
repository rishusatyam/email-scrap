const BACKEND_URL = 'http://localhost:3000';

// Listen for before unload to detect OAuth completion
chrome.webNavigation.onCompleted.addListener((details) => {
  // Check if this is the OAuth callback URL
  if (details.url.includes(BACKEND_URL) && details.url.includes('/auth/')) {
    // Extract provider and check for success/error
    if (details.url.includes('callback')) {
      // Get the tab content to parse response
      chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        function: extractOAuthResponse
      });
    }
  }
});

// Extract OAuth response from page
function extractOAuthResponse() {
  try {
    // Get page content
    const bodyText = document.body.innerText;
    
    // Try to parse if JSON
    try {
      const data = JSON.parse(bodyText);
      
      if (data.status === 'connected') {
        // Send success message to popup
        chrome.runtime.sendMessage({
          type: 'OAUTH_SUCCESS',
          data: {
            email: data.email,
            provider: data.provider
          }
        });
        
        // Close this window
        window.close();
      } else {
        throw new Error(data.error || 'OAuth failed');
      }
    } catch (e) {
      // Try to extract from HTML
      if (bodyText.includes('connected')) {
        const jsonMatch = bodyText.match(/\{.*"status".*"connected".*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          chrome.runtime.sendMessage({
            type: 'OAUTH_SUCCESS',
            data
          });
          window.close();
        }
      }
    }
  } catch (error) {
    console.error('Error extracting OAuth response:', error);
    chrome.runtime.sendMessage({
      type: 'OAUTH_ERROR',
      error: error.message
    });
  }
}

// Handle tab closure during OAuth
chrome.tabs.onRemoved.addListener((tabId, removed) => {
  // Could track if OAuth tab was closed prematurely
  console.log('OAuth tab closed');
});
