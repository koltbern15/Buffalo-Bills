#!/usr/bin/env node
/*
 * Buffalo Bills hub — data fetcher.
 *
 * Pulls everything we render from free, key-free public endpoints
 * (ESPN's public JSON + Open-Meteo) and writes JSON snapshots into /data.
 * Run on a cron by GitHub Actions so the site is fresh even when nobody
 * has it open. The browser also hits these same live endpoints directly,
 * falling back to these snapshots when CORS or the network gets in the way.
 *
 * No external dependencies — Node 18+ native fetch only.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TEAM_ID = '2'; // Buffalo Bills
const TEAM_ABBR = 'BUF';
const DATA_DIR = path.join(__dirname, '..', 'data');

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const CDN = 'https://cdn.espn.com/core/nfl';

// Home-stadium coordinates for all 32 clubs, keyed by team abbreviation.
// Used to fetch game-day weather (dome = climate controlled, no real weather).
const STADIUMS = {
  ARI: { name: 'State Farm Stadium', lat: 33.5276, lon: -112.2626, dome: true },
  ATL: { name: 'Mercedes-Benz Stadium', lat: 33.7554, lon: -84.4008, dome: true },
  BAL: { name: 'M&T Bank Stadium', lat: 39.278, lon: -76.6227, dome: false },
  BUF: { name: 'Highmark Stadium', lat: 42.7738, lon: -78.787, dome: false },
  CAR: { name: 'Bank of America Stadium', lat: 35.2258, lon: -80.8528, dome: false },
  CHI: { name: 'Soldier Field', lat: 41.8623, lon: -87.6167, dome: false },
  CIN: { name: 'Paycor Stadium', lat: 39.0954, lon: -84.516, dome: false },
  CLE: { name: 'Huntington Bank Field', lat: 41.5061, lon: -81.6995, dome: false },
  DAL: { name: 'AT&T Stadium', lat: 32.7473, lon: -97.0945, dome: true },
  DEN: { name: 'Empower Field at Mile High', lat: 39.7439, lon: -105.0201, dome: false },
  DET: { name: 'Ford Field', lat: 42.34, lon: -83.0456, dome: true },
  GB: { name: 'Lambeau Field', lat: 44.5013, lon: -88.0622, dome: false },
  HOU: { name: 'NRG Stadium', lat: 29.6847, lon: -95.4107, dome: true },
  IND: { name: 'Lucas Oil Stadium', lat: 39.7601, lon: -86.1639, dome: true },
  JAX: { name: 'EverBank Stadium', lat: 30.3239, lon: -81.6373, dome: false },
  KC: { name: 'Arrowhead Stadium', lat: 39.0489, lon: -94.4839, dome: false },
  LV: { name: 'Allegiant Stadium', lat: 36.0909, lon: -115.1833, dome: true },
  LAC: { name: 'SoFi Stadium', lat: 33.9535, lon: -118.3392, dome: true },
  LAR: { name: 'SoFi Stadium', lat: 33.9535, lon: -118.3392, dome: true },
  MIA: { name: 'Hard Rock Stadium', lat: 25.958, lon: -80.2389, dome: false },
  MIN: { name: 'U.S. Bank Stadium', lat: 44.974, lon: -93.2581, dome: true },
  NE: { name: 'Gillette Stadium', lat: 42.0909, lon: -71.2643, dome: false },
  NO: { name: 'Caesars Superdome', lat: 29.9511, lon: -90.0812, dome: true },
  NYG: { name: 'MetLife Stadium', lat: 40.8135, lon: -74.0745, dome: false },
  NYJ: { name: 'MetLife Stadium', lat: 40.8135, lon: -74.0745, dome: false },
  PHI: { name: 'Lincoln Financial Field', lat: 39.9008, lon: -75.1675, dome: false },
  PIT: { name: 'Acrisure Stadium', lat: 40.4468, lon: -80.0158, dome: false },
  SF: { name: "Levi's Stadium", lat: 37.403, lon: -121.97, dome: false },
  SEA: { name: 'Lumen Field', lat: 47.5952, lon: -122.3316, dome: false },
  TB: { name: 'Raymond James Stadium', lat: 27.9759, lon: -82.5033, dome: false },
  TEN: { name: 'Nissan Stadium', lat: 36.1665, lon: -86.7713, dome: false },
  WSH: { name: 'Northwest Stadium', lat: 38.9076, lon: -76.8645, dome: false },
};

async function getJSON(url, { timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'bills-hub/1.0 (+github actions)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function write(name, obj) {
  const file = path.join(DATA_DIR, name);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  console.log(`  wrote data/${name}`);
}

// Run a labelled task; never let one failure abort the whole run.
async function task(label, fn) {
  try {
    await fn();
    console.log(`✓ ${label}`);
  } catch (err) {
    console.error(`✗ ${label}: ${err.message}`);
  }
}

// ---- individual sources -------------------------------------------------

async function fetchTeam() {
  const d = await getJSON(`${SITE}/teams/${TEAM_ID}`);
  const t = d.team || {};
  write('team.json', {
    id: t.id,
    displayName: t.displayName,
    abbreviation: t.abbreviation,
    color: t.color,
    alternateColor: t.alternateColor,
    logo: (t.logos && t.logos[0] && t.logos[0].href) || null,
    record: t.record || {},
    standingSummary: t.standingSummary || null,
    nextEvent: t.nextEvent || [],
  });
}

async function fetchSchedule() {
  const d = await getJSON(`${SITE}/teams/${TEAM_ID}/schedule`);
  const events = (d.events || []).map((e) => {
    const c = (e.competitions && e.competitions[0]) || {};
    const comps = c.competitors || [];
    const home = comps.find((x) => x.homeAway === 'home') || {};
    const away = comps.find((x) => x.homeAway === 'away') || {};
    const us = comps.find((x) => x.team && x.team.abbreviation === TEAM_ABBR) || {};
    const them = comps.find((x) => x.team && x.team.abbreviation !== TEAM_ABBR) || {};
    return {
      id: e.id,
      date: e.date,
      name: e.shortName,
      week: e.week && e.week.number,
      seasonType: e.seasonType && e.seasonType.type,
      status: (c.status && c.status.type) || {},
      venue: c.venue ? { name: c.venue.fullName, city: c.venue.address && c.venue.address.city, state: c.venue.address && c.venue.address.state } : null,
      isHome: us.homeAway === 'home',
      opponent: them.team
        ? { abbr: them.team.abbreviation, name: them.team.displayName, logo: (them.team.logos && them.team.logos[0] && them.team.logos[0].href) || `https://a.espncdn.com/i/teamlogos/nfl/500/${(them.team.abbreviation || '').toLowerCase()}.png` }
        : null,
      score: { us: us.score || null, them: them.score || null },
      result: us.winner === true ? 'W' : them.winner === true ? 'L' : null,
      homeAbbr: home.team && home.team.abbreviation,
      awayAbbr: away.team && away.team.abbreviation,
    };
  });
  write('schedule.json', { season: d.requestedSeason || d.season, byeWeek: d.byeWeek, events });
  return events;
}

async function fetchRoster() {
  const d = await getJSON(`${SITE}/teams/${TEAM_ID}/roster`);
  const groups = (d.athletes || []).map((g) => ({
    position: g.position,
    items: (g.items || []).map((p) => ({
      id: p.id,
      name: p.fullName,
      jersey: p.jersey,
      position: p.position && p.position.abbreviation,
      age: p.age,
      height: p.displayHeight,
      weight: p.displayWeight,
      experience: p.experience && p.experience.years,
      college: p.college && p.college.name,
      headshot: (p.headshot && p.headshot.href) || null,
    })),
  }));
  write('roster.json', { coach: d.coach, groups });
}

async function fetchStandings() {
  const d = await getJSON(`${CDN}/standings?xhr=1`);
  const confs = d.content.standings.groups;
  const parseEntry = (ent) => {
    const stats = {};
    (ent.stats || []).forEach((s) => { stats[s.name] = s.displayValue; });
    return {
      abbr: ent.team.abbreviation,
      name: ent.team.displayName,
      logo: (ent.team.logos && ent.team.logos[0] && ent.team.logos[0].href) || `https://a.espncdn.com/i/teamlogos/nfl/500/${(ent.team.abbreviation || '').toLowerCase()}.png`,
      wins: stats.wins, losses: stats.losses, ties: stats.ties,
      pct: stats.winPercent, pf: stats.pointsFor, pa: stats.pointsAgainst,
      diff: stats.differential, streak: stats.streak, home: stats.Home,
      road: stats.Road, div: stats.vsDiv, conf: stats.vsConf,
      seed: stats.playoffSeed, gb: stats.gamesBehind,
    };
  };
  const out = { afcEast: [], afc: [], nfc: [] };
  confs.forEach((conf) => {
    const isAFC = /American/.test(conf.name);
    (conf.groups || []).forEach((div) => {
      const entries = ((div.standings && div.standings.entries) || []).map(parseEntry);
      if (div.name === 'AFC East') out.afcEast = entries;
      const bucket = isAFC ? out.afc : out.nfc;
      entries.forEach((e) => bucket.push({ ...e, division: div.name }));
    });
  });
  const seedNum = (e) => parseInt(e.seed, 10) || 99;
  out.afc.sort((a, b) => seedNum(a) - seedNum(b));
  out.nfc.sort((a, b) => seedNum(a) - seedNum(b));
  write('standings.json', out);
}

async function fetchNews() {
  const d = await getJSON(`${SITE}/news?team=${TEAM_ID}&limit=40`);
  const articles = (d.articles || []).map((a) => ({
    headline: a.headline,
    description: a.description,
    published: a.published,
    url: (a.links && a.links.web && a.links.web.href) || null,
    image: (a.images && a.images[0] && a.images[0].url) || null,
    type: a.type,
  }));
  write('news.json', { articles });
}

// Find the Bills' live/next/last game on the league scoreboard and, if a game
// is in progress or recently finished, pull the summary for win probability.
async function fetchGame(scheduleEvents) {
  const sb = await getJSON(`${SITE}/scoreboard`);
  const findBills = (ev) =>
    (ev.competitions || []).some((c) =>
      (c.competitors || []).some((t) => t.team && t.team.abbreviation === TEAM_ABBR)
    );
  let event = (sb.events || []).find(findBills);
  let game = null;

  if (event) {
    const c = event.competitions[0];
    const comps = c.competitors || [];
    const us = comps.find((x) => x.team.abbreviation === TEAM_ABBR) || {};
    const them = comps.find((x) => x.team.abbreviation !== TEAM_ABBR) || {};
    game = {
      id: event.id,
      name: event.shortName,
      date: event.date,
      state: (c.status && c.status.type && c.status.type.state) || 'pre',
      status: (c.status && c.status.type) || {},
      clock: c.status && c.status.displayClock,
      period: c.status && c.status.period,
      us: { abbr: us.team && us.team.abbreviation, score: us.score, homeAway: us.homeAway, logo: us.team && (us.team.logo || `https://a.espncdn.com/i/teamlogos/nfl/500/${(us.team.abbreviation || '').toLowerCase()}.png`) },
      them: { abbr: them.team && them.team.abbreviation, name: them.team && them.team.displayName, score: them.score, homeAway: them.homeAway, logo: them.team && (them.team.logo || `https://a.espncdn.com/i/teamlogos/nfl/500/${(them.team.abbreviation || '').toLowerCase()}.png`) },
      odds: (c.odds && c.odds[0]) ? { details: c.odds[0].details, overUnder: c.odds[0].overUnder } : null,
      broadcast: (c.broadcasts && c.broadcasts[0] && c.broadcasts[0].names && c.broadcasts[0].names[0]) || null,
    };

    // Win probability + last play for live/finished games.
    if (game.state === 'in' || game.state === 'post') {
      try {
        const sum = await getJSON(`${SITE}/summary?event=${event.id}`);
        const wp = sum.winprobability && sum.winprobability[sum.winprobability.length - 1];
        if (wp) {
          const homeIsBills = (us.homeAway === 'home');
          game.winProbability = Math.round((homeIsBills ? wp.homeWinPercentage : 1 - wp.homeWinPercentage) * 100);
        }
        const drive = sum.drives && sum.drives.current;
        if (drive) game.lastPlay = drive.plays && drive.plays[drive.plays.length - 1] && drive.plays[drive.plays.length - 1].text;
      } catch (e) { /* summary optional */ }
    }
  }

  // Always determine the "next" scheduled game from the season schedule.
  const now = Date.now();
  const next = (scheduleEvents || [])
    .filter((e) => e.status && e.status.state === 'pre' && new Date(e.date).getTime() > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;

  write('game.json', { live: game, next });
  return next;
}

