(function () {
  'use strict';

  const TAG = '[LTE-Logger]';
  const url = location.href;
  console.log(`${TAG} started | url=${url} | top=${window === window.top}`);

  // ── Extension context guard ────────────────────────────────────────────────
  // When the extension is reloaded, the context is invalidated but setInterval
  // keeps firing. Any chrome.* call then throws "Extension context invalidated".
  // Call this before every chrome.* API call; it returns false when stale.
  function contextAlive() {
    try {
      return !!chrome.runtime?.id;
    } catch (_) {
      return false;
    }
  }

  // ── Startup ping (so popup can confirm injection without DevTools) ──────────
  if (contextAlive()) {
    chrome.storage.local.get(['lteStartups'], r => {
      if (!contextAlive()) return;
      const list = r.lteStartups || [];
      list.push({ ts: Date.now(), url, top: window === window.top });
      if (list.length > 20) list.splice(0, list.length - 20);
      chrome.storage.local.set({ lteStartups: list });
    });
  }

  // ── Data extraction from any document ──────────────────────────────────────
  function extractFromDoc(doc) {
    if (!doc) return null;

    const titleEl = doc.querySelector('.unit_title');
    const titleText = titleEl ? titleEl.textContent.trim() : '';
    if (!titleText.includes('Stav LTE')) {
      console.log(`${TAG} .unit_title="${titleText}" – not an LTE status page`);
      return null;
    }

    const tables = doc.querySelectorAll('table.table_frame');
    console.log(`${TAG} found ${tables.length} table.table_frame(s)`);

    const record = {};
    doc.querySelectorAll('table.table_frame tr').forEach(row => {
      const cells = Array.from(row.querySelectorAll('td'));
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const lc = cells[i], vc = cells[i + 1];
        if (lc.classList.contains('table_font2') && vc.classList.contains('table_font')) {
          const key = lc.textContent.trim();
          const val = vc.textContent.trim();
          if (key) record[key] = val;
        }
      }
    });

    const n = Object.keys(record).length;
    console.log(`${TAG} extracted ${n} fields`);
    return n > 0 ? record : null;
  }

  // ── Send to background ─────────────────────────────────────────────────────
  function sendData(data, sourceUrl) {
    if (!contextAlive()) return;
    const payload = { type: 'LOG_LTE_DATA', data, timestamp: Date.now(), frameUrl: sourceUrl };
    try {
      chrome.runtime.sendMessage(payload, response => {
        if (chrome.runtime.lastError) {
          console.warn(`${TAG} sendMessage:`, chrome.runtime.lastError.message);
        } else {
          console.log(`${TAG} OK – ${Object.keys(data).length} fields stored`);
        }
      });
    } catch (e) {
      console.warn(`${TAG} sendMessage threw (context likely invalidated):`, e.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY A – parent frame (indexMain.cgi)
  // Reads the #mainFrame iframe's contentDocument via same-origin DOM access.
  // Polls every 5 s. Stops itself cleanly when extension context is invalidated.
  // ─────────────────────────────────────────────────────────────────────────────
  function parentFrameStrategy() {
    const iframe = document.getElementById('mainFrame');
    if (!iframe) {
      console.log(`${TAG} #mainFrame not found – not the parent page`);
      return false;
    }
    console.log(`${TAG} #mainFrame found – using parent-frame strategy`);

    let lastStr = '';
    let intervalId = null;

    function poll() {
      // Stop the interval and give up if the extension was reloaded
      if (!contextAlive()) {
        console.log(`${TAG} context invalidated – stopping poll`);
        clearInterval(intervalId);
        return;
      }

      let iDoc;
      try {
        iDoc = iframe.contentDocument;
      } catch (e) {
        console.error(`${TAG} contentDocument access error:`, e);
        return;
      }

      if (!iDoc) {
        console.log(`${TAG} iframe.contentDocument is null`);
        return;
      }
      if (iDoc.readyState !== 'complete') {
        console.log(`${TAG} iframe readyState=${iDoc.readyState} – waiting`);
        return;
      }

      const data = extractFromDoc(iDoc);
      if (!data) return;

      const str = JSON.stringify(data);
      if (str === lastStr) return;
      lastStr = str;
      sendData(data, iframe.src || url);
    }

    function startPolling() {
      console.log(`${TAG} iframe ready – polling every 5 s`);
      poll();
      intervalId = setInterval(poll, 5000);
    }

    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
      startPolling();
    } else {
      iframe.addEventListener('load', startPolling, { once: true });
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY B – lteStatus.cgi opened as the top-level document directly.
  // Uses MutationObserver to catch the AJAX body replacement every 5 s.
  // ─────────────────────────────────────────────────────────────────────────────
  function directPageStrategy() {
    if (window !== window.top) {
      console.log(`${TAG} in embedded iframe – parent-frame strategy covers this`);
      return false;
    }

    if (!extractFromDoc(document)) {
      console.log(`${TAG} not an LTE status page – nothing to do`);
      return false;
    }

    console.log(`${TAG} direct lteStatus.cgi detected`);
    let lastStr = '';

    function attempt() {
      if (!contextAlive()) {
        observer.disconnect();
        return;
      }
      const d = extractFromDoc(document);
      if (!d) return;
      const str = JSON.stringify(d);
      if (str === lastStr) return;
      lastStr = str;
      sendData(d, url);
    }

    attempt();

    const observer = new MutationObserver(() => {
      clearTimeout(window.__lteDebounce);
      window.__lteDebounce = setTimeout(attempt, 150);
    });
    observer.observe(document.body, { childList: true });
    console.log(`${TAG} MutationObserver attached`);
    return true;
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    if (!parentFrameStrategy()) directPageStrategy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
