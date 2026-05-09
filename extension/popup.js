'use strict';

// ── Column definitions ───────────────────────────────────────────────────────
// key      : used in column group checks
// label    : table header text
// field    : exact key in the logged data object (Czech label from the router page)
// numeric  : true → right-align and extract numeric portion for sorting
// quality  : function that returns CSS class based on numeric value (optional)

const COLS = [
  // Always visible
  { key: 'ts',     label: 'Time',            field: '__ts',              numeric: false, always: true },

  // Key signal metrics
  { key: 'key',    label: 'RSRP (dBm)',      field: 'RSRP',              numeric: true,  quality: qualityRSRP },
  { key: 'key',    label: 'RSRQ (dB)',       field: 'RSRQ',              numeric: true,  quality: qualityRSRQ },
  { key: 'key',    label: 'SINR (dB)',       field: 'SINR',              numeric: true,  quality: qualitySINR },
  { key: 'key',    label: 'RSSI (dBm)',      field: 'Síla signálu',      numeric: true,  quality: qualityRSSI },
  { key: 'key',    label: 'Band',            field: 'Kmitočtové pásmo',  numeric: false },
  { key: 'key',    label: 'DL EARFCN',       field: 'DL EARFCN',         numeric: false },
  { key: 'key',    label: 'Bandwidth',       field: 'Šířka pásma',       numeric: false },
  { key: 'key',    label: 'RANK',            field: 'RANK',              numeric: true  },
  { key: 'key',    label: 'UL speed',        field: 'UL rychlost',       numeric: false },
  { key: 'key',    label: 'DL speed',        field: 'DL rychlost',       numeric: false },

  // Cell info
  { key: 'cell',   label: 'PCI',             field: 'PCI',               numeric: true  },
  { key: 'cell',   label: 'eNB ID',          field: 'eNB ID [DEC]',      numeric: true  },
  { key: 'cell',   label: 'Cell ID',         field: 'Cell ID [DEC]',     numeric: true  },
  { key: 'cell',   label: 'Global Cell ID',  field: 'Global Cell ID',    numeric: false },
  { key: 'cell',   label: 'ECGI',            field: 'ECGI',              numeric: false },
  { key: 'cell',   label: 'Duplex',          field: 'Duplexní mód',      numeric: false },

  // CA / CQI
  { key: 'ca',     label: 'CA config',       field: 'Stav konfigurace CA', numeric: false },
  { key: 'ca',     label: 'CA active',       field: 'Stav aktivace CA',    numeric: false },
  { key: 'ca',     label: 'CQI',             field: 'CQI',                 numeric: false },
  { key: 'ca',     label: 'Roaming',         field: 'Stav datového roamingu', numeric: false },

  // Device info
  { key: 'device', label: 'Provider',        field: 'Poskytovatel služby', numeric: false },
  { key: 'device', label: 'APN',             field: 'APN',                 numeric: false },
  { key: 'device', label: 'IMEI',            field: 'IMEI zařízení',       numeric: false },
  { key: 'device', label: 'IMSI',            field: 'IMSI SIM karty',      numeric: false },
  { key: 'device', label: 'SW ver.',         field: 'Softwarová verze',    numeric: false },

  // Connection
  { key: 'conn',   label: 'Status',          field: 'Stav',                numeric: false },
  { key: 'conn',   label: 'Uptime',          field: 'Čas běhu připojení',  numeric: false },
  { key: 'conn',   label: 'ICCID',           field: 'ICCID',               numeric: false },
];