async function fetchInjuries() {
  // Core API lists injury refs; follow a capped number for current details.
  const list = await getJSON(`${CORE}/teams/${TEAM_ID}/injuries?limit=60`);
  const refs = (list.items || []).slice(0, 60).map((i) => i.$ref);
  const settled = await Promise.allSettled(refs.map((r) => getJSON(r.replace('http://', 'https://'))));
  const injuries = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    const inj = s.value;
    let athlete = null;
    if (inj.athlete && inj.athlete.$ref) {
      try {
        const a = await getJSON(inj.athlete.$ref.replace('http://', 'https://'));
        athlete = { name: a.displayName, position: a.position && a.position.abbreviation, headshot: a.headshot && a.headshot.href };
      } catch (e) { /* skip */ }
    }
    injuries.push({
      status: inj.status,
      type: inj.type && inj.type.description,
      detail: inj.details && (inj.details.type || inj.details.detail),
      date: inj.date,
      athlete,
    });
  }
  write('injuries.json', { injuries });
}

async function fetchWeather(nextGame) {
  if (!nextGame) { write('weather.json', { game: null }); return; }
  const hostAbbr = nextGame.isHome ? TEAM_ABBR : nextGame.homeAbbr;
  const stadium = STADIUMS[hostAbbr] || STADIUMS.BUF;
  let weather = null;
  if (!stadium.dome) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${stadium.lat}&longitude=${stadium.lon}` +
      `&hourly=temperature_2m,precipitation_probability,weathercode,wind_speed_10m,snowfall` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode,wind_speed_10m_max` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=16`;
    try { weather = await getJSON(url); } catch (e) { /* optional */ }
  }
  write('weather.json', {
    game: { date: nextGame.date, name: nextGame.name, venue: stadium.name, host: hostAbbr },
    dome: stadium.dome,
    weather,
  });
}

// ---- main ---------------------------------------------------------------

(async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('Fetching Buffalo Bills data...');

  let scheduleEvents = [];
  let nextGame = null;

  await task('team', fetchTeam);
  await task('schedule', async () => { scheduleEvents = await fetchSchedule(); });
  await task('roster', fetchRoster);
  await task('standings', fetchStandings);
  await task('news', fetchNews);
  await task('game', async () => { nextGame = await fetchGame(scheduleEvents); });
  await task('injuries', fetchInjuries);
  await task('weather', async () => { await fetchWeather(nextGame); });

  write('meta.json', { updatedAt: new Date().toISOString() });
  console.log('Done.');
})();
