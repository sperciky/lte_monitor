(function () {
  'use strict';

  const TAG = '[LTE-Logger]';
  const url = location.href;
  console.log(`${TAG} started | url=${url} | top=${window === window.top}`);

  // Write startup evidence to storage so the popup can confirm injection
  // even when DevTools is not open.
  chrome.storage.local.get(['lteStartups'], r => {
    const list = r.lteStartups || [];
    list.push({ ts: Date.now(), url, top: window === window.top });
    if (list.length > 20) list.splice(0, list.length - 20);
    chrome.storage.local.set({ lteStartups: list });
  });

  // ── Data extraction from any document ──────────────────────────────────────
  function extractFromDoc(doc) {
    if (!doc) return null;

    const titleEl = doc.querySelector('.unit_title');
    const titleText = titleEl ? titleEl.textContent.trim() : '';
    if (!titleText.includes('Stav LTE')) {
      console.log(`${TAG} .unit_title = "${titleText}" – not an LTE status page`);
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

  // ── Message to background ──────────────────────────────────────────────────
  function sendData(data, sourceUrl) {
    const payload = { type: 'LOG_LTE_DATA', data, timestamp: Date.now(), frameUrl: sourceUrl };
    chrome.runtime.sendMessage(payload, response => {
      if (chrome.runtime.lastError) {
        console.error(`${TAG} sendMessage error:`, chrome.runtime.lastError.message);
      } else {
        console.log(`${TAG} sendMessage OK – ${Object.keys(data).length} fields stored`);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY A – parent frame (indexMain.cgi)
  // Reads the iframe's contentDocument directly (same-origin DOM access).
  // This sidesteps all iframe content-script injection timing problems.
  // ─────────────────────────────────────────────────────────────────────────────
  function parentFrameStrategy() {
    const iframe = document.getElementById('mainFrame');
    if (!iframe) {
      console.log(`${TAG} #mainFrame not found – not the parent page`);
      return false;
    }
    console.log(`${TAG} #mainFrame found – using parent-frame strategy`);

    let lastStr = '';

    function poll() {
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
        console.log(`${TAG} iframe readyState: ${iDoc.readyState} – waiting`);
        return;
      }

      const data = extractFromDoc(iDoc);
      if (!data) return;

      const str = JSON.stringify(data);
      if (str === lastStr) {
        console.log(`${TAG} data unchanged – skip`);
        return;
      }
      lastStr = str;
      sendData(data, iframe.src || url);
    }

    function startPolling() {
      console.log(`${TAG} iframe ready – starting poll every 5 s`);
      poll(); // immediate first read
      setInterval(poll, 5000);
    }

    // If the iframe is already loaded, start immediately; otherwise wait.
    if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
      startPolling();
    } else {
      iframe.addEventListener('load', startPolling, { once: true });
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STRATEGY B – direct access (lteStatus.cgi opened as the top-level document,
  // not inside indexMain.cgi). Uses MutationObserver to catch AJAX refreshes.
  // ─────────────────────────────────────────────────────────────────────────────
  function directPageStrategy() {
    // Only activate when this IS the top-level document AND has LTE content.
    if (window !== window.top) {
      // Inside an iframe embedded in indexMain.cgi – strategy A handles it.
      console.log(`${TAG} in embedded iframe – parent-frame strategy covers this`);
      return false;
    }

    const data = extractFromDoc(document);
    if (!data) {
      console.log(`${TAG} not an LTE status page – nothing to do`);
      return false;
    }

    console.log(`${TAG} direct lteStatus.cgi page detected`);
    let lastStr = '';

    function attempt() {
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
    const usedParent = parentFrameStrategy();
    if (!usedParent) directPageStrategy();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