// ── Signal quality helpers ───────────────────────────────────────────────────
function parseNum(str) {
  if (!str) return NaN;
  const m = String(str).match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

function qualityRSRP(v) {
  if (v > -80)  return 'q-excellent';
  if (v > -90)  return 'q-good';
  if (v > -100) return 'q-fair';
  return 'q-poor';
}
function qualityRSRQ(v) {
  if (v > -10) return 'q-excellent';
  if (v > -15) return 'q-good';
  if (v > -20) return 'q-fair';
  return 'q-poor';
}
function qualitySINR(v) {
  if (v > 20) return 'q-excellent';
  if (v > 13) return 'q-good';
  if (v > 0)  return 'q-fair';
  return 'q-poor';
}
function qualityRSSI(v) {
  if (v > -65)  return 'q-excellent';
  if (v > -75)  return 'q-good';
  if (v > -85)  return 'q-fair';
  return 'q-poor';
}

// ── State ────────────────────────────────────────────────────────────────────
let allLog = [];       // [{ts, d}]  newest last
let sortCol  = 0;      // column index to sort by
let sortDir  = -1;     // -1 = desc (newest first), 1 = asc
let displayed = [];    // sorted view

// ── Visible columns (controlled by checkboxes) ───────────────────────────────
function visibleCols() {
  const chks = {
    ts:     true,
    key:    document.getElementById('chk-key').checked,
    cell:   document.getElementById('chk-cell').checked,
    ca:     document.getElementById('chk-ca').checked,
    device: document.getElementById('chk-device').checked,
    conn:   document.getElementById('chk-conn').checked,
  };
  return COLS.filter(c => c.always || chks[c.key]);
}

// ── Render ───────────────────────────────────────────────────────────────────
function formatTS(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getCellValue(entry, col) {
  if (col.field === '__ts') return formatTS(entry.ts);
  return entry.d[col.field] ?? '—';
}

function getSortKey(entry, col) {
  if (col.field === '__ts') return entry.ts;
  const val = entry.d[col.field];
  if (col.numeric) {
    const n = parseNum(val);
    return isNaN(n) ? -Infinity : n;
  }
  return (val ?? '').toLowerCase();
}

function buildHeader(cols) {
  const tr = document.createElement('tr');
  cols.forEach((col, i) => {
    const th = document.createElement('th');
    th.textContent = col.label;
    if (i === sortCol) th.classList.add(sortDir === 1 ? 'sorted-asc' : 'sorted-desc');
    th.addEventListener('click', () => {
      if (sortCol === i) { sortDir *= -1; }
      else { sortCol = i; sortDir = col.field === '__ts' ? -1 : -1; }
      render();
    });
    tr.appendChild(th);
  });
  return tr;
}

function buildRow(entry, cols) {
  const tr = document.createElement('tr');
  cols.forEach(col => {
    const td = document.createElement('td');
    const raw = getCellValue(entry, col);
    td.textContent = raw;

    if (col.field === '__ts') {
      td.classList.add('ts-col');
    } else if (col.numeric) {
      td.classList.add('num');
    }

    if (col.quality) {
      const n = parseNum(raw);
      if (!isNaN(n)) td.classList.add(col.quality(n));
    }
    tr.appendChild(td);
  });
  return tr;
}

function updateSummary(latest) {
  if (!latest) return;
  const d = latest.d;

  function set(id, field, qFn) {
    const el = document.getElementById(id);
    const raw = d[field] ?? '—';
    el.textContent = raw;
    el.className = 'metric-value';
    if (qFn && raw !== '—') {
      const n = parseNum(raw);
      if (!isNaN(n)) el.classList.add(qFn(n));
      else el.classList.add('q-neutral');
    } else {
      el.classList.add('q-neutral');
    }
  }

  set('sum-rsrp',   'RSRP',             qualityRSRP);
  set('sum-rsrq',   'RSRQ',             qualityRSRQ);
  set('sum-sinr',   'SINR',             qualitySINR);
  set('sum-rssi',   'Síla signálu',     qualityRSSI);
  set('sum-band',   'Kmitočtové pásmo', null);
  set('sum-bw',     'Šířka pásma',      null);
  set('sum-dl',     'DL rychlost',      null);
  set('sum-ul',     'UL rychlost',      null);
  set('sum-status', 'Stav',             null);
}

function render() {
  const cols = visibleCols();

  // Sort
  displayed = [...allLog].sort((a, b) => {
    const ka = getSortKey(a, cols[sortCol]);
    const kb = getSortKey(b, cols[sortCol]);
    if (ka < kb) return -sortDir;
    if (ka > kb) return  sortDir;
    return 0;
  });

  const noDataEl  = document.getElementById('no-data');
  const table     = document.getElementById('log-table');
  const thead     = document.getElementById('log-thead');
  const tbody     = document.getElementById('log-tbody');

  if (allLog.length === 0) {
    noDataEl.style.display = '';
    table.style.display    = 'none';
    return;
  }

  noDataEl.style.display = 'none';
  table.style.display    = '';

  // Header
  thead.innerHTML = '';
  thead.appendChild(buildHeader(cols));

  // Rows (limit to 500 for performance; CSV export has all)
  tbody.innerHTML = '';
  const rows = displayed.slice(0, 500);
  const frag = document.createDocumentFragment();
  rows.forEach(entry => frag.appendChild(buildRow(entry, cols)));
  tbody.appendChild(frag);

  // Entry count
  document.getElementById('entry-count').textContent =
    `${allLog.length} entries${allLog.length > 500 ? ' (showing latest 500)' : ''}`;

  // Summary bar shows the most recent entry (highest ts)
  const latest = allLog.reduce((a, b) => (a.ts > b.ts ? a : b), allLog[0]);
  updateSummary(latest);

  // Footer timestamp
  document.getElementById('footer').textContent =
    `Last update: ${formatTS(latest.ts)}  ·  Logged since: ${formatTS(allLog[0].ts)}`;
}

// ── CSV export ───────────────────────────────────────────────────────────────
function exportCSV() {
  if (allLog.length === 0) return;

  const allFields = ['__ts', ...Object.keys(allLog[0].d)];
  const header = allFields.map(f => f === '__ts' ? 'Timestamp' : `"${f}"`).join(',');

  const rows = allLog.map(entry => {
    return allFields.map(f => {
      const v = f === '__ts' ? formatTS(entry.ts) : (entry.d[f] ?? '');
      // Escape commas and quotes
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',');
  });

  const csv = [header, ...rows].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `lte_log_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Debug panel ──────────────────────────────────────────────────────────────
function updateDebug(dbg) {
  if (!dbg) {
    document.getElementById('dbg-last').textContent    = 'no messages received yet';
    document.getElementById('dbg-frame').textContent   = '—';
    document.getElementById('dbg-frameid').textContent = '—';
    document.getElementById('dbg-total').textContent   = '0';
    return;
  }
  document.getElementById('dbg-last').textContent =
    dbg.lastReceived ? formatTS(dbg.lastReceived) : '—';
  document.getElementById('dbg-frame').textContent   = dbg.lastFrameUrl ?? '—';
  document.getElementById('dbg-frameid').textContent = dbg.lastFrameId ?? '—';
  document.getElementById('dbg-total').textContent   = dbg.totalStored ?? '0';
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load stored log + debug info
  chrome.runtime.sendMessage({ type: 'GET_LOG' }, response => {
    allLog = response?.log ?? [];
    updateDebug(response?.debug ?? null);
    render();
  });

  // Controls
  document.getElementById('btn-export').addEventListener('click', exportCSV);

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Clear all logged data?')) return;
    chrome.runtime.sendMessage({ type: 'CLEAR_LOG' }, () => {
      allLog = [];
      updateDebug(null);
      render();
    });
  });

  ['chk-key', 'chk-cell', 'chk-ca', 'chk-device', 'chk-conn'].forEach(id => {
    document.getElementById(id).addEventListener('change', render);
  });
});
