'use strict';

const MAX_ENTRIES = 2000; // ~2000 × 5 s ≈ 2.8 hours of data at default refresh rate

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'LOG_LTE_DATA') {
    chrome.storage.local.get(['lteLog'], result => {
      const log = result.lteLog || [];
      log.push({ ts: msg.timestamp, d: msg.data });

      if (log.length > MAX_ENTRIES) {
        log.splice(0, log.length - MAX_ENTRIES);
      }

      chrome.storage.local.set({ lteLog: log });
    });
    return; // synchronous, no response needed
  }

  if (msg.type === 'GET_LOG') {
    chrome.storage.local.get(['lteLog'], result => {
      sendResponse({ log: result.lteLog || [] });
    });
    return true; // keep channel open for async response
  }

  if (msg.type === 'CLEAR_LOG') {
    chrome.storage.local.set({ lteLog: [] }, () => sendResponse({ ok: true }));
    return true;
  }
});
