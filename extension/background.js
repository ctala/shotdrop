// Clicking the toolbar icon (or its keyboard shortcut) opens the side panel. It has to be the side
// panel and not a popup: a popup closes when Chrome loses focus, and dragging from Finder does that.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  const { token } = await chrome.storage.local.get('token');
  if (!token) chrome.runtime.openOptionsPage();
});
