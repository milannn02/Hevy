# Trainingslogboek — Hevy CSV-analyse

A polished, offline-first web app (installable as a phone app / APK) that turns your
**Hevy** workout export into a training dashboard: progression charts, PR tracking,
muscle-group balance, and smart next-session targets.

Everything runs **locally in your browser** — your data never leaves your device.

![App icon](icons/icon-192.png)

---

## Features

- **Overview** — workouts, total volume, working sets, training hours, weekly frequency, plus charts for weekly frequency, weekly volume, training days and average session duration.
- **Progression** — pick any exercise: top weight & estimated 1RM (Epley) per session, per-session volume, a rep-target table, and full session history with up/down/flat indicators.
- **PRs** — sortable, searchable all-time records per exercise within the selected period.
- **Muscle groups** — weekly sets per muscle (last 8 weeks, with the 10–20 sets guideline), distribution donut, and a push/pull balance meter.
- **Suggestions** — double-progression targets for your next session, plateau detection, an IPF-coloured **plate-loading calculator** for barbell lifts, and a strength benchmark vs. bodyweight.
- **Plan** — generate a multi-week training plan: pick days/week, split (Push-Pull-Legs, Upper/Lower, Anterior/Posterior, Full body, or Auto), goal and number of weeks. It fills each day with **your own exercises** (per muscle group, compound-first) with rep schemes, e1RM-based target weights, and week-by-week progression, plus a weekly sets-per-muscle summary.
- **Adapts to any exercise** — each exercise is auto-classified by what it tracks: **weight × reps**, **bodyweight reps** (e.g. Pull Ups), **time** (Plank, Dead Hang) or **distance/cardio** (Running, Cycling). PRs, progression and suggestions adjust accordingly, so exercises with no logged weight are no longer dropped.
- **Periods** — filter everything by 3M / 6M / 1Y / all.
- **Works offline** and **remembers your data** between visits (stored locally via IndexedDB).
- **Installable** as an app on Android, iOS and desktop (PWA).

---

## How to use

1. In the **Hevy** app: *Profile → Settings → Export Workout Data*. You'll get a `.csv` file.
2. Open this app (see *Running / hosting* below).
3. **Drag the CSV onto the page** or click **Kies CSV-bestand**.
   - No export handy? Click **Probeer met voorbeelddata** to explore with generated demo data.
4. Your data is parsed and stored locally — next time you open the app it loads automatically.
   Use **Nieuw bestand** to load a fresh export or **Wissen** to remove stored data.

There's a `voorbeeld-hevy-export.csv` in this folder showing the exact expected column format.

---

## Running / hosting

This is a static site — no build step. It just needs to be served over `http(s)://`
(opening `index.html` directly via `file://` disables the service worker, install, and
local-storage features).

### Run locally
```bash
# from this folder
python -m http.server 5173
# then open http://localhost:5173
```
(Any static server works: `npx serve`, VS Code "Live Server", etc.)

### Deploy as a website (free options)
A public **HTTPS** URL is required for "install app" and APK packaging to work.

- **Netlify Drop** — drag this folder onto <https://app.netlify.com/drop>. Instant URL.
- **GitHub Pages** — push these files to a repo, enable Pages on the root. Since all paths
  are relative, it works under a `/repo-name/` subpath too.
- **Cloudflare Pages / Vercel** — connect the repo or upload the folder.

### Updating after you edit the code
`styles.css` and `app.js` are loaded with a version query (`?v=2`) and precached by the
service worker. After editing either file, bump that number in **`index.html`** (both links)
and the `CACHE` name in **`sw.js`** (e.g. `hevylog-v3` → `v4`). That guarantees browsers and
installed apps fetch the new version instead of a cached copy.

---

## Install as an app

Once it's served over HTTPS (or `localhost`):

- **Android / Chrome** — tap the **Installeren** button in the header, or browser menu → *Install app / Add to Home screen*.
- **iOS / Safari** — Share → *Add to Home Screen*.
- **Desktop (Chrome/Edge)** — install icon in the address bar, or the **Installeren** button.

It then launches full-screen with its own icon, works offline, and keeps your data.

---

## Turn it into an Android APK

The app is a PWA, so you can wrap it in a real Android package without rewriting anything.

### Easiest: PWABuilder (no local Android tooling needed)
1. Deploy the site to a public HTTPS URL (see above).
2. Go to <https://www.pwabuilder.com> and enter that URL.
3. Open the **Android** package options → **Generate Package**.
   You get a signed `.apk` (for sideloading) and `.aab` (for the Play Store), built as a
   Trusted Web Activity from `manifest.webmanifest`.
4. To hide the browser UI, host the `assetlinks.json` file PWABuilder gives you at
   `/.well-known/assetlinks.json` on your domain (Digital Asset Links verification).

### Advanced: Bubblewrap CLI
Requires Node.js, a JDK, and the Android SDK installed locally.
```bash
npx @bubblewrap/cli init --manifest https://YOUR-URL/manifest.webmanifest
npx @bubblewrap/cli build
```

> Note: this machine currently has no Java/Android SDK, so the **PWABuilder** route is the
> recommended way to get an APK here.

---

## Project structure

```
index.html                 markup + PWA wiring
styles.css                 all styling (dark IPF-plate theme)
app.js                     parsing, analytics, charts, persistence, demo generator, PWA
manifest.webmanifest       PWA manifest (name, icons, theme)
sw.js                      service worker (offline, stale-while-revalidate)
vendor/                    Chart.js + PapaParse (bundled locally for offline use)
icons/                     app icons + favicon (generated barbell motif)
voorbeeld-hevy-export.csv  example of the Hevy CSV format
.claude/launch.json        local dev-server config for the preview tooling
```

## Notes & assumptions

- **Estimated 1RM** uses the Epley formula: `1RM ≈ w · (1 + reps/30)`.
- **Working sets** = every set whose `set_type` is not `warmup` (so `normal`, `failure` and `dropset` all count).
- **Exercise types** are detected automatically: weighted (`weight_kg` + `reps`), bodyweight (`reps` only), time (`duration_seconds`) or distance (`distance_km`). The muscle classifier (`muscleOf` in `app.js`) maps names to groups generically and recognises cardio — unknown exercises fall back to "Overig".
- Weights are read from Hevy's `weight_kg` column (kg); volume = weight × reps, so bodyweight/cardio work adds 0 kg of volume by design.
- The plate calculator assumes a **20 kg barbell** and standard IPF plate sizes.
- Strength-benchmark standards are general bodyweight-ratio guidelines, not federation-exact.
- All processing is client-side; nothing is uploaded.
