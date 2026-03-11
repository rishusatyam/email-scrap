const BACKEND_URL = 'http://localhost:3000';

// When popup opens
document.addEventListener('DOMContentLoaded', async () => {
  await checkConnectionStatus();
  setupEventListeners();
});

// Check if already connected
async function checkConnectionStatus() {
  try {
    const data = await chrome.storage.local.get(['mailbox']);
    
    if (data.mailbox) {
      const mailbox = data.mailbox;
      
      // Show connected state
      document.getElementById('connectionButtons').style.display = 'none';
      document.getElementById('connectionStatus').style.display = 'block';
      
      document.getElementById('connectedEmail').textContent = `📧 ${mailbox.email}`;
      document.getElementById('connectedProvider').textContent = `Provider: ${mailbox.provider.toUpperCase()}`;
      
      document.getElementById('disconnectBtn').addEventListener('click', disconnect);
    } else {
      // Show connection buttons
      document.getElementById('connectionButtons').style.display = 'flex';
      document.getElementById('connectionStatus').style.display = 'none';
    }
  } catch (error) {
    console.error('Error checking status:', error);
  }
}

// Setup button listeners
function setupEventListeners() {
  document.getElementById('gmailBtn').addEventListener('click', () => startOAuth('gmail'));
  document.getElementById('outlookBtn').addEventListener('click', () => startOAuth('outlook'));
}

// Start OAuth flow
function startOAuth(provider) {
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('connectionButtons').style.display = 'none';
  
  // Open OAuth window
  const authUrl = `${BACKEND_URL}/auth/${provider}/start`;
  
  chrome.windows.create({
    url: authUrl,
    type: 'popup',
    width: 500,
    height: 600
  }, (window) => {
    // Store window ID to track completion
    sessionStorage.setItem('oauthWindowId', window.id);
    sessionStorage.setItem('oauthProvider', provider);
  });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OAUTH_SUCCESS') {
    handleOAuthSuccess(message.data);
    sendResponse({ success: true });
  } else if (message.type === 'OAUTH_ERROR') {
    handleOAuthError(message.error);
    sendResponse({ success: false });
  }
});

// Handle successful OAuth
async function handleOAuthSuccess(data) {
  try {
    // Save mailbox info to storage
    await chrome.storage.local.set({
      mailbox: {
        email: data.email,
        provider: data.provider,
        connectedAt: new Date().toISOString()
      }
    });
    
    // Show success message
    showStatus('✓ Connected successfully!', 'success');
    
    // Refresh popup after short delay
    setTimeout(() => {
      location.reload();
    }, 1500);
  } catch (error) {
    console.error('Error saving mailbox:', error);
    showStatus('✗ Failed to save connection', 'error');
  }
}

// Handle OAuth error
function handleOAuthError(error) {
  showStatus(`✗ Connection failed: ${error}`, 'error');
  document.getElementById('loading').style.display = 'none';
  document.getElementById('connectionButtons').style.display = 'flex';
}

// Disconnect mailbox
async function disconnect() {
  try {
    await chrome.storage.local.remove('mailbox');
    showStatus('✓ Disconnected', 'success');
    
    setTimeout(() => {
      location.reload();
    }, 1000);
  } catch (error) {
    showStatus('✗ Failed to disconnect', 'error');
  }
}

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = 'block';
}
