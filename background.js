// Background service worker — sets up the context menu item

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ai-input-assistant",
    title: "✨ AI Input Assistant",
    contexts: ["editable"], // Only shows on editable inputs / textareas
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "ai-input-assistant") {
    // Send message to content script with click coordinates
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: openAIDialog,
      args: [info.frameId ?? 0],
    });
  }
});

/**
 * Injected into the page to trigger the dialog via a custom event.
 * We can't send click coordinates directly from background,
 * so we dispatch an event that the content script picks up.
 */
function openAIDialog() {
  document.dispatchEvent(
    new CustomEvent("ai-assistant:open", { detail: { fromMenu: true } })
  );
}
