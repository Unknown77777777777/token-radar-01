/* Token Radar — renders window.RADAR. No network: no fetch, no imports. */
(function () {
  'use strict';
  var DATA = window.RADAR || { rows: [], live: [], watchlist: [], counts: {}, as_of: '', source: '' };
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });

  var state = { sortKey: 'rank', sortDir: 1, q: '', category: '', chain: '', watchOnly: false, minTvl: 0 };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function moneyFull(n) {
    if (n == null) return '—';
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function pct(n) {
    if (n == null) return '—';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(2) + '%</span>';
  }
  function ageText(n) { return n == null ? 'unknown' : n + 'd'; }

  function fillMeta() {
    var c = DATA.counts || {};
    $('meta').innerHTML =
      'As of <b>' + esc(DATA.as_of) + '</b> · source <b>DefiLlama</b><br>' +
      '<b>' + (c.snapshot || 0) + '</b> protocols in snapshot · <b>' + (c.watchlist || 0) + '</b> on the watchlist<br>' +
      '<b>' + (c.board || 0) + '</b> board rows · <b>' + (c.live || 0) + '</b> live tokens<br>' +
      '<span class="model-tag">model ' + esc(DATA.model_version || 'radar-2') + '</span>';
  }

  function fillFilters() {
    var cats = {}, chains = {};
    DATA.rows.forEach(function (r) {
      if (r.category) cats[r.category] = true;
      (r.chains || []).forEach(function (ch) { chains[ch] = true; });
    });
    var catSel = $('f-category'), chainSel = $('f-chain');
    Object.keys(cats).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
    });
    Object.keys(chains).sort().forEach(function (c) {
      var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
    });
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watchOnly && !WATCH[r.slug]) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) === -1) return false;
      if (state.minTvl > 0 && r.tvl_usd < state.minTvl) return false;
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var key = state.sortKey, dir = state.sortDir;
    rows.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av == null && bv == null) return a.slug < b.slug ? -1 : 1;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return dir * (av < bv ? -1 : av > bv ? 1 : 0);
      return dir * (av - bv) || (a.slug < b.slug ? -1 : 1);
    });
    return rows;
  }

  function renderBoard() {
    var rows = filteredRows();
    var body = $('board-body');
    var html = '';
    rows.forEach(function (r) {
      var m = r.model || {};
      html += '<tr data-slug="' + esc(r.slug) + '">' +
        '<td>' + r.rank + '</td>' +
        '<td class="prot"><b>' + esc(r.name) + '</b>' +
          (WATCH[r.slug] ? '<span class="badge">Watchlist</span>' : '') +
          '<div class="sub">' + esc(r.slug) + ' · ' + esc(r.category || '—') + ' · ' + esc((r.chains || []).join(', ')) + '</div></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num implied">' + money(r.implied_value_usd) + '</td>' +
        '<td class="modelcell">' + (m.growth_multiplier != null ? m.growth_multiplier.toFixed(3) : '—') + ' × ' +
          (m.maturity_multiplier != null ? m.maturity_multiplier.toFixed(3) : '—') + ' × ' +
          (m.reach_multiplier != null ? m.reach_multiplier.toFixed(3) : '—') + '</td>' +
        '</tr>';
    });
    body.innerHTML = html || '<tr><td colspan="7">No protocols match these filters.</td></tr>';
    $('resultline').textContent = rows.length + ' of ' + DATA.rows.length + ' board rows shown.';
    document.querySelectorAll('#board th.sortable').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sortKey);
      var arrow = th.getAttribute('data-sort') === state.sortKey ? (state.sortDir === 1 ? ' ▲' : ' ▼') : '';
      th.textContent = th.textContent.replace(/ [▲▼]$/, '') + arrow;
    });
  }

  function renderLive() {
    var html = '';
    (DATA.live || []).forEach(function (r, i) {
      html += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td class="prot"><b>' + esc(r.name) + '</b>' +
          '<div class="sub">' + esc(r.slug) + ' · ' + esc(r.category || '—') + ' · ' + esc((r.chains || []).join(', ')) + '</div></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num implied">' + money(r.mcap_usd) + '</td>' +
        '<td>' + esc(r.symbol || '—') + '</td>' +
        '</tr>';
    });
    $('live-body').innerHTML = html;
  }

  function showDetail(slug) {
    var r = null;
    DATA.rows.forEach(function (row) { if (row.slug === slug) r = row; });
    if (!r) return;
    var m = r.model || {};
    var steps = (r.farm_steps || []).map(function (s) {
      var parts = s.split('Cost:');
      var head = parts[0] || s;
      var rest = parts[1] ? 'Cost:' + parts[1] : '';
      return '<li>' + esc(head.trim()) + (rest ? ' <span class="cost">' + esc(rest.trim()) + '</span>' : '') + '</li>';
    }).join('');
    $('detail').innerHTML =
      '<div class="card">' +
      '<h2>' + esc(r.name) + (WATCH[r.slug] ? '<span class="badge">Watchlist</span>' : '<span class="badge early">Early row</span>') + '</h2>' +
      '<div class="facts"><span>slug <b>' + esc(r.slug) + '</b></span>' +
      '<span>category <b>' + esc(r.category || '—') + '</b></span>' +
      '<span>chains <b>' + esc((r.chains || []).join(', ')) + '</b></span>' +
      '<span>rank <b>#' + r.rank + ' of ' + DATA.rows.length + '</b></span></div>' +
      '<div class="facts"><span>TVL <b>' + moneyFull(r.tvl_usd) + '</b></span>' +
      '<span>7d <b>' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '%') + '</b></span>' +
      '<span>age <b>' + ageText(r.age_days) + '</b></span>' +
      '<span>listed <b>' + esc(r.listed_at || '—') + '</b></span></div>' +
      '<p>Implied value <span class="big">' + moneyFull(r.implied_value_usd) + '</span></p>' +
      '<h3>Model breakdown (radar-2)</h3>' +
      '<table class="modeltab"><tbody>' +
      '<tr><td>Base = TVL × 0.25</td><td class="num">' + moneyFull(r.tvl_usd * 0.25) + '</td></tr>' +
      '<tr><td>Growth multiplier (7d ' + (r.change_7d == null ? '—' : r.change_7d.toFixed(2) + '%') + ' → ' + (m.growth_pct != null ? m.growth_pct.toFixed(2) + '%' : '—') + ' clamped)</td><td class="num">' + (m.growth_multiplier != null ? m.growth_multiplier.toFixed(4) : '—') + '</td></tr>' +
      '<tr><td>Maturity multiplier (age ' + ageText(r.age_days) + ')</td><td class="num">' + (m.maturity_multiplier != null ? m.maturity_multiplier.toFixed(4) : '—') + '</td></tr>' +
      '<tr><td>Reach multiplier (' + (r.chains || []).length + ' chains)</td><td class="num">' + (m.reach_multiplier != null ? m.reach_multiplier.toFixed(4) : '—') + '</td></tr>' +
      '<tr><td><b>Implied value</b></td><td class="num implied"><b>' + moneyFull(r.implied_value_usd) + '</b></td></tr>' +
      '</tbody></table>' +
      '<h3>Farm plan — 6 steps</h3>' +
      '<ol class="plan">' + steps + '</ol>' +
      '<p class="note">Implied value is this entry\'s own claim. It does not predict whether or when a token is issued.</p>' +
      '</div>';
    $('view-board').hidden = true;
    $('view-live').hidden = true;
    $('view-model').hidden = true;
    $('view-detail').hidden = false;
    window.scrollTo(0, 0);
  }

  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
    $('view-board').hidden = name !== 'board';
    $('view-live').hidden = name !== 'live';
    $('view-model').hidden = name !== 'model';
    $('view-detail').hidden = true;
    if (name === 'board') renderBoard();
    if (name === 'live') renderLive();
  }

  function bind() {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); });
    });
    $('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
    $('f-category').addEventListener('change', function (e) { state.category = e.target.value; renderBoard(); });
    $('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
    $('f-watchlist').addEventListener('change', function (e) { state.watchOnly = e.target.checked; renderBoard(); });
    $('f-mintvl').addEventListener('input', function (e) {
      var v = parseFloat(e.target.value);
      state.minTvl = Number.isFinite(v) && v > 0 ? v : 0;
      renderBoard();
    });
    $('reset').addEventListener('click', function () {
      state = { sortKey: 'rank', sortDir: 1, q: '', category: '', chain: '', watchOnly: false, minTvl: 0 };
      $('q').value = ''; $('f-category').value = ''; $('f-chain').value = '';
      $('f-watchlist').checked = false; $('f-mintvl').value = '';
      renderBoard();
    });
    document.querySelectorAll('#board th.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (state.sortKey === key) { state.sortDir = -state.sortDir; }
        else { state.sortKey = key; state.sortDir = key === 'rank' ? 1 : -1; }
        renderBoard();
      });
    });
    $('board-body').addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-slug]');
      if (tr) showDetail(tr.getAttribute('data-slug'));
    });
    $('back').addEventListener('click', function () { showTab('board'); });
  }

  fillMeta();
  fillFilters();
  bind();
  renderBoard();
  renderLive();
})();
