/* Buffalo Bills hub — app controller. Bills Mafia, baby. 🦬 */
(function () {
  const { el, esc, fmtDate, timeAgo, countdown, setState } = window.U;
  const C = window.BILLS;

  const TABS = [
    { id: 'home', label: '🏠 Home' },
    { id: 'schedule', label: '📅 Schedule' },
    { id: 'matchup', label: '🔮 Matchup' },
    { id: 'stats', label: '📊 Stats' },
    { id: 'roster', label: '👥 Roster' },
    { id: 'standings', label: '🏆 Standings' },
    { id: 'media', label: '🎬 Media' },
    { id: 'news', label: '📰 News' },
  ];

  const data = {}; // cache of loaded snapshots, keyed by name
  let liveTimer = null;
  let countdownTimer = null;

  // ---- data loading -----------------------------------------------------

  async function snap(name) {
    try {
      const res = await fetch(C.snapshot(name), { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      data[name] = await res.json();
    } catch (e) {
      if (!data[name]) data[name] = null;
    }
    return data[name];
  }

  async function loadAll() {
    await Promise.all(
      ['team', 'schedule', 'roster', 'standings', 'news', 'game', 'injuries', 'weather', 'meta']
        .map((n) => snap(n))
    );
  }

  // ---- team state detection ---------------------------------------------

  function teamState() {
    const g = data.game || {};
    if (g.live && g.live.state === 'in') return 'live';
    if (g.live && g.live.state === 'post' && isRecent(g.live.date)) return 'post';
    if (g.next) return 'upcoming';
    return 'offseason';
  }
  const isRecent = (iso) => iso && (Date.now() - new Date(iso).getTime()) < 24 * 3600 * 1000;

  // ---- live in-game polling (direct from ESPN) --------------------------

  async function pollLive() {
    try {
      const res = await fetch(C.live.scoreboard, { cache: 'no-store' });
      if (!res.ok) return;
      const sb = await res.json();
      const ev = (sb.events || []).find((e) =>
        (e.competitions || []).some((c) => (c.competitors || []).some((t) => t.team && t.team.abbreviation === C.TEAM_ABBR)));
      if (!ev) return;
      const c = ev.competitions[0];
      const comps = c.competitors || [];
      const us = comps.find((x) => x.team.abbreviation === C.TEAM_ABBR) || {};
      const them = comps.find((x) => x.team.abbreviation !== C.TEAM_ABBR) || {};
      const st = (c.status && c.status.type) || {};
      data.game = data.game || {};
      data.game.live = Object.assign(data.game.live || {}, {
        id: ev.id, name: ev.shortName, date: ev.date,
        state: st.state, status: st, clock: c.status && c.status.displayClock, period: c.status && c.status.period,
        us: { abbr: us.team && us.team.abbreviation, score: us.score, homeAway: us.homeAway, logo: us.team && us.team.logo },
        them: { abbr: them.team && them.team.abbreviation, name: them.team && them.team.displayName, score: them.score, homeAway: them.homeAway, logo: them.team && them.team.logo },
      });
      if (st.state === 'in' || st.state === 'post') {
        try {
          const sres = await fetch(C.live.summary(ev.id), { cache: 'no-store' });
          if (sres.ok) {
            const sum = await sres.json();
            const wp = sum.winprobability && sum.winprobability[sum.winprobability.length - 1];
            if (wp) {
              const homeIsBills = us.homeAway === 'home';
              data.game.live.winProbability = Math.round((homeIsBills ? wp.homeWinPercentage : 1 - wp.homeWinPercentage) * 100);
            }
          }
        } catch (e) { /* optional */ }
      }
      if (location.hash.replace('#', '') === 'home' || !location.hash) renderHero();
    } catch (e) { /* offline / blocked — snapshots carry us */ }
  }

  function manageLivePolling() {
    const live = teamState() === 'live';
    if (live && !liveTimer) liveTimer = setInterval(pollLive, C.refresh.liveGame);
    if (!live && liveTimer) { clearInterval(liveTimer); liveTimer = null; }
  }

  // ---- header + countdown ----------------------------------------------

  function renderHeader() {
    const t = data.team || {};
    const rec = recordSummary();
    document.getElementById('record-chip').textContent = rec ? rec : (t.standingSummary || '');
    const g = data.game || {};
    const chip = document.getElementById('live-chip');
    if (g.live && g.live.state === 'in') {
      chip.className = 'live-chip live-chip--on';
      chip.innerHTML = `<span class="dot"></span> ${esc(g.live.us.abbr)} ${esc(g.live.us.score || 0)} – ${esc(g.live.them.score || 0)} ${esc(g.live.them.abbr)} · ${esc((g.live.status && g.live.status.shortDetail) || 'LIVE')}`;
    } else if (g.next) {
      chip.className = 'live-chip';
      chip.innerHTML = `NEXT: ${esc(g.next.name)}`;
    } else {
      chip.className = 'live-chip';
      chip.textContent = 'Offseason';
    }
    const m = data.meta;
    document.getElementById('updated-stamp').textContent = m && m.updatedAt ? `data ${timeAgo(m.updatedAt)}` : '';
  }

  function recordSummary() {
    // Prefer live standings (current season); fall back to team record.
    const se = data.standings && data.standings.afcEast;
    if (se) {
      const us = se.find((x) => x.abbr === C.TEAM_ABBR);
      if (us && us.wins != null) return `${us.wins}-${us.losses}${us.ties && us.ties !== '0' ? '-' + us.ties : ''}`;
    }
    const r = data.team && data.team.record && data.team.record.items && data.team.record.items[0];
    return r ? r.summary : '';
  }

  function tickCountdown() {
    const els = document.querySelectorAll('[data-countdown]');
    els.forEach((node) => {
      const cd = countdown(node.getAttribute('data-countdown'));
      if (!cd) { node.textContent = 'Kickoff!'; return; }
      node.innerHTML =
        `<span class="cd-unit"><b>${cd.d}</b><i>days</i></span>` +
        `<span class="cd-unit"><b>${String(cd.h).padStart(2, '0')}</b><i>hrs</i></span>` +
        `<span class="cd-unit"><b>${String(cd.m).padStart(2, '0')}</b><i>min</i></span>` +
        `<span class="cd-unit"><b>${String(cd.s).padStart(2, '0')}</b><i>sec</i></span>`;
    });
  }

  // ---- weather alert banner --------------------------------------------

  function billsWeatherAlert() {
    const w = data.weather;
    const banner = document.getElementById('weather-alert');
    if (!w || !w.weather || w.dome || !w.game) { banner.hidden = true; return; }
    const idx = gameHourIndex(w);
    if (idx < 0) { banner.hidden = true; return; }
    const h = w.weather.hourly;
    const temp = h.temperature_2m[idx];
    const wind = h.wind_speed_10m[idx];
    const snow = h.snowfall ? h.snowfall[idx] : 0;
    const pop = h.precipitation_probability[idx];
    let msg = null;
    if (snow > 0.1) msg = `❄️ SNOW IN THE FORECAST — ${snow.toFixed(1)}" expected at kickoff. Classic Bills weather. Bundle up, Mafia.`;
    else if (temp <= 20) msg = `🥶 FRIGID — ${Math.round(temp)}°F at kickoff. Bring the layers.`;
    else if (wind >= 25) msg = `💨 HIGH WINDS — ${Math.round(wind)} mph gusts could wreak havoc on the kicking game.`;
    else if (pop >= 70) msg = `🌧️ WET ONE — ${pop}% chance of rain at Highmark. Ball security weather.`;
    if (!msg) { banner.hidden = true; return; }
    banner.hidden = false;
    banner.textContent = msg;
  }

  // index into hourly arrays nearest the game time
  function gameHourIndex(w) {
    if (!w.weather || !w.weather.hourly || !w.game) return -1;
    const times = w.weather.hourly.time;
    const target = new Date(w.game.date).getTime();
    let best = -1, bestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(new Date(times[i]).getTime() - target);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return bestDiff < 6 * 3600 * 1000 ? best : -1;
  }

  // ---- the adaptive hero (Home) ----------------------------------------

  function renderHero() {
    const host = document.getElementById('hero');
    if (!host) return;
    const state = teamState();
    const g = data.game || {};
    if (state === 'live' && g.live) return host.replaceChildren(heroLive(g.live));
    if (state === 'post' && g.live) return host.replaceChildren(heroFinal(g.live));
    if (state === 'upcoming' && g.next) return host.replaceChildren(heroUpcoming(g.next));
    host.replaceChildren(heroOffseason());
  }

  function teamLogo(abbr) {
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${(abbr || 'nfl').toLowerCase()}.png`;
  }

  function scoreRow(side) {
    return el('div.score-side', {}, [
      el('img.score-logo', { src: side.logo || teamLogo(side.abbr), alt: side.abbr || '' }),
      el('div.score-abbr', { text: side.abbr || '' }),
      el('div.score-num', { text: side.score != null ? side.score : '0' }),
    ]);
  }

  function heroLive(l) {
    const wp = l.winProbability;
    return el('div.hero.hero--live', {}, [
      el('div.hero-tag', { html: '<span class="dot"></span> LIVE' }),
      el('div.hero-score', {}, [scoreRow(l.us), el('div.score-sep', { text: '–' }), scoreRow(l.them)]),
      el('div.hero-status', { text: (l.status && l.status.detail) || `Q${l.period || ''} ${l.clock || ''}` }),
      wp != null ? winProbBar(wp) : null,
      l.lastPlay ? el('div.hero-lastplay', { text: l.lastPlay }) : null,
    ]);
  }

  function winProbBar(pct) {
    return el('div.wp', {}, [
      el('div.wp-label', { html: `Win Probability · <b>${pct}%</b> BUF` }),
      el('div.wp-bar', {}, [el('div.wp-fill', { style: `width:${pct}%` })]),
    ]);
  }

  function heroFinal(l) {
    const won = Number(l.us.score) > Number(l.them.score);
    return el('div.hero', {}, [
      el('div.hero-tag', { text: 'FINAL' }),
      el('div.hero-score', {}, [scoreRow(l.us), el('div.score-sep', { text: '–' }), scoreRow(l.them)]),
      el('div.hero-status', { html: won ? '✅ <b>Bills win!</b>' : 'Tough one. On to the next.' }),
    ]);
  }

  function heroUpcoming(n) {
    const opp = n.opponent || {};
    const where = n.isHome ? 'vs' : '@';
    return el('div.hero.hero--up', {}, [
      el('div.hero-tag', { text: `WEEK ${n.week || ''} · NEXT UP` }),
      el('div.hero-matchup', {}, [
        el('div.mt', {}, [el('img.mt-logo', { src: teamLogo('BUF') }), el('span', { text: 'Bills' })]),
        el('div.mt-vs', { text: where }),
        el('div.mt', {}, [el('img.mt-logo', { src: opp.logo || teamLogo(opp.abbr) }), el('span', { text: opp.name || opp.abbr || 'TBD' })]),
      ]),
      el('div.hero-when', { text: fmtDate(n.date, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }),
      el('div.countdown', { 'data-countdown': n.date }),
      n.venue ? el('div.hero-venue', { text: `📍 ${n.venue.name}${n.venue.city ? ' · ' + n.venue.city + ', ' + (n.venue.state || '') : ''}` }) : null,
      el('div.hero-cta', {}, [el('a.btn.btn--primary', { href: '#matchup', text: '🔮 Full Matchup' }), el('a.btn', { href: C.tickets.ticketmaster, target: '_blank', rel: 'noopener', text: '🎟️ Tickets' })]),
    ]);
  }

  function heroOffseason() {
    const t = data.team || {};
    return el('div.hero.hero--off', {}, [
      el('div.hero-tag', { text: 'OFFSEASON' }),
      el('img.hero-biglogo', { src: teamLogo('BUF'), alt: 'Bills' }),
      el('div.hero-when', { html: `<b>${esc(recordSummary() || '')}</b> · ${esc(t.standingSummary || '')}` }),
      el('div.hero-status', { text: 'Schedule is set. The countdown to football is on. 🦬' }),
      data.game && data.game.next ? el('div.hero-cta', {}, [el('a.btn.btn--primary', { href: '#schedule', text: '📅 See the Schedule' })]) : null,
    ]);
  }

  // ---- card helper ------------------------------------------------------

  function card(title, bodyNode, opts) {
    opts = opts || {};
    return el('section.card', {}, [
      el('div.card-head', {}, [
        el('h2.card-title', { text: title }),
        opts.link ? el('a.card-link', { href: opts.link, target: opts.external ? '_blank' : null, rel: 'noopener', text: opts.linkText || 'More →' }) : null,
      ]),
      bodyNode,
    ]);
  }

  // ---- TAB: Home --------------------------------------------------------

  function renderHome() {
    const root = document.getElementById('view');
    root.replaceChildren(
      el('div#hero-wrap', {}, [el('div#hero')]),
      el('div.grid', {}, [
        card('📰 Latest News', newsList(4), { link: '#news', linkText: 'All news →' }),
        card('📅 Schedule', miniSchedule(), { link: '#schedule', linkText: 'Full schedule →' }),
        card('🏆 AFC East', standingsTable(data.standings && data.standings.afcEast, true), { link: '#standings', linkText: 'Playoff picture →' }),
        card('🤕 Injury Report', injuryList(5), { link: '#roster', linkText: 'Roster →' }),
      ])
    );
    renderHero();
    tickCountdown();
  }

  // ---- TAB: Schedule ----------------------------------------------------

  function renderSchedule() {
    const root = document.getElementById('view');
    const sch = data.schedule;
    if (!sch || !sch.events) { root.replaceChildren(emptyCard('Schedule unavailable.')); return; }
    const rows = sch.events.map((e) => {
      const opp = e.opponent || {};
      const st = e.status || {};
      const done = st.state === 'post';
      const res = e.result;
      return el('a.sch-row', { href: e.isHome ? '#matchup' : '#matchup' }, [
        el('div.sch-wk', { text: 'W' + (e.week || '') }),
        el('div.sch-where', { text: e.isHome ? 'vs' : '@' }),
        el('img.sch-logo', { src: opp.logo || teamLogo(opp.abbr), alt: opp.abbr || '' }),
        el('div.sch-opp', { text: opp.abbr || 'BYE' }),
        el('div.sch-info', { text: done ? '' : fmtDate(e.date, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }),
        done
          ? el(`div.sch-result.${res === 'W' ? 'win' : res === 'L' ? 'loss' : 'tie'}`, { text: `${res || 'T'} ${e.score.us || 0}-${e.score.them || 0}` })
          : el('div.sch-result.upcoming', { text: (st.shortDetail || '').split(' - ').pop() || 'TBD' }),
      ]);
    });
    root.replaceChildren(
      card(`📅 ${sch.season && sch.season.year ? sch.season.year : ''} Season` + (sch.byeWeek ? ` · Bye Week ${sch.byeWeek}` : ''),
        el('div.sch-list', {}, rows))
    );
  }

  function miniSchedule() {
    const sch = data.schedule;
    if (!sch || !sch.events) return emptyState('No schedule.');
    const now = Date.now();
    const next = sch.events.filter((e) => new Date(e.date).getTime() >= now).slice(0, 3);
    const last = sch.events.filter((e) => (e.status || {}).state === 'post').slice(-2);
    const pick = (last.concat(next)).slice(0, 5);
    const list = (pick.length ? pick : sch.events.slice(0, 5)).map((e) => {
      const opp = e.opponent || {};
      const done = (e.status || {}).state === 'post';
      return el('div.mini-row', {}, [
        el('span.mini-where', { text: (e.isHome ? 'vs ' : '@ ') }),
        el('img.mini-logo', { src: opp.logo || teamLogo(opp.abbr) }),
        el('span.mini-opp', { text: opp.abbr || 'BYE' }),
        done
          ? el(`span.mini-res.${e.result === 'W' ? 'win' : 'loss'}`, { text: `${e.result || 'T'} ${e.score.us || 0}-${e.score.them || 0}` })
          : el('span.mini-date', { text: fmtDate(e.date, { month: 'short', day: 'numeric' }) }),
      ]);
    });
    return el('div.mini-sched', {}, list);
  }

  // ---- TAB: Matchup -----------------------------------------------------

  function renderMatchup() {
    const root = document.getElementById('view');
    const g = data.game || {};
    const n = g.next || (g.live && g.live.state !== 'post' ? null : null);
    if (!n) { root.replaceChildren(emptyCard('No upcoming game scheduled. Check back when the next slate drops. 🦬')); return; }
    const opp = n.opponent || {};
    const w = data.weather;
    root.replaceChildren(
      el('div.matchup-hero', {}, [
        el('div.mt', {}, [el('img.mt-logo', { src: teamLogo('BUF') }), el('span', { text: 'Buffalo Bills' })]),
        el('div.mt-vs', { text: n.isHome ? 'vs' : '@' }),
        el('div.mt', {}, [el('img.mt-logo', { src: opp.logo || teamLogo(opp.abbr) }), el('span', { text: opp.name || opp.abbr })]),
      ]),
      el('div.matchup-when', { text: fmtDate(n.date, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + (n.venue ? ` · ${n.venue.name}` : '') }),
      el('div.countdown.countdown--big', { 'data-countdown': n.date }),
      el('div.grid', {}, [
        card('🌦️ Game Weather', weatherCard()),
        card('📊 Betting Odds', oddsCard(g)),
        card('🥊 Head-to-Head', h2hCard(opp.abbr)),
        card('🎟️ Get Tickets', ticketsCard()),
      ])
    );
    tickCountdown();
  }

  function weatherCard() {
    const w = data.weather;
    if (!w || !w.game) return emptyState('No game weather yet.');
    if (w.dome) return el('div.weather', {}, [el('div.wx-big', { text: '🏟️' }), el('div.wx-desc', { html: `<b>${esc(w.game.venue)}</b><br>Climate controlled — no weather worries indoors.` })]);
    if (!w.weather) return emptyState('Weather loads closer to game day.');
    const idx = gameHourIndex(w);
    const h = w.weather.hourly;
    const i = idx >= 0 ? idx : 0;
    const code = h.weathercode[i];
    const [label, emoji] = (C.wmo[code] || ['—', '🌡️']);
    return el('div.weather', {}, [
      el('div.wx-big', { text: emoji }),
      el('div.wx-main', {}, [
        el('div.wx-temp', { text: `${Math.round(h.temperature_2m[i])}°F` }),
        el('div.wx-desc', { text: `${label} · ${w.game.venue}` }),
      ]),
      el('div.wx-grid', {}, [
        wxStat('💨 Wind', `${Math.round(h.wind_speed_10m[i])} mph`),
        wxStat('🌧️ Precip', `${h.precipitation_probability[i]}%`),
        wxStat('❄️ Snow', `${(h.snowfall ? h.snowfall[i] : 0).toFixed(1)}"`),
      ]),
    ]);
  }
  const wxStat = (k, v) => el('div.wx-stat', {}, [el('span.wx-k', { text: k }), el('span.wx-v', { text: v })]);

  function oddsCard(g) {
    const o = (g.live && g.live.odds) || null;
    if (!o) return el('div.odds', {}, [
      emptyState('Lines post closer to kickoff.'),
      el('div.odds-links', {}, [el('a.btn.btn--sm', { href: 'https://www.espn.com/nfl/lines', target: '_blank', rel: 'noopener', text: 'View NFL Lines →' })]),
    ]);
    return el('div.odds', {}, [
      el('div.odds-row', {}, [el('span', { text: 'Spread' }), el('b', { text: o.details || '—' })]),
      el('div.odds-row', {}, [el('span', { text: 'Over/Under' }), el('b', { text: o.overUnder != null ? o.overUnder : '—' })]),
    ]);
  }

  function h2hCard(oppAbbr) {
    const sch = data.schedule;
    if (!sch) return emptyState('—');
    const meetings = sch.events.filter((e) => e.opponent && e.opponent.abbr === oppAbbr && (e.status || {}).state === 'post');
    if (!meetings.length) return el('div.h2h', {}, [el('p.muted', { text: `First scheduled meeting with ${oppAbbr || 'them'} this season. Get the brooms ready. 🧹` })]);
    const w = meetings.filter((m) => m.result === 'W').length;
    return el('div.h2h', {}, [
      el('div.h2h-big', { html: `<b>${w}-${meetings.length - w}</b> this season` }),
      el('div', {}, meetings.map((m) => el('div.mini-row', {}, [
        el(`span.mini-res.${m.result === 'W' ? 'win' : 'loss'}`, { text: `${m.result} ${m.score.us}-${m.score.them}` }),
        el('span.mini-date', { text: fmtDate(m.date, { month: 'short', day: 'numeric' }) }),
      ]))),
    ]);
  }

  function ticketsCard() {
    return el('div.tickets', {}, [
      el('p.muted', { text: 'Compare resale prices across marketplaces:' }),
      el('div.ticket-links', {}, [
        el('a.btn.btn--primary', { href: C.tickets.ticketmaster, target: '_blank', rel: 'noopener', text: 'Ticketmaster' }),
        el('a.btn', { href: C.tickets.stubhub, target: '_blank', rel: 'noopener', text: 'StubHub' }),
        el('a.btn', { href: C.tickets.seatgeek, target: '_blank', rel: 'noopener', text: 'SeatGeek' }),
      ]),
    ]);
  }

  // ---- TAB: Stats -------------------------------------------------------

  function renderStats() {
    const root = document.getElementById('view');
    const us = data.standings && data.standings.afcEast && data.standings.afcEast.find((x) => x.abbr === C.TEAM_ABBR);
    const cards = [];
    if (us) {
      cards.push(card('📊 Team Profile', el('div.stat-grid', {}, [
        bigStat('Record', `${us.wins}-${us.losses}${us.ties && us.ties !== '0' ? '-' + us.ties : ''}`),
        bigStat('Win %', us.pct || '—'),
        bigStat('Points For', us.pf || '—'),
        bigStat('Points Against', us.pa || '—'),
        bigStat('Point Diff', us.diff || '—'),
        bigStat('Streak', us.streak || '—'),
        bigStat('Home', us.home || '—'),
        bigStat('Away', us.road || '—'),
        bigStat('Division', us.div || '—'),
        bigStat('Conference', us.conf || '—'),
        bigStat('Playoff Seed', us.seed || '—'),
        bigStat('Standing', (data.team && data.team.standingSummary) || '—'),
      ])));
    }
    cards.push(card('👥 Roster Composition', rosterBreakdown()));
    cards.push(card('🔗 Deep Stats', el('div.odds-links', {}, [
      el('a.btn.btn--sm', { href: 'https://www.espn.com/nfl/team/stats/_/name/buf/buffalo-bills', target: '_blank', rel: 'noopener', text: 'Full team stats on ESPN →' }),
    ])));
    root.replaceChildren(el('div.grid', {}, cards));
  }
  const bigStat = (k, v) => el('div.bstat', {}, [el('div.bstat-v', { text: v }), el('div.bstat-k', { text: k })]);

  function rosterBreakdown() {
    const r = data.roster;
    if (!r || !r.groups) return emptyState('No roster.');
    const rows = r.groups.filter((g) => (g.items || []).length).map((g) =>
      el('div.mini-row', {}, [el('span.mini-opp', { text: labelGroup(g.position) }), el('span.mini-date', { text: (g.items || []).length + ' players' })]));
    return el('div', {}, rows);
  }
  const labelGroup = (p) => ({ offense: 'Offense', defense: 'Defense', specialTeam: 'Special Teams', injuredReserveOrOut: 'IR / Out', suspended: 'Suspended', practiceSquad: 'Practice Squad' }[p] || p);

  // ---- TAB: Roster ------------------------------------------------------

  function renderRoster() {
    const root = document.getElementById('view');
    const r = data.roster;
    const cards = [card('🤕 Injury Report', injuryList(50))];
    if (r && r.groups) {
      r.groups.filter((g) => ['offense', 'defense', 'specialTeam'].includes(g.position)).forEach((g) => {
        cards.push(card(`${labelGroup(g.position)} · ${(g.items || []).length}`, playerGrid(g.items)));
      });
    }
    root.replaceChildren(el('div.stack', {}, cards));
  }

  function playerGrid(items) {
    const sorted = (items || []).slice().sort((a, b) => (parseInt(a.jersey) || 999) - (parseInt(b.jersey) || 999));
    return el('div.players', {}, sorted.map((p) => el('div.player', {}, [
      p.headshot ? el('img.player-img', { src: p.headshot, alt: p.name, loading: 'lazy' }) : el('div.player-img.player-img--ph', { text: (p.position || '?') }),
      el('div.player-meta', {}, [
        el('div.player-name', { html: `<span class="jersey">#${esc(p.jersey || '–')}</span> ${esc(p.name)}` }),
        el('div.player-sub', { text: `${p.position || ''} · ${p.height || ''} ${p.weight || ''} · ${p.age ? p.age + 'yo' : ''}` }),
        el('div.player-sub.muted', { text: p.college ? '🎓 ' + p.college : '' }),
      ]),
    ])));
  }

  function injuryList(limit) {
    const inj = (data.injuries && data.injuries.injuries) || [];
    if (!inj.length) return el('p.muted', { text: 'No injuries reported. Healthy as it gets. 💪' });
    return el('div.injuries', {}, inj.slice(0, limit).map((x) => {
      const a = x.athlete || {};
      const cls = /Out|IR|Doubtful/i.test(x.status || '') ? 'out' : /Question/i.test(x.status || '') ? 'q' : 'ok';
      return el('div.injury', {}, [
        a.headshot ? el('img.inj-img', { src: a.headshot, alt: a.name, loading: 'lazy' }) : el('div.inj-img.player-img--ph', { text: a.position || '?' }),
        el('div.inj-meta', {}, [
          el('div.player-name', { text: a.name || 'Unknown' }),
          el('div.player-sub.muted', { text: x.type || '' }),
        ]),
        el(`span.inj-status.${cls}`, { text: x.status || '—' }),
      ]);
    }));
  }

  // ---- TAB: Standings ---------------------------------------------------

  function renderStandings() {
    const root = document.getElementById('view');
    const s = data.standings;
    if (!s) { root.replaceChildren(emptyCard('Standings unavailable.')); return; }
    root.replaceChildren(el('div.stack', {}, [
      card('🏆 AFC East', standingsTable(s.afcEast, false)),
      card('🎟️ AFC Playoff Picture', playoffPicture(s.afc)),
    ]));
  }

  function standingsTable(rows, compact) {
    if (!rows || !rows.length) return emptyState('No standings.');
    const head = el('div.st-row.st-head', {}, [
      el('span.st-team', { text: 'Team' }), el('span', { text: 'W' }), el('span', { text: 'L' }),
      compact ? null : el('span', { text: 'PCT' }), compact ? null : el('span', { text: 'PF' }), compact ? null : el('span', { text: 'PA' }),
    ].filter(Boolean));
    const body = rows.map((r) => el(`div.st-row${r.abbr === C.TEAM_ABBR ? '.st-row--us' : ''}`, {}, [
      el('span.st-team', {}, [el('img.st-logo', { src: r.logo }), el('span', { text: r.abbr })]),
      el('span', { text: r.wins || '0' }), el('span', { text: r.losses || '0' }),
      compact ? null : el('span', { text: r.pct || '—' }), compact ? null : el('span', { text: r.pf || '—' }), compact ? null : el('span', { text: r.pa || '—' }),
    ].filter(Boolean)));
    return el('div.standings', {}, [head].concat(body));
  }

  function playoffPicture(afc) {
    if (!afc || !afc.length) return emptyState('No playoff data.');
    const seeded = afc.filter((t) => parseInt(t.seed) >= 1 && parseInt(t.seed) <= 7);
    const list = (seeded.length ? seeded : afc.slice(0, 7));
    return el('div.playoff', {}, list.map((t, i) => {
      const seed = t.seed || (i + 1);
      const inField = parseInt(seed) <= 7;
      return el(`div.po-row${t.abbr === C.TEAM_ABBR ? '.po-row--us' : ''}${parseInt(seed) === 7 ? '.po-cut' : ''}`, {}, [
        el('span.po-seed', { text: seed }),
        el('img.st-logo', { src: t.logo }),
        el('span.po-team', { text: t.name || t.abbr }),
        el('span.po-rec', { text: `${t.wins}-${t.losses}` }),
        el('span.po-tag', { text: parseInt(seed) === 1 ? 'Bye' : inField ? (parseInt(seed) <= 4 ? 'Div' : 'WC') : '' }),
      ]);
    }));
  }

  // ---- TAB: Media -------------------------------------------------------

  function renderMedia() {
    const root = document.getElementById('view');
    const arts = (data.news && data.news.articles) || [];
    const withImg = arts.filter((a) => a.image);
    if (!withImg.length) { root.replaceChildren(emptyCard('No media yet.')); return; }
    root.replaceChildren(
      card('🎬 Highlights & Media', el('div.media-grid', {}, withImg.slice(0, 18).map((a) =>
        el('a.media-tile', { href: a.url || '#', target: '_blank', rel: 'noopener' }, [
          el('img.media-img', { src: a.image, alt: a.headline, loading: 'lazy' }),
          el('div.media-cap', { text: a.headline }),
        ])
      )))
    );
  }

  // ---- TAB: News --------------------------------------------------------

  function renderNews() {
    document.getElementById('view').replaceChildren(card('📰 Bills & NFL News', newsList(40)));
  }

  function newsList(limit) {
    const arts = (data.news && data.news.articles) || [];
    if (!arts.length) return emptyState('No news right now.');
    return el('div.news', {}, arts.slice(0, limit).map((a) =>
      el('a.news-item', { href: a.url || '#', target: '_blank', rel: 'noopener' }, [
        a.image ? el('img.news-img', { src: a.image, alt: '', loading: 'lazy' }) : null,
        el('div.news-body', {}, [
          el('div.news-head', { text: a.headline }),
          a.description ? el('div.news-desc', { text: a.description }) : null,
          el('div.news-meta', { text: timeAgo(a.published) }),
        ]),
      ].filter(Boolean))
    ));
  }

  // ---- shared empties ---------------------------------------------------

  const emptyState = (msg) => el('div.state.state--empty', { text: msg });
  const emptyCard = (msg) => card('', emptyState(msg));

  // ---- router -----------------------------------------------------------

  const ROUTES = {
    home: renderHome, schedule: renderSchedule, matchup: renderMatchup, stats: renderStats,
    roster: renderRoster, standings: renderStandings, media: renderMedia, news: renderNews,
  };

  function route() {
    const id = (location.hash.replace('#', '') || 'home');
    const fn = ROUTES[id] || renderHome;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('tab--active', t.dataset.tab === id));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    fn();
  }

  // ---- init -------------------------------------------------------------

  function buildChrome() {
    const nav = document.getElementById('tabs');
    TABS.forEach((t) => nav.appendChild(el('a.tab', { href: '#' + t.id, 'data-tab': t.id, text: t.label })));
  }

  async function init() {
    buildChrome();
    setupTheme();
    setState(document.getElementById('view'), 'loading', 'Loading the latest… 🦬');
    await loadAll();
    renderHeader();
    billsWeatherAlert();
    route();
    manageLivePolling();

    countdownTimer = setInterval(tickCountdown, C.refresh.countdown);
    window.addEventListener('hashchange', route);

    // Periodic snapshot refresh keeps every tab fresh (picks up the cron).
    setInterval(async () => {
      await loadAll();
      renderHeader();
      billsWeatherAlert();
      manageLivePolling();
      route(); // re-render current tab with fresh data
    }, C.refresh.snapshots);
  }

  function setupTheme() {
    const btn = document.getElementById('theme-toggle');
    const saved = localStorage.getItem('bills-theme');
    if (saved === 'light') document.body.classList.add('light');
    btn.addEventListener('click', () => {
      document.body.classList.toggle('light');
      localStorage.setItem('bills-theme', document.body.classList.contains('light') ? 'light' : 'dark');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
