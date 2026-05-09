(function () {
  'use strict';

  const TAG = '[LTE-Logger]';
  const frameUrl = window.location.href;
  const isIframe = window !== window.top;

  console.log(`${TAG} content script started | frame: ${frameUrl} | isIframe: ${isIframe}`);

  // ── Page detection ─────────────────────────────────────────────────────────
  function hasLTEStatusPage() {
    const el = document.querySelector('.unit_title');
    if (!el) {
      console.log(`${TAG} .unit_title not found`);
      return false;
    }
    const text = el.textContent.trim();
    console.log(`${TAG} .unit_title text: "${text}"`);
    return text.includes('Stav LTE');
  }

  // ── Data extraction ────────────────────────────────────────────────────────
  function extractLTEData() {
    if (!hasLTEStatusPage()) {
      console.log(`${TAG} LTE status page not detected – skipping extraction`);
      return null;
    }

    const tables = document.querySelectorAll('table.table_frame');
    console.log(`${TAG} table.table_frame count: ${tables.length}`);

    const record = {};

    document.querySelectorAll('table.table_frame tr').forEach((row, ri) => {
      const cells = Array.from(row.querySelectorAll('td'));
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const labelCell = cells[i];
        const valueCell = cells[i + 1];

        if (
          labelCell.classList.contains('table_font2') &&
          valueCell.classList.contains('table_font')
        ) {
          const key = labelCell.textContent.trim();
          const val = valueCell.textContent.trim();
          if (key) {
            record[key] = val;
            console.log(`${TAG}   row ${ri} i=${i}: "${key}" = "${val}"`);
          }
        }
      }
    });

    const count = Object.keys(record).length;
    console.log(`${TAG} extracted ${count} fields`);
    return count > 0 ? record : null;
  }

  // ── Send to background ─────────────────────────────────────────────────────
  let lastDataStr = '';

  function sendIfChanged() {
    console.log(`${TAG} sendIfChanged() called`);
    const data = extractLTEData();

    if (!data) {
      console.warn(`${TAG} no data extracted – not sending`);
      return;
    }

    const str = JSON.stringify(data);
    if (str === lastDataStr) {
      console.log(`${TAG} data unchanged – skipping`);
      return;
    }
    lastDataStr = str;

    const payload = { type: 'LOG_LTE_DATA', data, timestamp: Date.now(), frameUrl };
    console.log(`${TAG} sending message:`, payload);

    try {
      chrome.runtime.sendMessage(payload, response => {
        if (chrome.runtime.lastError) {
          console.error(`${TAG} sendMessage error:`, chrome.runtime.lastError.message);
        } else {
          console.log(`${TAG} sendMessage OK, response:`, response);
        }
      });
    } catch (err) {
      console.error(`${TAG} sendMessage threw:`, err);
    }
  }

  // ── MutationObserver for AJAX body replacements ────────────────────────────
  function setupObserver() {
    if (!document.body) {
      console.warn(`${TAG} document.body not available yet – deferring observer`);
      document.addEventListener('DOMContentLoaded', setupObserver, { once: true });
      return;
    }

    console.log(`${TAG} attaching MutationObserver to document.body`);

    const observer = new MutationObserver(mutations => {
      console.log(`${TAG} MutationObserver fired | mutations: ${mutations.length}`);
      mutations.forEach((m, i) => {
        console.log(`${TAG}   [${i}] type=${m.type} added=${m.addedNodes.length} removed=${m.removedNodes.length}`);
      });
      clearTimeout(window.__lteDebounce);
      window.__lteDebounce = setTimeout(sendIfChanged, 150);
    });

    observer.observe(document.body, { childList: true });
    console.log(`${TAG} MutationObserver attached`);
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  // Run initial extraction
  sendIfChanged();
  // Watch for subsequent AJAX-driven replacements
  setupObserver();

})();
