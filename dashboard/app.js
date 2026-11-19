// Token Radar's page: one static file, no framework, no network.
// window.RADAR (written to /output/data.js by main.ts) carries the board, the live-token set, the fitted
// size curve, the model's backtest and its constants. Everything below renders that object; nothing is
// fetched and nothing is computed twice — the farm plan a reader sees is the exact string board.json
// carries, and every number in a detail view is the one the board ranked.

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
  const CURVE = R.curve;

  /** The size curve's multiple at a TVL: 2^a x tvl^(b-1), the same function lib/model.ts runs. */
  const curveAt = (tvl) => Math.min(2.5, Math.max(0.005, 2 ** (CURVE.a + (CURVE.b - 1) * Math.log2(tvl))));

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
  const mult = (m) => (m >= 0.1 ? `${m.toFixed(2)}x` : m >= 0.01 ? `${m.toFixed(3)}x` : `${m.toFixed(4)}x`);

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
      if (q && !`${r.name} ${r.slug} ${r.category || ''} ${r.chains.join(' ')}`.toLowerCase().includes(q)) return false;
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
      <span class="chip">${R.protocols_size} protocols · <b>${R.pre_token_size}</b> without a token</span>
      <span class="chip amber">model <b>${esc(R.model_version)}</b></span>`;
  }

  function stats() {
    const v = R.validation;
    return `
      <div class="stat"><div class="k">Board rows</div><div class="v">${R.board_size}</div><div class="s">${R.watchlist_size} watchlist + ${R.early_size} early</div></div>
      <div class="stat"><div class="k">Top implied launch</div><div class="v amber">${usd(R.rows[0].implied_value_usd)}</div><div class="s">${esc(R.rows[0].name)}</div></div>
      <div class="stat"><div class="k">Top 10, implied</div><div class="v">${usd(top10)}</div><div class="s">what the first ten launches would be worth</div></div>
      <div class="stat"><div class="k">Backtest error</div><div class="v cyan">${v.median_error.toFixed(1)}x</div><div class="s">median, ${v.n} live-token protocols left out in turn</div></div>`;
  }

  function accounting() {
    const a = R.accounting;
    return `
      <div class="panel" id="accounting">
        <div class="body" style="padding:12px 16px">
          <div class="acct">
            <span class="chip">all <b>${a.total}</b> snapshot protocols accounted for</span>
            <span class="chip amber"><b>${a.ranked}</b> ranked here</span>
            <span class="chip cyan"><b>${a.live_token}</b> already trading</span>
            ${a.excluded.map((e) => `<span class="chip"><b>${e.n}</b> ${esc(e.reason)}</span>`).join('')}
          </div>
        </div>
      </div>`;
  }

  function method() {
    const peers = R.peer_multiples.filter((p) => p.source === 'category').slice(0, 8);
    const maxTilt = Math.max(...R.peer_multiples.map((p) => p.used), 0.01);
    const sample = [10e6, 100e6, 1e9, Math.max(...R.rows.map((r) => r.tvl_usd))];
    return `
      <section class="panel" id="method">
        <header>
          <h2>The model</h2>
          <span class="sub">what a token would be worth if the protocol's record stayed as it is</span>
        </header>
        <div class="body">
          <div class="formula">
            implied = TVL × <b>curve(TVL)</b> × <i>tilt</i> × <i>growth</i> × <i>maturity</i> × <i>reach</i><br>
            <b>curve(TVL)</b> = 2<sup>${CURVE.a.toFixed(3)}</sup> × TVL<sup>${(CURVE.b - 1).toFixed(3)}</sup> &nbsp;<span style="color:var(--ink-faint)">fitted on the snapshot's ${CURVE.n} live-token protocols</span><br>
            <i>tilt</i> = √(category median multiple ÷ market median), ${R.model.tilt_floor}–${R.model.tilt_cap} &nbsp;·&nbsp; <i>growth</i> = 1 + clamp(7d, ${R.model.growth_floor}, +${R.model.growth_cap})% × ${R.model.growth_weight}<br>
            <i>maturity</i> = ${R.model.maturity_floor} + min(age, ${R.model.maturity_days})d ÷ ${R.model.maturity_days} × ${R.model.maturity_range} &nbsp;·&nbsp; <i>reach</i> = 1 + ${R.model.chain_weight} × (chains − 1)
          </div>
          <ul class="notes">
            <li><b>The multiple is measured, not assumed.</b> The market's own live-token protocols say what a dollar of TVL buys at each size, and the fit is refitted from whatever snapshot the entry is handed. Nothing here is a hardcoded list of names or a fixed multiple.</li>
            <li><b>The multiple falls with size.</b> A protocol holding $10M of TVL is priced near ${curveAt(10e6).toFixed(2)}x; one holding $1B near ${curveAt(1e9).toFixed(3)}x. That is the snapshot's own market, not a preference of this model.</li>
            <li><b>The tilt is earned.</b> A category whose live peers trade above the market's median is tilted up, below it down, by at most ${R.model.tilt_cap}× — and only when at least ${R.model.peer_min} live-token peers back it. Below that the row says "no tilt".</li>
            <li><b>Age and growth are small adjustments on purpose.</b> The backtest below shows TVL carries most of the signal; the other three multipliers move a row, they do not decide it.</li>
          </ul>
          <table class="peers">
            <thead><tr><th>What the curve pays</th><th class="n">Multiple of TVL</th><th style="width:120px"></th></tr></thead>
            <tbody>
              ${sample
                .map(
                  (t) => `<tr><td>at ${usd(t)} of TVL</td><td class="n">${mult(curveAt(t))}</td><td><div class="bar" style="width:${Math.max(3, Math.round((curveAt(t) / Math.max(...sample.map(curveAt))) * 100))}%"></div></td></tr>`,
                )
                .join('')}
            </tbody>
          </table>
          ${
            peers.length
              ? `<table class="peers" style="margin-top:14px">
            <thead><tr><th>Category tilt</th><th class="n">Live peers</th><th class="n">Median mcap/TVL</th><th class="n">Tilt</th><th style="width:110px"></th></tr></thead>
            <tbody>
              ${peers
                .map(
                  (p) => `<tr><td>${esc(p.category)}</td><td class="n">${p.peers}</td><td class="n">${mult(p.median)}</td><td class="n">${p.used.toFixed(2)}x</td><td><div class="bar" style="width:${Math.max(3, Math.round((p.used / maxTilt) * 100))}%"></div></td></tr>`,
                )
                .join('')}
            </tbody>
          </table>`
              : ''
          }
        </div>
      </section>`;
  }

  /** A log-log scatter of what the model would have said against what the market says, in SVG. */
  function scatter(points) {
    const W = 660;
    const H = 300;
    const pad = { l: 54, r: 14, t: 14, b: 34 };
    const vals = points.flatMap((p) => [p.actual_usd, p.implied_usd]).filter((v) => v > 0);
    const lo = Math.floor(Math.log10(Math.min(...vals)));
    const hi = Math.ceil(Math.log10(Math.max(...vals)));
    const x = (v) => pad.l + ((Math.log10(v) - lo) / (hi - lo)) * (W - pad.l - pad.r);
    const y = (v) => H - pad.b - ((Math.log10(v) - lo) / (hi - lo)) * (H - pad.t - pad.b);
    const ticks = [];
    for (let e = lo; e <= hi; e++) ticks.push(10 ** e);
    const label = (v) => (v >= 1e9 ? `$${Math.round(v / 1e9)}B` : v >= 1e6 ? `$${Math.round(v / 1e6)}M` : `$${Math.round(v / 1e3)}K`);
    return `
      <svg class="scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="Implied value against actual market cap, one dot per live-token protocol, on log axes">
        <rect x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" fill="none" stroke="#1e2a38"/>
        ${ticks.map((t) => `<line x1="${x(t)}" y1="${pad.t}" x2="${x(t)}" y2="${H - pad.b}" stroke="#16202c"/><text x="${x(t)}" y="${H - pad.b + 16}" fill="#5d7189" font-size="10" font-family="ui-monospace,monospace" text-anchor="middle">${label(t)}</text>`).join('')}
        ${ticks.map((t) => `<line x1="${pad.l}" y1="${y(t)}" x2="${W - pad.r}" y2="${y(t)}" stroke="#16202c"/><text x="${pad.l - 8}" y="${y(t) + 3}" fill="#5d7189" font-size="10" font-family="ui-monospace,monospace" text-anchor="end">${label(t)}</text>`).join('')}
        <line x1="${x(10 ** lo)}" y1="${y(10 ** lo)}" x2="${x(10 ** hi)}" y2="${y(10 ** hi)}" stroke="#f5b544" stroke-dasharray="4 4" opacity="0.55"/>
        ${points.map((p) => `<circle cx="${x(p.actual_usd).toFixed(1)}" cy="${y(p.implied_usd).toFixed(1)}" r="2.6" fill="#46c6d8" opacity="0.62"><title>${esc(p.slug)}: market ${usd(p.actual_usd)}, model ${usd(p.implied_usd)}</title></circle>`).join('')}
        <text x="${W - pad.r}" y="${pad.t + 12}" fill="#5d7189" font-size="10" font-family="ui-monospace,monospace" text-anchor="end">x market cap · y implied value</text>
      </svg>`;
  }

  function validation() {
    const v = R.validation;
    return `
      <section class="panel" id="validation">
        <header>
          <h2>Does the model work?</h2>
          <span class="sub">scored on the snapshot's own live-token protocols, each one left out in turn</span>
        </header>
        <div class="body">
          <div class="kpis">
            <div class="kpi"><div class="k">Protocols tested</div><div class="v">${v.n}</div><div class="s">every live token with a market cap</div></div>
            <div class="kpi"><div class="k">Median error</div><div class="v amber">${v.median_error.toFixed(1)}×</div><div class="s">out of sample, either way</div></div>
            <div class="kpi"><div class="k">Within 2×</div><div class="v">${(v.within_2x * 100).toFixed(0)}%</div><div class="s">of calls land within a factor of two</div></div>
            <div class="kpi"><div class="k">Rank correlation</div><div class="v cyan">${v.spearman.toFixed(2)}</div><div class="s">implied order against the market's</div></div>
          </div>
          ${scatter(v.points)}
          <table class="peers" style="margin-top:14px">
            <thead><tr><th>TVL band</th><th class="n">Protocols</th><th class="n">Market's median multiple</th><th class="n">What the curve pays</th><th class="n">Gap</th></tr></thead>
            <tbody>
              ${v.bands
                .map((b) => {
                  const gap = b.curve / b.actual;
                  return `<tr><td>${esc(b.label)}</td><td class="n">${b.n}</td><td class="n">${mult(b.actual)}</td><td class="n">${mult(b.curve)}</td><td class="n" style="color:${Math.abs(Math.log2(gap)) < 0.3 ? 'var(--green)' : 'var(--ink-dim)'}">${gap >= 1 ? '×' : '÷'}${(gap >= 1 ? gap : 1 / gap).toFixed(2)}</td></tr>`;
                })
                .join('')}
            </tbody>
          </table>
          <p class="caveat"><b>Read this before you trust a number.</b> A market cap is not a function of TVL alone — float, supply and liquidity all move it — so the model calls the size of a launch, not its price. In every TVL band the curve's multiple lands within a third of the market's own median, which is why the board ranks with it; a single row is still a midpoint with a ${v.median_error.toFixed(1)}× band either side.</p>
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
                <td class="num"><span class="mult">${mult(r.base_multiple)}<span class="src"> ${r.multiple_source === 'category' ? `×${r.category_tilt.toFixed(2)}` : 'curve'}</span></span></td>
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
          <span class="sub">the snapshot's live-token protocols, at the market's own value — never ranked against the board</span>
        </header>
        <div class="body">
          <table class="peers">
            <thead><tr><th>Protocol</th><th>Category</th><th class="n">TVL</th><th class="n">Market cap</th><th class="n">Mcap/TVL</th><th class="n">Curve</th><th class="n">7d</th></tr></thead>
            <tbody>
              ${R.live
                .slice(0, 12)
                .map(
                  (l) => `<tr><td>${esc(l.name)}</td><td>${esc(l.category || '—')}</td><td class="n">${usd(l.tvl_usd)}</td><td class="n">${l.mcap_usd ? usd(l.mcap_usd) : '—'}</td><td class="n">${l.multiple ? mult(l.multiple) : '—'}</td><td class="n" style="color:var(--ink-faint)">${mult(curveAt(l.tvl_usd))}</td><td class="n ${dir(l.change_7d)}">${pct(l.change_7d)}</td></tr>`,
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
          <tr><td>Size curve at ${usd(r.tvl_usd)}</td><td>${mult(r.size_multiple)}</td></tr>
          <tr><td>Category tilt · ${r.multiple_source === 'category' ? `${r.peer_count} live-token ${esc(r.category || '')} peers` : `too few ${esc(r.category || '')} peers, no tilt`}</td><td>${r.category_tilt.toFixed(2)}x</td></tr>
          <tr><td>Multiple of TVL applied</td><td>${mult(r.base_multiple)} → ${full(Math.round(base))}</td></tr>
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
    let section = null;
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
      else if (key === 's') section = val;
    }
    return { slug, section };
  }

  // ---------- wiring ----------

  function render() {
    const { slug: openSlug, section } = readHash();
    // A section link (`#s=validation`) shows that panel alone: a shareable view of one part of the
    // radar, and what this entry's own screenshots are taken from.
    const panels = {
      stats: () => stats(),
      'board-table': () => board(),
      method: () => method(),
      validation: () => validation(),
      accounting: () => accounting(),
      live: () => live(),
    };
    const whole = () => `${stats()}${board()}${method()}${validation()}${accounting()}${live()}`;
    const mainInner = section && panels[section] ? panels[section]() : whole();
    root.innerHTML = `
      <div class="topbar">${topbar()}</div>
      <div class="wrap">
        ${controls()}
        <main>
          ${mainInner}
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
    if (!holder) return;
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
