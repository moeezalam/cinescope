# CINE/SCOPE V2
### IMDb Cinephile Intelligence Dashboard

> 10,000 IMDb movies decoded — genre intelligence, director analytics,
> critic vs audience divergence, hidden gems, and personal taste profiling.
> 100% static · Zero server calls · Deployable on Vercel in one command.

---

## QUICK START (3 steps)

```bash
# 1. Place the dataset in the project root
#    Download from: https://www.kaggle.com/datasets/...
cp Top_10000_Movies_IMDb.csv cinescope/

# 2. Run the preprocessor  (one time — ~5 seconds)
cd cinescope/preprocess
pip install numpy pandas          # first time only
python process.py

# 3. Serve locally
cd ..                              # back to cinescope/
python -m http.server 8080
# → open http://localhost:8080
```

---

## FILE STRUCTURE

```
cinescope/
├── index.html               ← Dashboard entry point
├── styles.css               ← All styles (base + CineScope extensions)
├── js/
│   └── main.js              ← All charts, search, CSV upload (vanilla ES2022)
│
├── data/                    ← Pre-generated JSON — commit these to git
│   ├── overview.json
│   ├── rating_dist.json
│   ├── genre_stats.json
│   ├── genre_cooccurrence.json
│   ├── runtime_dist.json
│   ├── votes_rating.json
│   ├── director_stats.json
│   ├── director_genre.json
│   ├── hidden_gems.json
│   ├── movies_index.json
│   ├── search_index.json
│   ├── revenue_stats.json
│   └── metascore_stats.json
│
├── preprocess/
│   ├── process.py           ← Data pipeline (numpy + pandas only)
│   └── requirements.txt
│
├── notebook_basic.ipynb     ← EDA notebook (numpy + pandas only)
├── vercel.json              ← Vercel deployment config
└── README.md
```

> **Note:** `Top_10000_Movies_IMDb.csv` is NOT committed (add it to `.gitignore`).
> The `data/` JSON files are committed — they are what the dashboard reads.

---

## DEPLOYING TO VERCEL

### Option A — Vercel CLI (recommended)

```bash
cd cinescope/
npx vercel --prod
```

When prompted:
| Setting | Value |
|---------|-------|
| Framework Preset | **Other** |
| Build Command | *(leave empty)* |
| Output Directory | **`.`** (dot — the root) |
| Install Command | *(leave empty)* |

### Option B — GitHub + Vercel Dashboard

1. Push the `cinescope/` folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import repo
3. Framework: **Other** · Output directory: `.` · No build command
4. Click **Deploy**

### Option C — GitHub Pages

```bash
# In your repo settings → Pages → Deploy from branch
# Branch: main · Folder: / (root) or /cinescope
```

---

## USING YOUR PERSONAL REEL (Reel 5)

1. Go to your [IMDb profile](https://www.imdb.com/) while logged in
2. Click **Your ratings** (or Ratings in the menu)
3. Click the **⋯** three-dot menu in the top-right corner
4. Select **Export** — a `.csv` file downloads automatically
5. Open the dashboard → scroll to **Reel 5: Your Reel**
6. Drag-and-drop or click to upload the `.csv`

Your data never leaves your browser — all processing is done locally with PapaParse.

---

## REPROCESSING DATA

Run `process.py` again whenever you update the CSV:

```bash
cd cinescope/preprocess
python process.py
```

You do **not** need to reprocess to use the dashboard — the `data/` JSON files
are pre-generated and loaded directly by `index.html` via `fetch()`.

Only re-run `process.py` if you:
- Switch to a newer/different version of the CSV
- Want to refresh the hidden gems / director data

---

## WHAT EACH REEL SHOWS

| Reel | Name | Colour | Key Content |
|------|------|--------|-------------|
| 1 | The Global Stage | Teal | Overview stats, rating dist, votes×quality scatter, genre landscape, co-occurrence heatmap, runtime dist |
| 2 | The Critic's Eye | Red | Metascore vs IMDb scatter (2K films), genre divergence, critic darlings, audience favourites |
| 3 | The Directors' Cut | Blue | Prolific leaderboard, rating range dot plot, director × genre heatmap |
| 4 | Genre Deep Dive | Purple | Runtime, engagement, consistency, revenue — hidden gems cards |
| 5 | Your Reel | Ochre | Upload CSV → viewing patterns, taste profile, blindspots, personalised recs |

---

## DEPENDENCIES

### Runtime (CDN, no install)
| Library | Version | Purpose |
|---------|---------|---------|
| Chart.js | 4.4.1 | All charts |
| PapaParse | 5.4.1 | CSV parsing (Reel 5) |

### Preprocessing (Python)
| Library | Purpose |
|---------|---------|
| numpy | Statistics, histograms, correlation |
| pandas | CSV loading, groupby, sampling |

No build step, no webpack, no npm required for the dashboard.

---

## NOTES

- The `data/` folder should be **committed to git** — this is what makes Vercel
  deployments frictionless. The dashboard reads static JSON, not a live database.
- `search_index.json` is ~2.8MB and is loaded lazily on first keystroke.
- `movies_index.json` is ~1.2MB and is loaded at startup for Reel 5 recommendations.
- If both fail to load (e.g. opened as `file://`), the dashboard falls back to
  compact sample data and shows a notice at the top.

---

*CineScope V2 — EDA Assignment · Built with NumPy, Pandas, Chart.js*
