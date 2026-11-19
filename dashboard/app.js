// Token Radar's page: one static file, no framework, no network.
// window.RADAR (written to /output/data.js by main.ts) carries the board, the live-token set, the peer
// table and the model's constants. Everything below renders that object; nothing is fetched and nothing
// is computed twice — the farm plan a reader sees is the exact string board.json carries.

(() => {
  'use strict';

  const R = window.RADAR;
  const root = document.getElementById('board');
  if (!R) {
    root.innerHTML = '<p class="empty"><b>No data.</b> data.js did not load, so there is no board to show.</p>';
    return;
  }

  const state = { q: '', cat: '', chain: '', watchlist: false, sort: 'rank', asc: true };
  const MAX = Math.max(...R.rows.map((r) => r.implied_value_usd), 1);
  const top10 = R.rows.slice(0, 10).reduce((n, r) => n + r.implied_value_usd, 0);

  // ---------- formatting ----------

  const usd = (n) => {
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${Math.round(n)}`;
  };
  const full = (n) => `$${n.toLocaleString('en-US')}`;
  const pct = (n) => (n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
  const dir = (n) => (n === null ? 'flat' : n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat');
  const days = (n) => (n === null ? '—' : n >= 365 ? `${(n / 365).toFixed(1)}y` : `${n}d`);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** "action Cost: $150 of capital. Time: 15 minutes." -> [action, cost, time] */
  function splitStep(s) {
    const at = s.indexOf(' Cost: ');
    if (at < 0) return [s, '', ''];
    const head = s.slice(0, at);
    const rest = s.slice(at + 7);
    const t = rest.lastIndexOf('. Time: ');
    if (t < 0) return [head, rest.replace(/\.$/, ''), ''];
    return [head, rest.slice(0, t), rest.slice(t + 8).replace(/\.$/, '')];
  }

  // ---------- filtering and sorting ----------

  const categories = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();

  function visible() {
    const q = state.q.trim().toLowerCase();
    let rows = R.rows.filter((r) => {
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && !r.chains.includes(state.chain)) return false;
      if (state.watchlist && !r.watchlist) return false;
      if (q && !(`${r.name} ${r.slug} ${r.category || ''} ${r.chains.join(' ')}`.toLowerCase().includes(q))) return false;
      return true;
    });
    const key = state.sort;
    const val = (r) => (key === 'rank' ? r.rank : key === 'tvl_usd' ? r.tvl_usd : key === 'change_7d' ? (r.change_7d ?? -1e9) : key === 'age_days' ? (r.age_days ?? -1) : r.implied_value_usd);
    rows = rows.slice().sort((a, b) => (val(a) - val(b)) * (state.asc ? 1 : -1));
    return rows;
  }

  // ---------- the shell ----------

  function topbar() {
    return `
      <div class="brand">
        <span class="mark">◎</span>
        <span class="name">Token Radar</span>
        <span class="tag">pre-token protocols, ranked by what a launch would be worth</span>
      </div>
      <span class="spacer"></span>
      <span class="chip cyan">snapshot <b>${esc(R.as_of)}</b></span>
      <span class="chip">${esc(String(R.protocols_size))} protocols · <b>${esc(String(R.pre_token_size))}</b> without a token</span>
      <span class="chip amber">model <b>${esc(R.model_version)}</b></span>`;
  }

  function stats() {
    return `
      <div class="stat"><div class="k">Board rows</div><div class="v">${R.board_size}</div><div class="s">${R.watchlist_size} watchlist + ${R.early_size} early</div></div>
      <div class="stat"><div class="k">Top implied launch</div><div class="v amber">${usd(R.rows[0].implied_value_usd)}</div><div class="s">${esc(R.rows[0].name)}</div></div>
      <div class="stat"><div class="k">Top 10, implied</div><div class="v">${usd(top10)}</div><div class="s">what the first ten launches would be worth</div></div>
      <div class="stat"><div class="k">Market multiple</div><div class="v cyan">${R.global_multiple.toFixed(2)}x</div><div class="s">median market cap per $1 of TVL, live-token peers</div></div>`;
  }

  function method() {
    const peers = R.peer_multiples.slice(0, 10);
    const maxUsed = Math.max(...R.peer_multiples.map((p) => p.used), 0.01);
    return `
      <section class="panel" id="method">
        <header>
          <h2>The model</h2>
          <span class="sub">implied value of a token that does not exist yet, from the snapshot's own figures</span>
        </header>
        <div class="body">
          <div class="formula">
            implied = TVL × <b>peerMultiple</b> × <i>growth</i> × <i>maturity</i> × <i>reach</i><br>
            <b>peerMultiple</b> = median(mcap ÷ TVL) of the category's live-token peers, at least ${R.model.peer_min} of them<br>
            <i>growth</i> = 1 + clamp(change_7d, ${R.model.growth_floor}, +${R.model.growth_cap})% × ${R.model.growth_weight} &nbsp;·&nbsp; <i>maturity</i> = ${R.model.maturity_floor} + min(age, ${R.model.maturity_days})d ÷ ${R.model.maturity_days} × ${R.model.maturity_range} &nbsp;·&nbsp; <i>reach</i> = 1 + ${R.model.chain_weight} × (chains − 1)
          </div>
          <ul class="notes">
            <li>Every multiple is measured inside the snapshot: the live-token protocols in the same category are what the market already pays for one dollar of that kind of TVL. No name is special-cased.</li>
            <li>A category with fewer than ${R.model.peer_min} live-token peers is priced at the whole market's ${R.global_multiple.toFixed(2)}x, and the row says so — one outlier never sets a category's price.</li>
            <li>Protocols whose token already trades are never ranked: they are the market's own values, listed apart at the foot of the page.</li>
            <li>Age counts the days the protocol has run with no token: the longer it has held deposits without issuing one, the more of a launch its TVL implies.</li>
          </ul>
          <table class="peers">
            <thead><tr><th>Category</th><th class="n">Live peers</th><th class="n">Median mcap/TVL</th><th class="n">Multiple used</th><th style="width:110px"></th></tr></thead>
            <tbody>
              ${peers
                .map(
                  (p) => `<tr>
                    <td>${esc(p.category)}${p.source === 'market' ? ' <span class="pill" style="font-size:10px">market</span>' : ''}</td>
                    <td class="n">${p.peers}</td>
                    <td class="n">${p.median.toFixed(2)}x</td>
                    <td class="n">${p.used.toFixed(2)}x</td>
                    <td><div class="bar" style="width:${Math.max(2, Math.round((p.used / maxUsed) * 100))}%"></div></td>
                  </tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  function controls() {
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    return `
      <aside class="rail">
        <h2>Filter</h2>
        <div class="field">
          <label for="q">Search</label>
          <input id="q" type="search" placeholder="protocol, slug, chain…" value="${esc(state.q)}" autocomplete="off">
        </div>
        <div class="field">
          <label for="cat">Category</label>
          <select id="cat">${opt('', `All ${categories.length} categories`, state.cat)}${categories.map((c) => opt(c, c, state.cat)).join('')}</select>
        </div>
        <div class="field">
          <label for="chain">Chain</label>
          <select id="chain">${opt('', `All ${chains.length} chains`, state.chain)}${chains.map((c) => opt(c, c, state.chain)).join('')}</select>
        </div>
        <div class="field">
          <label for="sort">Sort by</label>
          <select id="sort">
            ${opt('rank', 'Rank (the model’s order)', state.sort)}
            ${opt('implied_value_usd', 'Implied value', state.sort)}
            ${opt('tvl_usd', 'TVL', state.sort)}
            ${opt('change_7d', '7-day growth', state.sort)}
            ${opt('age_days', 'Days without a token', state.sort)}
          </select>
        </div>
        <label class="toggle"><input id="wl" type="checkbox"${state.watchlist ? ' checked' : ''}> Watchlist only (${R.watchlist_size})</label>
        <button class="btn" id="reset">Reset filters</button>
        <p class="hint">Press <kbd>/</kbd> to search, <kbd>Esc</kbd> to close a protocol. Click any row for its model breakdown and its farm plan.</p>
      </aside>`;
  }

  function board() {
    const rows = visible();
    const head = (key, label, num) =>
      `<th class="${num ? 'num' : ''}"><button data-sort="${key}">${label}${state.sort === key ? `<span class="arrow">${state.asc ? '▲' : '▼'}</span>` : ''}</button></th>`;
    return `
      <section class="panel" id="board-table">
        <header>
          <h2>The board</h2>
          <span class="sub">ranked by implied launch value, best first</span>
          <span class="spacer"></span>
          <span class="count" id="count">${rows.length} of ${R.board_size} rows</span>
        </header>
        <div class="tablewrap">
          ${
            rows.length === 0
              ? '<p class="empty"><b>Nothing matches.</b> Clear a filter to see the board again.</p>'
              : `<table class="board">
            <thead><tr>
              ${head('rank', 'Rank', false)}
              <th>Protocol</th>
              <th>Category</th>
              <th>Chains</th>
              ${head('tvl_usd', 'TVL', true)}
              ${head('change_7d', '7d', true)}
              ${head('age_days', 'No token for', true)}
              <th class="num">Multiple</th>
              ${head('implied_value_usd', 'Implied launch value', true)}
            </tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `<tr tabindex="0" data-slug="${esc(r.slug)}">
                <td><span class="rank${r.rank <= 3 ? ' top' : ''}">${r.rank}</span></td>
                <td><div class="pname"><span class="n">${esc(r.name)}</span><span class="s">${esc(r.slug)}</span></div></td>
                <td><span class="pill">${esc(r.category || 'Uncategorised')}</span>${r.watchlist ? ' <span class="pill wl">watchlist</span>' : ''}</td>
                <td><span class="chains">${esc(r.chains.slice(0, 2).join(', '))}${r.chains.length > 2 ? ` +${r.chains.length - 2}` : ''}</span></td>
                <td class="num">${usd(r.tvl_usd)}</td>
                <td class="num ${dir(r.change_7d)}">${pct(r.change_7d)}</td>
                <td class="num">${days(r.age_days)}</td>
                <td class="num"><span class="mult">${r.base_multiple.toFixed(2)}x<span class="src"> ${r.multiple_source === 'category' ? `n=${r.peer_count}` : 'mkt'}</span></span></td>
                <td class="num"><div class="val"><span class="num">${usd(r.implied_value_usd)}</span><span class="track"><span class="fill" style="width:${Math.max(2, Math.round((r.implied_value_usd / MAX) * 100))}%"></span></span></div></td>
              </tr>`,
                )
                .join('')}
            </tbody>
          </table>`
          }
        </div>
      </section>`;
  }

  function live() {
    return `
      <section class="panel" id="live">
        <header>
          <h2>Already trading</h2>
          <span class="sub">the snapshot's live-token protocols, shown at the market's own value — never ranked against the board</span>
        </header>
        <div class="body">
          <table class="peers">
            <thead><tr><th>Protocol</th><th>Category</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">Mcap/TVL</th><th class="n">7d</th></tr></thead>
            <tbody>
              ${R.live
                .slice(0, 12)
                .map(
                  (l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.category || '—')}</td><td class="n">${usd(l.tvl_usd)}</td><td class="n">${l.mcap_usd ? usd(l.mcap_usd) : '—'}</td><td class="n">${l.multiple ? `${l.multiple.toFixed(2)}x` : '—'}</td><td class="n ${dir(l.change_7d)}">${pct(l.change_7d)}</td></tr>`,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>`;
  }

  // ---------- the detail view ----------

  function detail(slug) {
    const r = R.rows.find((x) => x.slug === slug);
    if (!r) return '';
    const steps = r.farm_steps
      .map((s) => {
        const [action, cost, time] = splitStep(s);
        return `<li>${esc(action)}<div class="meta"><span>cost <b>${esc(cost)}</b></span><span>time <b>${esc(time)}</b></span></div></li>`;
      })
      .join('');
    const base = r.tvl_usd * r.base_multiple;
    return `
      <header>
        <div class="t">
          <h2>${esc(r.name)}</h2>
          <div class="sub">#${r.rank} · ${esc(r.slug)} · ${esc(r.category || 'Uncategorised')}</div>
        </div>
        <button class="close" id="close-detail">Close ✕</button>
      </header>
      <div class="content">
        <div class="kv">
          <div><div class="k">TVL</div><div class="v">${usd(r.tvl_usd)}</div></div>
          <div><div class="k">7-day</div><div class="v ${dir(r.change_7d)}">${pct(r.change_7d)}</div></div>
          <div><div class="k">No token for</div><div class="v">${days(r.age_days)}</div></div>
        </div>
        <p class="rationale">${esc(r.rationale)}</p>
        <h3>How the number was built</h3>
        <table class="breakdown">
          <tr><td>TVL, from the snapshot</td><td>${full(r.tvl_usd)}</td></tr>
          <tr><td>Peer multiple · ${r.multiple_source === 'category' ? `${r.peer_count} live-token ${esc(r.category || '')} peers` : `whole market (too few ${esc(r.category || '')} peers)`}</td><td>${r.base_multiple.toFixed(2)}x → ${full(Math.round(base))}</td></tr>
          <tr><td>Growth multiplier · 7-day ${pct(r.change_7d)}</td><td>${r.growth_multiplier.toFixed(3)}x</td></tr>
          <tr><td>Maturity multiplier · ${days(r.age_days)} without a token</td><td>${r.maturity_multiplier.toFixed(3)}x</td></tr>
          <tr><td>Reach multiplier · ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}</td><td>${r.chain_multiplier.toFixed(3)}x</td></tr>
          <tr class="total"><td>Implied launch value</td><td>${full(r.implied_value_usd)}</td></tr>
        </table>
        <h3>Chains</h3>
        <p style="margin:0;color:var(--ink-dim);font-size:12.5px">${esc(r.chains.join(', ') || 'not recorded')}${r.listed_at ? ` · first tracked ${esc(r.listed_at)}` : ''}</p>
        <h3>How to farm it</h3>
        <ol class="steps">${steps}</ol>
      </div>`;
  }

  /** A hash carries a shareable view: `#p/<slug>` opens a protocol, and `q= cat= chain= sort= wl=1` set the filters. */
  function readHash() {
    const parts = location.hash.replace(/^#/, '').split('&');
    let slug = null;
    for (const part of parts) {
      if (part.startsWith('p/')) { slug = decodeURIComponent(part.slice(2)); continue; }
      const at = part.indexOf('=');
      if (at < 1) continue;
      const key = part.slice(0, at);
      const val = decodeURIComponent(part.slice(at + 1));
      if (key === 'q') state.q = val;
      else if (key === 'cat') state.cat = val;
      else if (key === 'chain') state.chain = val;
      else if (key === 'sort' && val) { state.sort = val; state.asc = val === 'rank'; }
      else if (key === 'wl') state.watchlist = val === '1';
    }
    return slug;
  }

  // ---------- wiring ----------

  function render() {
    const openSlug = readHash();
    root.innerHTML = `
      <div class="topbar">${topbar()}</div>
      <div class="wrap">
        ${controls()}
        <main>
          <div class="stats">${stats()}</div>
          ${board()}
          ${method()}
          ${live()}
        </main>
      </div>
      <footer class="foot">
        Source: ${esc(R.source)}. Snapshot taken ${esc(R.as_of)}; the watchlist floor is ${usd(R.floor_usd)} of TVL.
        Every figure on this page is derived from that one sealed file by <code>lib/model.ts</code>; the page fetches nothing.
        Implied value is this entry's own claim, not a prediction that a token will be issued.
      </footer>
      <div class="drawer" id="drawer" hidden></div>`;
    wireControls();
    wireBoard();
    if (openSlug) open(openSlug);
  }

  /** Controls are wired once: they outlive every board re-render. */
  function wireControls() {
    const q = document.getElementById('q');
    const cat = document.getElementById('cat');
    const chain = document.getElementById('chain');
    const sort = document.getElementById('sort');
    const wl = document.getElementById('wl');

    q.addEventListener('input', () => { state.q = q.value; refreshBoard(); });
    cat.addEventListener('change', () => { state.cat = cat.value; refreshBoard(); });
    chain.addEventListener('change', () => { state.chain = chain.value; refreshBoard(); });
    wl.addEventListener('change', () => { state.watchlist = wl.checked; refreshBoard(); });
    sort.addEventListener('change', () => { state.sort = sort.value; state.asc = sort.value === 'rank'; refreshBoard(); });
    document.getElementById('reset').addEventListener('click', () => {
      state.q = ''; state.cat = ''; state.chain = ''; state.watchlist = false; state.sort = 'rank'; state.asc = true;
      q.value = ''; cat.value = ''; chain.value = ''; wl.checked = false; sort.value = 'rank';
      refreshBoard();
    });
  }

  /** Sort headers and rows are rebuilt with the table, so they are wired on every board render. */
  function wireBoard() {
    root.querySelectorAll('th button[data-sort]').forEach((b) =>
      b.addEventListener('click', () => {
        const key = b.dataset.sort;
        if (state.sort === key) state.asc = !state.asc;
        else { state.sort = key; state.asc = key === 'rank'; }
        const sel = document.getElementById('sort');
        if (sel && [...sel.options].some((o) => o.value === key)) sel.value = key;
        refreshBoard();
      }),
    );
    root.querySelectorAll('tr[data-slug]').forEach((tr) => {
      tr.addEventListener('click', () => open(tr.dataset.slug));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(tr.dataset.slug); } });
    });
  }

  /** Re-render only the board table: filters and sorts never rebuild the rest of the page. */
  function refreshBoard() {
    const holder = document.getElementById('board-table');
    const fresh = document.createElement('div');
    fresh.innerHTML = board();
    holder.replaceWith(fresh.firstElementChild);
    wireBoard();
  }

  function open(slug) {
    const d = document.getElementById('drawer');
    const html = detail(slug);
    if (!html) return;
    d.innerHTML = html;
    d.hidden = false;
    requestAnimationFrame(() => d.classList.add('open'));
    d.querySelector('#close-detail').addEventListener('click', close);
    history.replaceState(null, '', `#p/${slug}`);
  }

  function close() {
    const d = document.getElementById('drawer');
    d.classList.remove('open');
    setTimeout(() => { d.hidden = true; }, 220);
    history.replaceState(null, '', location.pathname);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === '/' && document.activeElement !== document.getElementById('q')) {
      e.preventDefault();
      document.getElementById('q').focus();
    }
  });

  render();
})();
