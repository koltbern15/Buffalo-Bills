# 🦬 Bills Mafia HQ

A **live, self-updating Buffalo Bills hub** — scores, news, schedule, matchup
outlooks, injuries, game-day weather, betting odds, standings and the playoff
picture, all in one page. No server, no API keys, no cost.

> Unofficial fan project. Not affiliated with the Buffalo Bills or the NFL.

## What's inside

A single static page with **8 tabs**:

| Tab | Contents |
|-----|----------|
| 🏠 **Home** | Adaptive hero (live score / kickoff countdown / matchup / offseason), Bills-weather alerts, news, schedule, AFC East, injuries |
| 📅 **Schedule** | Full season schedule + results with W/L pills and bye week |
| 🔮 **Matchup** | Next-game outlook: countdown, game weather, betting odds, head-to-head, buy-tickets links |
| 📊 **Stats** | Team profile (record, PF/PA, streak, splits, seed) + roster composition |
| 👥 **Roster** | Injury report + offense / defense / special-teams rosters |
| 🏆 **Standings** | AFC East table + AFC playoff picture |
| 🎬 **Media** | Highlights & photo tiles |
| 📰 **News** | Auto-updating Bills & NFL news feed |

Plus a **dark stadium** theme (light toggle), the **adaptive hero** that changes
with the team's state, a **kickoff countdown** clock, **live win-probability**
during games, and **❄️ Bills weather alerts** for snow / wind / cold.

## How "self-updating" works

Two layers, so the page is always fresh:

1. **In your browser** — `assets/js/app.js` re-reads the data snapshots every
   minute, and during a live game polls ESPN directly every 20s for
   instant scores + win probability.
2. **The cron robot** — `.github/workflows/update-data.yml` runs
   `scripts/fetch-data.js` every 15 minutes, pulls fresh data into `data/*.json`,
   and commits it. So the page is current the moment you open it, even if
   nobody's had it open.

### Data sources (all free, no keys)
- **ESPN public API** — team, schedule, scoreboard, summary (win probability),
  roster, news, injuries, standings.
- **Open-Meteo** — game-day weather by stadium coordinates (dome-aware).
- **Ticket prices** — link-outs to Ticketmaster / StubHub / SeatGeek (no free
  price API exists).

## Live site

**https://koltbern15.github.io/Buffalo-Bills/**

> ⚠️ GitHub Pages project URLs are **case-sensitive on the repo name**. The repo
> is `Buffalo-Bills`, so the lowercase `…/buffalo-bills/` path will 404 — use the
> capitalized path above.

## Setup notes

- The deploy workflow uses `configure-pages` with `enablement: true`, so it
  **turns Pages on by itself** — no manual Settings toggle needed.
- The `Update Bills data` workflow commits fresh snapshots to `main` every 15
  minutes (wired with `permissions: contents: write`).
- Because the data-bot commits with the Actions token (which by design does
  **not** re-trigger workflows), `Deploy to GitHub Pages` also runs on a
  schedule so the deployed `data/*.json` stays current.

## Run / develop locally

You don't need to run anything locally to use the site — that's what the live
URL above is for. Local serving is only for development.

```bash
# from inside the cloned repo:
node scripts/fetch-data.js          # (optional) refresh the data/*.json snapshots

# then serve the folder with any static server:
python3 -m http.server 8099         # macOS/Linux
npx --yes http-server -p 8099 -c-1  # Windows (or anywhere Python isn't installed)
```

Then open http://localhost:8099. No build step, no dependencies — vanilla
HTML/CSS/JS and Node's native `fetch`.

## Layout

```
index.html                 # shell: topbar, tabs, footer
assets/css/styles.css      # dark stadium theme
assets/js/config.js        # endpoints, stadiums, refresh intervals
assets/js/util.js          # DOM + formatting helpers
assets/js/app.js           # data loading, router, hero, all 8 tab renderers
scripts/fetch-data.js      # the cron data fetcher (Node)
data/*.json                # committed snapshots (auto-refreshed)
.github/workflows/         # update-data (cron) + deploy-pages
```

Go Bills. 🦬
