// Un clic en el icono abre el panel lateral. Tiene que ser el panel y no un popup:
// el popup se cierra al soltar el foco, y arrastrar desde Finder saca el foco de Chrome.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.storage.local.get('token').then(({ token }) => {
    if (!token) chrome.runtime.openOptionsPage();
  });
});
