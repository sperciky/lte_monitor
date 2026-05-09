(function () {
  'use strict';

  // Only operate on the LTE status page (either direct or inside iframe)
  function hasLTEStatusPage() {
    const title = document.querySelector('.unit_title');
    return title && title.textContent.includes('Stav LTE');
  }

  // Extract all label→value pairs from the table_font2 / table_font cell pattern
  function extractLTEData() {
    if (!hasLTEStatusPage()) return null;

    const record = {};

    document.querySelectorAll('table.table_frame tr').forEach(row => {
      const cells = Array.from(row.querySelectorAll('td'));
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const labelCell = cells[i];
        const valueCell = cells[i + 1];

        if (
          labelCell.classList.contains('table_font2') &&
          valueCell.classList.contains('table_font')
        ) {
          const key = labelCell.textContent.trim();
          // textContent strips HTML tags (e.g. the signal strength <img>),
          // giving us clean text like "LTE" for the Stav cell.
          const val = valueCell.textContent.trim();
          if (key) record[key] = val;
        }
      }
    });

    return Object.keys(record).length > 0 ? record : null;
  }

  let lastDataStr = '';

  function sendIfChanged() {
    const data = extractLTEData();
    if (!data) return;

    const str = JSON.stringify(data);
    if (str === lastDataStr) return;
    lastDataStr = str;

    chrome.runtime.sendMessage({
      type: 'LOG_LTE_DATA',
      data,
      timestamp: Date.now()
    }).catch(() => {
      // Service worker may be inactive; Chrome will wake it automatically next time.
    });
  }

  // Capture initial page load data
  sendIfChanged();

  // The router page refreshes via jQuery AJAX that replaces document.body innerHTML.
  // A MutationObserver on body catches each replacement and re-extracts data.
  const observer = new MutationObserver(() => {
    clearTimeout(window.__lteDebounce);
    window.__lteDebounce = setTimeout(sendIfChanged, 150);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true });
  }
})();
