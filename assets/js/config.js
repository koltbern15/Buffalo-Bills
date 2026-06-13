/* Global config for the Bills hub. Exposed as window.BILLS. */
window.BILLS = {
  TEAM_ID: '2',
  TEAM_ABBR: 'BUF',

  // Committed snapshots written by scripts/fetch-data.js (the cron layer).
  // These are the reliable source the page renders from.
  snapshot: (name) => `data/${name}.json?t=${Math.floor(Date.now() / 60000)}`,

  // Live ESPN endpoints hit directly from the browser for in-game freshness.
  // CORS-friendly (Access-Control-Allow-Origin: *).
  live: {
    scoreboard: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
    summary: (id) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`,
  },

  // How often to refresh (ms).
  refresh: {
    snapshots: 60000,   // re-read committed JSON every minute (picks up cron)
    liveGame: 20000,    // poll ESPN directly every 20s during a live game
    countdown: 1000,    // tick the kickoff clock every second
  },

  // Buy-tickets / resale link-outs (no free price API).
  tickets: {
    ticketmaster: 'https://www.ticketmaster.com/buffalo-bills-tickets/artist/805918',
    stubhub: 'https://www.stubhub.com/buffalo-bills-tickets/performer/6086/',
    seatgeek: 'https://seatgeek.com/buffalo-bills-tickets',
  },

  // Weather code -> { label, emoji }. Open-Meteo WMO codes.
  wmo: {
    0: ['Clear', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
    51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'],
    61: ['Light rain', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
    66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
    71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '🌨️'],
    80: ['Showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '⛈️'],
    85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
    95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm', '⛈️'], 99: ['Severe thunderstorm', '⛈️'],
  },
};
