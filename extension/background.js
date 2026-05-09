'use strict';

const TAG = '[LTE-Logger BG]';
const MAX_ENTRIES = 2000;

console.log(`${TAG} service worker started`);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log(`${TAG} message received: type=${msg.type}`, {
    frameId: sender.frameId,
    url: sender.url,
    tabId: sender.tab?.id,
  });

  // ── Store a new LTE data snapshot ────────────────────────────────────────
  if (msg.type === 'LOG_LTE_DATA') {
    chrome.storage.local.get(['lteLog', 'lteDebug'], result => {
      const log = result.lteLog || [];
      log.push({ ts: msg.timestamp, d: msg.data });
      if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);

      const debug = {
        lastReceived: msg.timestamp,
        lastFrameUrl: msg.frameUrl ?? sender.url ?? 'unknown',
        lastFrameId: sender.frameId,
        totalStored: log.length,
      };

      chrome.storage.local.set({ lteLog: log, lteDebug: debug }, () => {
        console.log(`${TAG} stored entry #${log.length}`, debug);
      });
    });

    sendResponse({ ok: true });
    return;
  }

  // ── Popup requests log data ──────────────────────────────────────────────
  if (msg.type === 'GET_LOG') {
    chrome.storage.local.get(['lteLog', 'lteDebug'], result => {
      console.log(`${TAG} GET_LOG → ${(result.lteLog || []).length} entries`);
      sendResponse({ log: result.lteLog || [], debug: result.lteDebug || null });
    });
    return true; // async response
  }

  // ── Clear log ────────────────────────────────────────────────────────────
  if (msg.type === 'CLEAR_LOG') {
    chrome.storage.local.set({ lteLog: [], lteDebug: null }, () => {
      console.log(`${TAG} log cleared`);
      sendResponse({ ok: true });
    });
    return true;
  }
});
