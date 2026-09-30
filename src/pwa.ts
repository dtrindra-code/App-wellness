/// <reference types="vite/client" />
// PWA bootstrap for the GitHub Pages build: offline service worker, persistent storage,
// and the coach messages pre-computed into IndexedDB for push notifications (lib/notify).
// Skipped in the Artifact viewer (iframe) and on plain http (local dev).

import { startCoachSync } from './lib/notify';

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
    // Keep today's and tomorrow's notification texts ready for the service worker.
    startCoachSync();
  });
}

export {};
