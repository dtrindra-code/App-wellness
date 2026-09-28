/// <reference types="vite/client" />
// PWA bootstrap for the GitHub Pages build: offline service worker + persistent storage.
// Skipped in the Artifact viewer (iframe) and on plain http (local dev).

function inIframe(): boolean {
  try {
    return window.top !== window;
  } catch {
    return true; // cross-origin parent
  }
}

if ('serviceWorker' in navigator && location.protocol === 'https:' && !inIframe()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        /* offline mode unavailable; the app still works online */
      });
    // Ask the browser to keep localStorage/caches (helps Safari not evict data).
    void navigator.storage?.persist?.().catch(() => false);
  });
}

export {};
