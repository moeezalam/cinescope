#!/usr/bin/env python3
"""
CineScope V2 — Data Preprocessing Script
=========================================
Usage:  python process.py
Input:  ../Top_10000_Movies_IMDb.csv   (place in cinescope/ root)
Output: ../data/*.json                 (13 files — commit these to git)

Libraries: numpy + pandas ONLY (+ stdlib: os, sys, json, re, ast, time, collections)
"""

import os, sys, json, re, ast, time
from collections import Counter, defaultdict

import numpy as np
import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR   = os.path.dirname(SCRIPT_DIR)
DATA_DIR   = os.path.join(ROOT_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

CSV_CANDIDATES = [
    os.path.join(ROOT_DIR,   'Top_10000_Movies_IMDb.csv'),
    os.path.join(SCRIPT_DIR, 'Top_10000_Movies_IMDb.csv'),
    os.path.join(ROOT_DIR,   'top_10k_movies.csv'),
    os.path.join(SCRIPT_DIR, 'top_10k_movies.csv'),
]

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────
TARGET_GENRES = [
    'Drama', 'Comedy', 'Action', 'Thriller', 'Romance',
    'Crime', 'Adventure', 'Sci-Fi', 'Horror', 'Biography',
    'Animation', 'Mystery',
]
MIN_DIRECTOR_FILMS   = 3
MIN_RATING_GEM       = 7.5
MAX_VOTES_GEM        = 50_000   # hidden gem: high rating, low exposure
MIN_VOTES_BLINDSPOT  = 50_000   # blindspot: high rating, well-known, unwatched

# ─────────────────────────────────────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────────────────────────────────────
def write_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    kb = os.path.getsize(path) / 1024
    print(f'  ✓  {filename:<42s}  {kb:7.1f} KB')

def parse_pylist(s):
    """Parse Python-style list string: "['Alice', 'Bob']" → ['Alice', 'Bob']"""
    if not isinstance(s, str) or not s.strip():
        return []
    try:
        val = ast.literal_eval(s.strip())
        if isinstance(val, list):
            return [str(v).strip() for v in val]
    except Exception:
        pass
    # Regex fallback
    parts = re.findall(r"'([^']+)'|\"([^\"]+)\"", s)
    return [a or b for a, b in parts]

def safe(x, default=None):
    try:
        v = float(x)
        return v if np.isfinite(v) else default
    except Exception:
        return default

def np_stat(arr):
    """Return dict of common stats for a numpy array."""
    arr = arr[~np.isnan(arr)]
    if len(arr) == 0:
        return dict(count=0, mean=None, median=None, q1=None, q3=None,
                    std=None, mn=None, mx=None)
    return dict(
        count  = int(len(arr)),
        mean   = round(float(np.mean(arr)),   2),
        median = round(float(np.median(arr)), 2),
        q1     = round(float(np.percentile(arr, 25)), 2),
        q3     = round(float(np.percentile(arr, 75)), 2),
        std    = round(float(np.std(arr)),    2),
        mn     = round(float(np.min(arr)),    2),
        mx     = round(float(np.max(arr)),    2),
    )

# ─────────────────────────────────────────────────────────────────────────────
# LOAD & CLEAN
# ─────────────────────────────────────────────────────────────────────────────
def load_csv():
    for path in CSV_CANDIDATES:
        if os.path.exists(path):
            print(f'  Reading: {path}')
            return pd.read_csv(path, encoding='utf-8', on_bad_lines='skip')
    print('ERROR: CSV not found. Expected one of:')
    for p in CSV_CANDIDATES:
        print(f'  {p}')
    sys.exit(1)

def clean(df):
    df = df.copy()

    # ── tconst ──
    df['tconst'] = df['Link'].astype(str).str.extract(r'(tt\d+)', expand=False)

    # ── numeric ──
    df['rating']    = pd.to_numeric(df['Rating'],    errors='coerce')
    df['votes']     = pd.to_numeric(df['Votes'],     errors='coerce')
    df['gross']     = pd.to_numeric(df['Gross'],     errors='coerce')
    df['metascore'] = pd.to_numeric(df['Metascore'], errors='coerce')

    # ── runtime: "142 min" → 142 ──
    df['runtime'] = (df['Runtime'].astype(str)
                     .str.extract(r'(\d+)', expand=False)
                     .pipe(pd.to_numeric, errors='coerce'))

    # ── directors list + stars list ──
    df['dirs_raw']  = df['Directors'].apply(parse_pylist)
    df['stars_raw'] = df['Stars'].apply(parse_pylist)

    # Director = first name in dirs_raw NOT appearing in stars_raw
    def extract_director(row):
        stars = set(row['stars_raw'])
        for name in row['dirs_raw']:
            if name not in stars:
                return name
        return row['dirs_raw'][0] if row['dirs_raw'] else ''

    df['director'] = df.apply(extract_director, axis=1)

    # ── genres list ──
    df['genres_list'] = (df['Genre'].astype(str)
                          .str.split(r',\s*')
                          .apply(lambda x: [g.strip() for g in x if g.strip()]))

    # ── title ──
    df['title'] = df['Movie Name'].astype(str).str.strip()

    # ── filter ──
    df = df.dropna(subset=['tconst', 'rating'])
    df = df[df['tconst'] != '']
    df = df[df['rating'].between(1.0, 10.0)]
    df = df.drop_duplicates(subset=['tconst'])

    print(f'  Rows after cleaning: {len(df):,}')
    return df.reset_index(drop=True)

# ─────────────────────────────────────────────────────────────────────────────
# GENRE INDEX — build once, reuse everywhere (no df.explode)
# ─────────────────────────────────────────────────────────────────────────────
def build_genre_idx(df):
    gi = defaultdict(list)
    for idx, row in df.iterrows():
        for g in row['genres_list']:
            gi[g].append(idx)
    return gi

# ─────────────────────────────────────────────────────────────────────────────
# GENERATORS
# ─────────────────────────────────────────────────────────────────────────────

def gen_overview(df):
    genre_ctr = Counter()
    for gl in df['genres_list']:
        genre_ctr.update(gl)
    top_genre = genre_ctr.most_common(1)[0][0] if genre_ctr else 'Drama'

    return {
        'total_movies':    int(len(df)),
        'avg_rating':      round(float(df['rating'].mean()), 2),
        'median_rating':   round(float(df['rating'].median()), 2),
        'median_runtime':  int(df['runtime'].median()) if df['runtime'].notna().any() else 0,
        'total_directors': int(df['director'].nunique()),
        'pct_revenue_data':round(float(df['gross'].notna().mean() * 100), 1),
        'top_genre':       top_genre,
        'total_genres':    int(len(genre_ctr)),
    }


def gen_rating_dist(df):
    bins  = np.arange(1.0, 10.5, 0.5)
    cnts, _ = np.histogram(df['rating'].dropna(), bins=bins)
    return {
        'labels':      [f'{b:.1f}' for b in bins[:-1]],
        'counts':      cnts.tolist(),
        'pct_above_7': round(float((df['rating'] >= 7.0).mean() * 100), 1),
        'pct_above_8': round(float((df['rating'] >= 8.0).mean() * 100), 1),
        'pct_below_5': round(float((df['rating']  < 5.0).mean() * 100), 1),
    }


def gen_genre_stats(df):
    gi     = build_genre_idx(df)
    result = {}
    for genre in TARGET_GENRES:
        if genre not in gi:
            continue
        sub = df.loc[gi[genre]]
        r   = sub['rating'].dropna().values
        rt  = sub['runtime'].dropna().values
        vv  = sub['votes'].dropna().values
        gv  = sub['gross'].dropna().values
        ms  = sub['metascore'].dropna().values
        if len(r) == 0:
            continue
        result[genre] = {
            'count':          int(len(sub)),
            'avg_rating':     round(float(np.mean(r)),            2),
            'median_rating':  round(float(np.median(r)),          2),
            'q1_rating':      round(float(np.percentile(r, 25)),  2),
            'q3_rating':      round(float(np.percentile(r, 75)),  2),
            'min_rating':     round(float(np.min(r)),             2),
            'max_rating':     round(float(np.max(r)),             2),
            'std_rating':     round(float(np.std(r)),             2),
            'median_runtime': int(np.median(rt))  if len(rt) > 0 else None,
            'median_votes':   int(np.median(vv))  if len(vv) > 0 else None,
            'avg_metascore':  round(float(np.mean(ms)), 1) if len(ms) > 0 else None,
            'avg_revenue':    round(float(np.mean(gv)) / 1e6, 1) if len(gv) > 0 else None,
        }
    return result


def gen_genre_cooccurrence(df):
    # Top 10 genres by frequency
    ctr   = Counter(g for gl in df['genres_list'] for g in gl)
    top10 = [g for g, _ in ctr.most_common(10)]
    n     = len(top10)
    gi    = {g: i for i, g in enumerate(top10)}
    mat   = [[0] * n for _ in range(n)]

    for gl in df['genres_list']:
        idx = [gi[g] for g in gl if g in gi]
        for a in idx:
            for b in idx:
                if a != b:
                    mat[a][b] += 1
    for i in range(n):
        mat[i][i] = 0

    return {'genres': top10, 'matrix': mat}


def gen_runtime_dist(df):
    rt = df['runtime'].dropna()
    edges  = list(range(40, 310, 10)) + [9999]
    labels = [f'{edges[i]}–{edges[i]+9}' for i in range(len(edges)-2)] + ['300+']
    counts = []
    for i in range(len(edges) - 1):
        counts.append(int(((rt >= edges[i]) & (rt < edges[i+1])).sum()))
    sweet = df[(df['runtime'] >= 90) & (df['runtime'] <= 120)]
    return {
        'labels':         labels,
        'counts':         counts,
        'pct_sweet_spot': round(float(len(sweet) / max(len(df), 1) * 100), 1),
        'median':         int(rt.median()),
        'p25':            int(rt.quantile(0.25)),
        'p75':            int(rt.quantile(0.75)),
    }


def gen_votes_rating(df):
    s = df.dropna(subset=['votes', 'rating']).copy()
    s = s[s['votes'] > 0]
    # Stratified sample across vote tiers
    tiers = [
        (0,         10_000,   80),
        (10_000,    50_000,   400),
        (50_000,    200_000,  700),
        (200_000,  1_000_000, 900),
        (1_000_000, 99_999_999, 500),
    ]
    parts = []
    for lo, hi, n in tiers:
        tier = s[(s['votes'] >= lo) & (s['votes'] < hi)]
        if len(tier) > 0:
            parts.append(tier.sample(min(n, len(tier)), random_state=42))
    sample = pd.concat(parts).drop_duplicates('tconst') if parts else s.head(2500)

    result = []
    for _, row in sample.iterrows():
        g = row['genres_list']
        result.append({
            't': str(row['title'])[:60],
            'r': round(float(row['rating']), 1),
            'v': int(row['votes']),
            'g': (g[:2] if g else ['Drama']),
        })
    return result


def gen_director_stats(df):
    result = {}
    for director, grp in df.groupby('director'):
        if not director or len(grp) < MIN_DIRECTOR_FILMS:
            continue
        r = grp['rating'].dropna().values
        if len(r) == 0:
            continue
        genre_ctr = Counter()
        for gl in grp['genres_list']:
            genre_ctr.update(gl)
        result[director] = {
            'count':      int(len(grp)),
            'avg_rating': round(float(np.mean(r)),   2),
            'min_rating': round(float(np.min(r)),    2),
            'max_rating': round(float(np.max(r)),    2),
            'std_rating': round(float(np.std(r)),    2),
            'top_genres': [g for g, _ in genre_ctr.most_common(3)],
        }
    return result


def gen_director_genre(df, dir_stats):
    # Top 15 directors by film count × 12 genres
    top_dirs = sorted(dir_stats.items(), key=lambda x: -x[1]['count'])[:15]
    top_names = [d for d, _ in top_dirs]
    genres    = TARGET_GENRES[:12]
    matrix    = []
    for dname in top_names:
        sub = df[df['director'] == dname]
        ctr = Counter(g for gl in sub['genres_list'] for g in gl)
        matrix.append([int(ctr.get(g, 0)) for g in genres])
    return {'directors': top_names, 'genres': genres, 'matrix': matrix}


def gen_hidden_gems(df):
    gems = df[(df['rating'] >= MIN_RATING_GEM) &
              (df['votes']  <  MAX_VOTES_GEM)].copy()
    gi   = build_genre_idx(gems)
    result = {}
    for genre in TARGET_GENRES:
        if genre not in gi:
            continue
        sub = gems.loc[gi[genre]].sort_values('rating', ascending=False).head(5)
        entries = []
        for _, row in sub.iterrows():
            entries.append({
                'title':  str(row['title'])[:80],
                'rating': round(float(row['rating']), 1),
                'votes':  int(row['votes']) if pd.notna(row['votes']) else 0,
                'genres': row['genres_list'][:3],
                'dir':    str(row['director'])[:50],
            })
        if entries:
            result[genre] = entries
    return result


def gen_movies_index(df):
    out = []
    for _, row in df.iterrows():
        g = row['genres_list']
        out.append({
            'id':  str(row['tconst']),
            't':   str(row['title'])[:80],
            'r':   round(float(row['rating']), 1),
            'v':   int(row['votes'])   if pd.notna(row['votes'])   else 0,
            'g':   g[:4],
            'dir': [str(row['director'])] if row['director'] else [],
            'rt':  int(row['runtime']) if pd.notna(row['runtime']) else None,
        })
    return out


def gen_search_index(df):
    out = []
    for _, row in df.iterrows():
        g    = row['genres_list']
        desc = str(row.get('Plot', '') or '')
        out.append({
            'id':   str(row['tconst']),
            't':    str(row['title'])[:80],
            'r':    round(float(row['rating']), 1),
            'v':    int(row['votes'])    if pd.notna(row['votes'])    else 0,
            'g':    g[:4],
            'dir':  [str(row['director'])] if row['director'] else [],
            'rt':   int(row['runtime'])  if pd.notna(row['runtime'])  else None,
            'meta': int(row['metascore'])if pd.notna(row['metascore'])else None,
            'desc': desc[:200],
        })
    return out


def gen_revenue_stats(df):
    rev = df.dropna(subset=['gross']).copy()
    top = rev.nlargest(10, 'gross')
    top_earners = [
        {'title': str(r['title'])[:60],
         'gross': round(float(r['gross']) / 1e6, 1),
         'rating': round(float(r['rating']), 1)}
        for _, r in top.iterrows()
    ]
    # Genre average revenue (Counter accumulation, not explode)
    genre_totals = defaultdict(list)
    for _, row in rev.iterrows():
        for g in row['genres_list']:
            genre_totals[g].append(float(row['gross']))
    genre_avg = {
        g: round(float(np.mean(genre_totals[g])) / 1e6, 1)
        for g in TARGET_GENRES if g in genre_totals and genre_totals[g]
    }
    return {
        'top_earners':       top_earners,
        'genre_avg_revenue': genre_avg,
        'pct_with_data':     round(float(len(rev) / max(len(df), 1) * 100), 1),
    }


def gen_metascore_stats(df):
    ms_df = df.dropna(subset=['metascore']).copy()
    both  = df.dropna(subset=['metascore', 'rating'])

    # Distribution (10-pt bins)
    bins   = list(range(0, 110, 10))
    labels = [f'{b}–{b+9}' for b in bins[:-1]]
    cnts, _= np.histogram(ms_df['metascore'], bins=bins)

    # Correlation
    corr = (float(np.corrcoef(both['metascore'].values, both['rating'].values)[0, 1])
            if len(both) > 10 else 0.0)

    # Genre comparison
    gi = build_genre_idx(df)
    genre_compare = {}
    for g in TARGET_GENRES:
        if g not in gi:
            continue
        sub    = df.loc[gi[g]]
        sub_ms = sub.dropna(subset=['metascore'])
        if len(sub_ms) < 5:
            continue
        avg_imdb = round(float(sub['rating'].mean()), 2)
        avg_meta = round(float(sub_ms['metascore'].mean()), 1)
        genre_compare[g] = {
            'avg_imdb': avg_imdb,
            'avg_meta': avg_meta,
            'gap':      round(float(avg_meta / 10 - avg_imdb), 2),
        }

    # Scatter sample
    scatter = []
    sample  = both.sample(min(2000, len(both)), random_state=42)
    for _, row in sample.iterrows():
        scatter.append({
            't': str(row['title'])[:50],
            'r': round(float(row['rating']), 1),
            'm': int(row['metascore']),
            'g': row['genres_list'][0] if row['genres_list'] else 'Drama',
        })

    # Biggest divergers
    both = both.copy()
    both['gap'] = both['metascore'] / 10 - both['rating']
    critic_loved   = both.nlargest(10,  'gap')
    audience_loved = both.nsmallest(10, 'gap')

    def film_row(r):
        return {
            't': str(r['title'])[:60],
            'r': round(float(r['rating']), 1),
            'm': int(r['metascore']),
            'g': r['genres_list'][:1],
        }

    return {
        'dist':          {'labels': labels, 'counts': cnts.tolist()},
        'overall_corr':  round(corr, 3),
        'genre_compare': genre_compare,
        'scatter':       scatter,
        'critic_loved':  [film_row(r) for _, r in critic_loved.iterrows()],
        'audience_loved':[film_row(r) for _, r in audience_loved.iterrows()],
    }


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
def main():
    t0 = time.time()
    print()
    print('╔══════════════════════════════════╗')
    print('║   CineScope V2 — process.py      ║')
    print('╚══════════════════════════════════╝')
    print()

    print('Step 1 / 3 — Loading CSV...')
    df = load_csv()
    print()

    print('Step 2 / 3 — Cleaning & transforming...')
    df = clean(df)
    print()

    print('Step 3 / 3 — Writing JSON files...')
    dir_stats = gen_director_stats(df)

    write_json('overview.json',           gen_overview(df))
    write_json('rating_dist.json',        gen_rating_dist(df))
    write_json('genre_stats.json',        gen_genre_stats(df))
    write_json('genre_cooccurrence.json', gen_genre_cooccurrence(df))
    write_json('runtime_dist.json',       gen_runtime_dist(df))
    write_json('votes_rating.json',       gen_votes_rating(df))
    write_json('director_stats.json',     dir_stats)
    write_json('director_genre.json',     gen_director_genre(df, dir_stats))
    write_json('hidden_gems.json',        gen_hidden_gems(df))
    write_json('movies_index.json',       gen_movies_index(df))
    write_json('search_index.json',       gen_search_index(df))
    write_json('revenue_stats.json',      gen_revenue_stats(df))
    write_json('metascore_stats.json',    gen_metascore_stats(df))

    elapsed = time.time() - t0
    print()
    print(f'✅  All done in {elapsed:.1f}s')
    print(f'    JSON files written to: {DATA_DIR}')
    print()
    print('Next steps:')
    print('  1. Deploy folder to Vercel (Framework: Other, Output: .)')
    print('  2. OR run: python -m http.server 8080 from cinescope/')
    print('     then open: http://localhost:8080')
    print()

if __name__ == '__main__':
    main()
