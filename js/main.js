/**
 * CineScope V2 — js/main.js
 * Vanilla ES2022 module. No frameworks. No build step.
 * Chart.js 4.4.1 + PapaParse 5.4.1 loaded via CDN in index.html.
 *
 * Architecture:
 *  1. Constants & state
 *  2. Fallback (sample) data — used when fetch() fails (e.g. file://)
 *  3. Utilities
 *  4. Data loading — sequential, per-file fallback
 *  5. Reel renderers 1-4 + heatmap/dumbbell helpers
 *  6. Search (lazy-loaded on first keystroke)
 *  7. Reel 5 — CSV upload + personal analytics
 *  8. UI handlers (collapse, sub-tabs, pill filters)
 *  9. init() — orchestrates everything
 *     hideLoader() is called BEFORE renderAll()
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONSTANTS & STATE
// ─────────────────────────────────────────────────────────────────────────────
const GENRE_COLORS = {
  Drama:      '#c62828', Comedy:    '#ea580c', Action:   '#1d4ed8',
  Thriller:   '#6b21a8', Romance:   '#e91e63', Crime:    '#374151',
  Adventure:  '#00695c', 'Sci-Fi':  '#0e7c7b', Horror:   '#4b5563',
  Biography:  '#cd7e2d', Animation: '#65a30d', Mystery:  '#1d3461',
};
const GENRE_LIST = Object.keys(GENRE_COLORS);

const MOOD_GENRES = {
  ALL:        null,
  EXCITING:   ['Action', 'Adventure', 'Thriller'],
  THOUGHTFUL: ['Drama', 'Biography', 'Mystery'],
  LIGHT:      ['Comedy', 'Animation', 'Romance'],
  DARK:       ['Horror', 'Crime', 'Thriller'],
  EPIC:       ['Adventure', 'Action', 'Sci-Fi'],
};

const DATA    = {};   // loaded JSON files keyed by name
const _charts = {};   // Chart instances keyed by canvas id

// Chart.js global defaults
if (typeof Chart !== 'undefined') {
  Chart.defaults.font.family  = "'DM Mono', monospace";
  Chart.defaults.font.size    = 11;
  Chart.defaults.color        = '#0c0a08';
  Chart.defaults.borderColor  = 'rgba(12,10,8,.1)';
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.animation    = { duration: 400, easing: 'easeOutQuart' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FALLBACK (SAMPLE) DATA
// ─────────────────────────────────────────────────────────────────────────────
const FALLBACK = {
  overview: {
    total_movies:9999, avg_rating:6.92, median_rating:6.9,
    median_runtime:105, total_directors:3821, pct_revenue_data:78.4,
    top_genre:'Drama', total_genres:27,
  },
  rating_dist: {
    labels:['1.0','1.5','2.0','2.5','3.0','3.5','4.0','4.5','5.0','5.5',
            '6.0','6.5','7.0','7.5','8.0','8.5','9.0','9.5'],
    counts:[12,18,34,58,99,180,310,450,720,950,1100,1300,1450,1100,700,350,90,28],
    pct_above_7:38.2, pct_above_8:11.7, pct_below_5:1.4,
  },
  genre_stats: {
    Drama:     {count:4500,avg_rating:7.05,median_rating:7.0,q1_rating:6.4,q3_rating:7.7,min_rating:2.1,max_rating:9.3,std_rating:0.88,median_runtime:115,median_votes:42000,avg_metascore:61.2,avg_revenue:28.4},
    Comedy:    {count:2800,avg_rating:6.72,median_rating:6.7,q1_rating:6.1,q3_rating:7.3,min_rating:1.8,max_rating:9.0,std_rating:0.92,median_runtime:95,median_votes:28000,avg_metascore:55.8,avg_revenue:42.1},
    Action:    {count:2600,avg_rating:6.64,median_rating:6.6,q1_rating:5.9,q3_rating:7.2,min_rating:1.5,max_rating:9.0,std_rating:0.98,median_runtime:110,median_votes:85000,avg_metascore:51.3,avg_revenue:94.7},
    Thriller:  {count:2200,avg_rating:6.85,median_rating:6.8,q1_rating:6.2,q3_rating:7.5,min_rating:2.0,max_rating:9.0,std_rating:0.89,median_runtime:108,median_votes:56000,avg_metascore:58.4,avg_revenue:38.6},
    Crime:     {count:1900,avg_rating:7.12,median_rating:7.1,q1_rating:6.5,q3_rating:7.8,min_rating:2.5,max_rating:9.2,std_rating:0.82,median_runtime:112,median_votes:64000,avg_metascore:62.1,avg_revenue:31.2},
    Horror:    {count:1400,avg_rating:6.21,median_rating:6.1,q1_rating:5.5,q3_rating:6.8,min_rating:1.5,max_rating:8.5,std_rating:0.95,median_runtime:98,median_votes:38000,avg_metascore:49.7,avg_revenue:25.8},
    Adventure: {count:1800,avg_rating:6.78,median_rating:6.8,q1_rating:6.1,q3_rating:7.4,min_rating:1.8,max_rating:8.8,std_rating:0.91,median_runtime:115,median_votes:72000,avg_metascore:57.9,avg_revenue:82.3},
    'Sci-Fi':  {count:1200,avg_rating:6.88,median_rating:6.9,q1_rating:6.2,q3_rating:7.5,min_rating:1.9,max_rating:9.0,std_rating:0.88,median_runtime:112,median_votes:68000,avg_metascore:58.6,avg_revenue:76.4},
    Biography: {count:1100,avg_rating:7.08,median_rating:7.1,q1_rating:6.4,q3_rating:7.7,min_rating:2.2,max_rating:8.8,std_rating:0.85,median_runtime:122,median_votes:45000,avg_metascore:68.4,avg_revenue:24.1},
    Animation: {count:620,avg_rating:7.15,median_rating:7.2,q1_rating:6.5,q3_rating:7.9,min_rating:2.4,max_rating:9.0,std_rating:0.84,median_runtime:92,median_votes:58000,avg_metascore:66.3,avg_revenue:96.8},
    Romance:   {count:1300,avg_rating:6.62,median_rating:6.6,q1_rating:5.9,q3_rating:7.2,min_rating:1.6,max_rating:8.8,std_rating:0.94,median_runtime:104,median_votes:31000,avg_metascore:54.2,avg_revenue:19.6},
    Mystery:   {count:980,avg_rating:7.02,median_rating:7.0,q1_rating:6.4,q3_rating:7.7,min_rating:2.1,max_rating:8.9,std_rating:0.86,median_runtime:108,median_votes:48000,avg_metascore:61.8,avg_revenue:22.4},
  },
  genre_cooccurrence: {
    genres: ['Drama','Comedy','Action','Thriller','Crime','Adventure','Romance','Horror','Sci-Fi','Biography'],
    matrix: [
      [0,320,180,420,510,250,380,90,110,420],
      [320,0,120,110,90,180,450,60,70,80],
      [180,120,0,380,200,620,60,80,350,40],
      [420,110,380,0,480,280,120,210,180,60],
      [510,90,200,480,0,150,110,120,80,180],
      [250,180,620,280,150,0,90,60,420,50],
      [380,450,60,120,110,90,0,40,50,90],
      [90,60,80,210,120,60,40,0,90,20],
      [110,70,350,180,80,420,50,90,0,30],
      [420,80,40,60,180,50,90,20,30,0],
    ],
  },
  runtime_dist: {
    labels:['40–49','50–59','60–69','70–79','80–89','90–99','100–109','110–119','120–129','130–139','140–149','150–159','160–169','170–179','180–189','190–199','200–209','210–219','220–229','230–239','240–249','250–259','260–269','270–279','280–289','290–299','300+'],
    counts:[8,18,42,98,280,720,980,820,650,480,360,220,150,90,60,40,25,18,10,6,4,3,2,1,1,1,12],
    pct_sweet_spot:17.3, median:105, p25:92, p75:122,
  },
  director_stats: {},
  director_genre: {
    directors:['Steven Spielberg','Martin Scorsese','Clint Eastwood','Woody Allen','Brian De Palma','Ron Howard','Ridley Scott','David Fincher','Christopher Nolan','Tim Burton','Joel Coen','Ethan Coen','Francis Coppola','Sidney Lumet','Mike Leigh'],
    genres:['Drama','Comedy','Action','Thriller','Crime','Adventure','Romance','Horror','Sci-Fi','Biography','Animation','Mystery'],
    matrix:[
      [8,1,5,3,2,6,1,0,4,2,0,1],[12,2,3,8,5,1,0,0,0,4,0,2],[10,4,2,1,2,1,2,0,0,3,0,0],
      [8,9,1,2,1,1,4,0,0,1,0,1],[4,1,5,8,3,1,1,1,0,0,0,0],[5,2,3,1,1,6,1,0,3,2,0,0],
      [3,1,4,3,2,5,1,0,4,1,0,1],[4,1,2,5,4,1,1,0,2,1,0,2],[5,0,1,2,1,2,0,0,5,1,0,1],
      [3,2,1,2,1,1,3,3,1,0,0,0],[5,1,1,2,4,1,0,0,0,1,0,2],[5,1,1,2,4,1,0,0,0,1,0,2],
      [5,1,2,3,4,2,1,0,0,2,0,1],[8,1,0,3,5,0,1,0,0,2,0,1],[7,2,0,1,1,0,2,0,0,1,0,1],
    ],
  },
  hidden_gems: {
    Drama:     [{title:'The Wailing',rating:7.5,votes:49000,genres:['Drama','Horror'],dir:'Na Hong-jin'}],
    Action:    [{title:'The Raid',rating:7.6,votes:38000,genres:['Action','Thriller'],dir:'Gareth Evans'}],
    Thriller:  [{title:'Coherence',rating:7.2,votes:32000,genres:['Thriller','Sci-Fi'],dir:'James Ward Byrkit'}],
    Horror:    [{title:'The Autopsy',rating:7.5,votes:28000,genres:['Horror','Mystery'],dir:'André Øvredal'}],
    Animation: [{title:'The Congress',rating:6.5,votes:21000,genres:['Animation','Drama'],dir:'Ari Folman'}],
  },
  metascore_stats: {
    dist: {
      labels:['0–9','10–19','20–29','30–39','40–49','50–59','60–69','70–79','80–89','90–99'],
      counts:[10,28,85,180,320,580,720,480,210,90],
    },
    overall_corr: 0.712,
    genre_compare: {
      Drama:     {avg_imdb:7.05,avg_meta:61.2,gap:0.17},
      Comedy:    {avg_imdb:6.72,avg_meta:55.8,gap:-0.14},
      Action:    {avg_imdb:6.64,avg_meta:51.3,gap:-0.51},
      Thriller:  {avg_imdb:6.85,avg_meta:58.4,gap:-0.27},
      Crime:     {avg_imdb:7.12,avg_meta:62.1,gap:0.09},
      Horror:    {avg_imdb:6.21,avg_meta:49.7,gap:-0.72},
      Adventure: {avg_imdb:6.78,avg_meta:57.9,gap:-0.21},
      'Sci-Fi':  {avg_imdb:6.88,avg_meta:58.6,gap:-0.22},
      Biography: {avg_imdb:7.08,avg_meta:68.4,gap:0.76},
      Animation: {avg_imdb:7.15,avg_meta:66.3,gap:0.51},
      Romance:   {avg_imdb:6.62,avg_meta:54.2,gap:-0.20},
      Mystery:   {avg_imdb:7.02,avg_meta:61.8,gap:0.16},
    },
    scatter: [],
    critic_loved: [
      {t:'Certified Copy',r:7.1,m:87,g:['Drama']},{t:'Holy Motors',r:6.9,m:84,g:['Drama']},
      {t:'A Separation',r:8.3,m:95,g:['Drama']},
    ],
    audience_loved: [
      {t:'Transformers',r:7.1,m:61,g:['Action']},{t:'Fast Five',r:7.3,m:66,g:['Action']},
    ],
  },
  revenue_stats: {
    genre_avg_revenue: {Animation:96.8,Action:94.7,Adventure:82.3,'Sci-Fi':76.4,Comedy:42.1,Thriller:38.6,Drama:28.4,Horror:25.8,Biography:24.1,Mystery:22.4,Romance:19.6,Crime:31.2},
    top_earners:[],
    pct_with_data:78.4,
  },
  votes_rating: [],
  movies_index: [],
  search_index: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
const el = id => {
  const e = document.getElementById(id);
  if (!e) console.warn(`[CineScope] el('${id}') not found`);
  return e;
};

const setEl = (id, html) => {
  const e = el(id);
  if (e) e.innerHTML = html;
};

function mkChart(id, config) {
  const canvas = el(id);
  if (!canvas) return null;
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  try {
    _charts[id] = new Chart(canvas, config);
    return _charts[id];
  } catch(e) {
    console.warn(`[CineScope] mkChart(${id}) failed:`, e);
    return null;
  }
}

function safeRender(fn, label) {
  try { fn(); }
  catch(e) { console.error(`[CineScope] render ${label} failed:`, e); }
}

function ratingColor(r) {
  if (r >= 8.0) return '#00695c';
  if (r >= 7.5) return '#00876a';
  if (r >= 7.0) return '#cd7e2d';
  return '#c62828';
}

function genreColor(g) {
  return GENRE_COLORS[g] || '#374151';
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${Math.max(0.04, alpha)})`;
}

function numFmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(0)+'K';
  return String(n);
}

function sorted(arr, keyFn, desc = true) {
  return [...arr].sort((a,b) => desc ? keyFn(b)-keyFn(a) : keyFn(a)-keyFn(b));
}

function setLoad(msg, pct) {
  const bar   = el('pl-bar');
  const label = el('pl-label');
  if (bar)   bar.style.width   = `${pct}%`;
  if (label) label.textContent = msg;
}

function hideLoader() {
  const overlay = el('page-loading');
  if (!overlay) return;
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DATA LOADING — sequential, per-file fallback
// ─────────────────────────────────────────────────────────────────────────────
async function loadJSON(key, filename) {
  try {
    const res = await fetch(`data/${filename}`);
    if (!res.ok) throw new Error(res.status);
    DATA[key] = await res.json();
  } catch {
    DATA[key] = FALLBACK[key] ?? null;
    console.warn(`[CineScope] ${filename} not loaded — using fallback`);
  }
}

async function loadAll() {
  const files = [
    ['overview',           'overview.json',          10],
    ['rating_dist',        'rating_dist.json',        18],
    ['genre_stats',        'genre_stats.json',        26],
    ['genre_cooccurrence', 'genre_cooccurrence.json', 34],
    ['runtime_dist',       'runtime_dist.json',       42],
    ['votes_rating',       'votes_rating.json',       52],
    ['director_stats',     'director_stats.json',     64],
    ['director_genre',     'director_genre.json',     72],
    ['hidden_gems',        'hidden_gems.json',        78],
    ['movies_index',       'movies_index.json',       86],
    ['revenue_stats',      'revenue_stats.json',      91],
    ['metascore_stats',    'metascore_stats.json',    97],
  ];

  for (const [key, file, pct] of files) {
    setLoad(`LOADING ${file.replace('.json','').toUpperCase().replace('_',' ')}…`, pct);
    await loadJSON(key, file);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. REEL RENDERERS
// ─────────────────────────────────────────────────────────────────────────────

/* ── Reel 1: Global Stage ─────────────────────────────────────────────────── */
function renderReel1() {
  const ov = DATA.overview || FALLBACK.overview;
  setEl('r1-total',     ov.total_movies?.toLocaleString() ?? '—');
  setEl('r1-avg',       ov.avg_rating?.toFixed(2)         ?? '—');
  setEl('r1-median',    ov.median_rating?.toFixed(1)      ?? '—');
  setEl('r1-runtime',   ov.median_runtime                 ?? '—');
  setEl('r1-directors', ov.total_directors?.toLocaleString() ?? '—');
  setEl('r1-revenue',   ov.pct_revenue_data ? ov.pct_revenue_data + '%' : '—');
  setEl('r1-top-genre', ov.top_genre                      ?? '—');

  // ── Rating distribution ──
  const rd = DATA.rating_dist || FALLBACK.rating_dist;
  mkChart('r1-rating-dist', {
    type: 'bar',
    data: {
      labels: rd.labels,
      datasets: [{
        data: rd.counts,
        backgroundColor: rd.labels.map(l => {
          const v = parseFloat(l);
          return v >= 8 ? '#00695c' : v >= 7 ? '#cd7e2d' : v >= 5 ? '#c62828' : '#4b5563';
        }),
        borderWidth: 0, borderRadius: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        title: ctx => `Rating ${ctx[0].label}–${(parseFloat(ctx[0].label)+0.5).toFixed(1)}`,
        label: ctx => ` ${ctx.raw.toLocaleString()} films`,
      }}},
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:10},maxRotation:0} },
        y: { grid:{color:'rgba(12,10,8,.08)'}, ticks:{maxTicksLimit:5} },
      },
    },
  });
  setEl('r1-rating-insight',
    `<span class="insight-label">★ Insight</span>
     ${rd.pct_above_7}% of films rate ≥ 7.0 · ${rd.pct_above_8}% rate ≥ 8.0 ·
     Only ${rd.pct_below_5}% fall below 5.0 — IMDb's sample selection skews this dataset toward better films.`
  );

  // ── Votes vs Quality scatter ──
  const vr = DATA.votes_rating || FALLBACK.votes_rating;
  if (vr.length) {
    mkChart('r1-scatter', {
      type: 'scatter',
      data: {
        datasets: [{
          data: vr.map(d => ({ x: Math.log10(Math.max(d.v, 1)), y: d.r, _t: d.t, _g: d.g?.[0] })),
          backgroundColor: vr.map(d => hexToRgba(genreColor(d.g?.[0] || 'Drama'), 0.55)),
          pointRadius: 2.5, pointHoverRadius: 5, borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend:{display:false}, tooltip:{ callbacks:{
          label: ctx => ` ${ctx.raw._t} · Rating ${ctx.raw.y} · ${numFmt(Math.pow(10, ctx.raw.x).toFixed(0))} votes`,
        }}},
        scales: {
          x: { title:{display:true,text:'log₁₀(Votes)',font:{size:10}}, grid:{color:'rgba(12,10,8,.06)'} },
          y: { title:{display:true,text:'IMDb Rating',font:{size:10}}, min:1, max:10, grid:{color:'rgba(12,10,8,.06)'} },
        },
      },
    });
  }

  // ── Genre landscape (count + box plot) ──
  const gs = DATA.genre_stats || FALLBACK.genre_stats;
  const genres = GENRE_LIST.filter(g => gs[g]);
  const sortedByCount = [...genres].sort((a,b) => (gs[b]?.count||0) - (gs[a]?.count||0));

  mkChart('r1-genre-count', {
    type: 'bar',
    data: {
      labels: sortedByCount,
      datasets: [{
        data: sortedByCount.map(g => gs[g]?.count || 0),
        backgroundColor: sortedByCount.map(g => genreColor(g)),
        borderWidth: 0, borderRadius: 2,
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        label: ctx => ` ${ctx.raw.toLocaleString()} films`,
      }}},
      scales: {
        x: { grid:{color:'rgba(12,10,8,.08)'}, ticks:{maxTicksLimit:5} },
        y: { grid:{display:false}, ticks:{font:{size:10}} },
      },
    },
  });

  // Box plot simulation: [q1, q3] floating bars + median scatter
  mkChart('r1-genre-box', {
    type: 'bar',
    data: {
      labels: sortedByCount,
      datasets: [
        {
          label: 'IQR (Q1–Q3)',
          data: sortedByCount.map(g => [gs[g]?.q1_rating || 0, gs[g]?.q3_rating || 0]),
          backgroundColor: sortedByCount.map(g => hexToRgba(genreColor(g), 0.75)),
          borderColor: sortedByCount.map(g => genreColor(g)),
          borderWidth: 1, borderRadius: 2, borderSkipped: false,
        },
        {
          type: 'scatter',
          label: 'Median',
          data: sortedByCount.map((g, i) => ({ x: gs[g]?.median_rating || 0, y: i })),
          backgroundColor: '#0c0a08',
          pointStyle: 'line', pointRadius: 10, pointBorderWidth: 2,
          borderColor: '#0c0a08',
        },
      ],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        title: ctx => ctx[0].label,
        label: ctx => {
          const g = ctx.label || sortedByCount[ctx.dataIndex];
          const s = gs[g];
          return s ? ` Q1 ${s.q1_rating} — Med ${s.median_rating} — Q3 ${s.q3_rating}` : '';
        },
      }}},
      scales: {
        x: { min:5, max:9.5, grid:{color:'rgba(12,10,8,.08)'}, title:{display:true,text:'IMDb Rating',font:{size:10}} },
        y: { grid:{display:false}, ticks:{display:false} },
      },
    },
  });

  const topByCount = sortedByCount[0];
  const topByRating = [...genres].sort((a,b) => (gs[b]?.avg_rating||0) - (gs[a]?.avg_rating||0))[0];
  setEl('r1-genre-insight',
    `<span class="insight-label">★ Insight</span>
     <b>${topByCount}</b> is the most common genre (${gs[topByCount]?.count?.toLocaleString()} films) ·
     <b>${topByRating}</b> has the highest average rating (${gs[topByRating]?.avg_rating}).
     Animation and Crime tend to be the most consistent in quality (lowest std deviation).`
  );

  // ── Co-occurrence heatmap ──
  const co = DATA.genre_cooccurrence || FALLBACK.genre_cooccurrence;
  if (co?.genres && co.matrix) {
    renderHeatmap('r1-cooc-container', co.genres, co.genres, co.matrix, '#00695c');
    const pairs = [];
    for (let i=0; i<co.genres.length; i++) {
      for (let j=i+1; j<co.genres.length; j++) {
        if (co.matrix[i]?.[j]) pairs.push({a:co.genres[i], b:co.genres[j], v:co.matrix[i][j]});
      }
    }
    const top = pairs.sort((a,b)=>b.v-a.v)[0];
    setEl('r1-cooc-insight',
      `<span class="insight-label">★ Insight</span>
       Most co-occurring pair: <b>${top?.a}</b> + <b>${top?.b}</b> (${top?.v?.toLocaleString()} films).
       Drama appears alongside almost every other genre.`
    );
  }

  // ── Runtime distribution ──
  const rt = DATA.runtime_dist || FALLBACK.runtime_dist;
  mkChart('r1-runtime-dist', {
    type: 'bar',
    data: {
      labels: rt.labels,
      datasets: [{
        data: rt.counts,
        backgroundColor: rt.counts.map((_, i) => {
          const base = 40 + i*10;
          return (base >= 90 && base <= 120) ? '#00695c' : 'rgba(12,10,8,0.35)';
        }),
        borderWidth: 0, borderRadius: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        title: ctx => `Runtime ${ctx[0].label} min`,
        label: ctx => ` ${ctx.raw.toLocaleString()} films`,
      }}},
      scales: {
        x: { grid:{display:false}, ticks:{maxRotation:60, font:{size:9}, callback:(v,i) => i%3===0?rt.labels[i]:''} },
        y: { grid:{color:'rgba(12,10,8,.08)'}, ticks:{maxTicksLimit:5} },
      },
    },
  });
  setEl('r1-runtime-insight',
    `<span class="insight-label">★ Insight</span>
     Median runtime: <b>${rt.median} min</b> · Sweet spot 90–120 min: <b>${rt.pct_sweet_spot}%</b> of all films.
     Epic films (150+ min) represent a small but high-rated niche.`
  );
}

/* ── Reel 2: The Critic's Eye ─────────────────────────────────────────────── */
function renderReel2() {
  const ms = DATA.metascore_stats || FALLBACK.metascore_stats;

  // ── Scatter: Metascore vs IMDb ──
  const scatter = ms.scatter || [];
  if (scatter.length) {
    mkChart('r2-scatter', {
      type: 'scatter',
      data: {
        datasets: [{
          data: scatter.map(d => ({ x: d.r, y: d.m, _t: d.t, _g: d.g })),
          backgroundColor: scatter.map(d => hexToRgba(genreColor(d.g), 0.5)),
          pointRadius: 2.5, pointHoverRadius: 5, borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend:{display:false}, tooltip:{ callbacks:{
          label: ctx => ` ${ctx.raw._t} · IMDb ${ctx.raw.x} · Meta ${ctx.raw.y}`,
        }}},
        scales: {
          x: { min:1, max:10, title:{display:true,text:'IMDb Rating',font:{size:10}}, grid:{color:'rgba(12,10,8,.06)'} },
          y: { min:0, max:100, title:{display:true,text:'Metascore',font:{size:10}}, grid:{color:'rgba(12,10,8,.06)'} },
        },
      },
    });
  }
  const corr = ms.overall_corr || 0;
  setEl('r2-scatter-insight',
    `<span class="insight-label">★ Insight</span>
     Pearson correlation: <b>${corr.toFixed(3)}</b> —
     ${corr > 0.7 ? 'strong' : corr > 0.4 ? 'moderate' : 'weak'} positive agreement between critics and audiences.
     Points far above the diagonal = critics loved it more. Far below = audiences did.`
  );

  // ── Genre divergence grouped bar ──
  const gc = ms.genre_compare || FALLBACK.metascore_stats.genre_compare;
  const gcGenres = GENRE_LIST.filter(g => gc[g]);
  mkChart('r2-genre-compare', {
    type: 'bar',
    data: {
      labels: gcGenres,
      datasets: [
        {
          label: 'IMDb Avg',
          data: gcGenres.map(g => gc[g]?.avg_imdb || 0),
          backgroundColor: 'rgba(29,78,216,0.75)',
          borderWidth: 0, borderRadius: 2,
        },
        {
          label: 'Metascore ÷10',
          data: gcGenres.map(g => (gc[g]?.avg_meta || 0) / 10),
          backgroundColor: 'rgba(198,40,40,0.75)',
          borderWidth: 0, borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: {display:true, position:'top', labels:{font:{size:10}, boxWidth:12}},
        tooltip:{ callbacks:{
          label: ctx => ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)}`,
        }},
      },
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:10},maxRotation:45} },
        y: { min:5.5, max:8, grid:{color:'rgba(12,10,8,.08)'}, ticks:{maxTicksLimit:6} },
      },
    },
  });
  const mostDiverge = gcGenres.sort((a,b) => Math.abs((gc[b]?.gap||0)) - Math.abs((gc[a]?.gap||0)))[0];
  const gapSign = (gc[mostDiverge]?.gap || 0) > 0 ? 'critics rate higher' : 'audiences rate higher';
  setEl('r2-genre-insight',
    `<span class="insight-label">★ Insight</span>
     <b>${mostDiverge}</b> shows the largest critic/audience gap — ${gapSign}.
     Biography films are consistently rated higher by critics than by audiences.`
  );

  // ── Metascore distribution ──
  const dist = ms.dist || FALLBACK.metascore_stats.dist;
  mkChart('r2-meta-dist', {
    type: 'bar',
    data: {
      labels: dist.labels,
      datasets: [{
        data: dist.counts,
        backgroundColor: dist.labels.map(l => {
          const v = parseInt(l);
          return v >= 80 ? '#00695c' : v >= 60 ? '#cd7e2d' : v >= 40 ? '#c62828' : '#4b5563';
        }),
        borderWidth: 0, borderRadius: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        label: ctx => ` ${ctx.raw.toLocaleString()} films`,
      }}},
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:10}} },
        y: { grid:{color:'rgba(12,10,8,.08)'}, ticks:{maxTicksLimit:5} },
      },
    },
  });
  setEl('r2-dist-insight',
    `<span class="insight-label">★ Insight</span>
     Most Metascores cluster between 50–70. Very few films score above 80 (critical consensus masterpieces).`
  );

  // ── Critic darlings + Audience favourites ──
  const filmRow = (d, gapLabel, gapClass) => `
    <div class="film-row">
      <span class="film-row-title">${d.t}</span>
      <span class="film-row-imdb">★ ${d.r}</span>
      <span class="film-row-meta">Meta ${d.m}</span>
      <span class="film-row-gap ${gapClass}">${gapLabel}</span>
    </div>`;

  const cl = ms.critic_loved || [];
  const al = ms.audience_loved || [];
  setEl('r2-critic-list',   cl.slice(0,8).map(d => filmRow(d, `+${(d.m/10 - d.r).toFixed(1)}`, 'pos')).join(''));
  setEl('r2-audience-list', al.slice(0,8).map(d => filmRow(d, `${(d.m/10 - d.r).toFixed(1)}`, 'neg')).join(''));
}

/* ── Reel 3: Directors' Cut ───────────────────────────────────────────────── */
function renderReel3() {
  const ds = DATA.director_stats || FALLBACK.director_stats;
  const dg = DATA.director_genre  || FALLBACK.director_genre;

  const dirs = Object.entries(ds);
  if (!dirs.length) {
    setEl('r3-leader-insight','<span class="insight-label">★ Insight</span>Director data not available — re-run process.py');
    return;
  }

  // Top 15 by film count
  const top15Count = dirs
    .sort((a,b) => b[1].count - a[1].count)
    .slice(0,15);

  mkChart('r3-prolific', {
    type: 'bar',
    data: {
      labels: top15Count.map(d => d[0]),
      datasets: [{
        data: top15Count.map(d => d[1].count),
        backgroundColor: top15Count.map(d => ratingColor(d[1].avg_rating)),
        borderWidth: 0, borderRadius: 2,
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        label: ctx => {
          const d = top15Count[ctx.dataIndex]?.[1];
          return ` ${ctx.raw} films · Avg ★ ${d?.avg_rating}`;
        },
      }}},
      scales: {
        x: { grid:{color:'rgba(12,10,8,.08)'}, ticks:{maxTicksLimit:5} },
        y: { grid:{display:false}, ticks:{font:{size:10}} },
      },
    },
  });

  // Top 15 by avg rating (min 5 films) — floating bar [min, max] + scatter at avg
  const top15Rated = dirs
    .filter(d => d[1].count >= 5)
    .sort((a,b) => b[1].avg_rating - a[1].avg_rating)
    .slice(0,15);

  mkChart('r3-rated', {
    type: 'bar',
    data: {
      labels: top15Rated.map(d => d[0]),
      datasets: [
        {
          label: 'Rating Range',
          data: top15Rated.map(d => [d[1].min_rating, d[1].max_rating]),
          backgroundColor: top15Rated.map(d => hexToRgba(ratingColor(d[1].avg_rating), 0.25)),
          borderColor: top15Rated.map(d => ratingColor(d[1].avg_rating)),
          borderWidth: 1, borderRadius: 2, borderSkipped: false,
        },
        {
          type: 'scatter',
          label: 'Avg Rating',
          data: top15Rated.map((d, i) => ({ x: d[1].avg_rating, y: i })),
          backgroundColor: top15Rated.map(d => ratingColor(d[1].avg_rating)),
          pointRadius: 6, pointHoverRadius: 8,
          borderColor: '#0c0a08', borderWidth: 1,
        },
      ],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        label: ctx => {
          const d = top15Rated[ctx.dataIndex]?.[1];
          return d ? ` Avg ${d.avg_rating} · Range ${d.min_rating}–${d.max_rating} (${d.count} films)` : '';
        },
      }}},
      scales: {
        x: { min:5, max:10, grid:{color:'rgba(12,10,8,.08)'}, title:{display:true,text:'Rating',font:{size:10}} },
        y: { grid:{display:false}, ticks:{font:{size:10}} },
      },
    },
  });

  const topDir = top15Count[0];
  const mostConsistent = dirs.filter(d=>d[1].count>=5).sort((a,b)=>a[1].std_rating-b[1].std_rating)[0];
  setEl('r3-leader-insight',
    `<span class="insight-label">★ Insight</span>
     <b>${topDir?.[0]}</b> leads in output with ${topDir?.[1]?.count} films in the Top 10K.
     <b>${mostConsistent?.[0]}</b> is the most consistent director (std dev ${mostConsistent?.[1]?.std_rating?.toFixed(2)}).`
  );

  // Director × Genre heatmap
  if (dg?.directors && dg?.genres && dg?.matrix) {
    renderHeatmap('r3-heatmap-container', dg.directors, dg.genres, dg.matrix, '#1d4ed8');
    setEl('r3-heatmap-insight',
      `<span class="insight-label">★ Insight</span>
       Intensity = number of films in that genre. Dark cells reveal a director's home turf.
       Versatile directors spread across many genres while specialists dominate one column.`
    );
  }
}

/* ── Reel 4: Genre Deep Dive ──────────────────────────────────────────────── */
function renderReel4() {
  const gs  = DATA.genre_stats   || FALLBACK.genre_stats;
  const rev = DATA.revenue_stats || FALLBACK.revenue_stats;
  const hg  = DATA.hidden_gems   || FALLBACK.hidden_gems;

  const genres = GENRE_LIST.filter(g => gs[g]);

  // ── Runtime by genre ──
  const byRuntime = [...genres].sort((a,b) => (gs[b]?.median_runtime||0) - (gs[a]?.median_runtime||0));
  mkChart('r4-runtime', {
    type: 'bar',
    data: {
      labels: byRuntime,
      datasets: [{
        data: byRuntime.map(g => gs[g]?.median_runtime || 0),
        backgroundColor: byRuntime.map(g => genreColor(g)),
        borderWidth: 0, borderRadius: 2,
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        label: ctx => ` ${ctx.raw} min median runtime`,
      }}},
      scales: {
        x: { min:80, grid:{color:'rgba(12,10,8,.08)'}, ticks:{maxTicksLimit:5}, title:{display:true,text:'Minutes',font:{size:10}} },
        y: { grid:{display:false}, ticks:{font:{size:10}} },
      },
    },
  });
  const longest = byRuntime[0];
  setEl('r4-runtime-insight',
    `<span class="insight-label">★ Insight</span>
     <b>${longest}</b> films run longest on average (${gs[longest]?.median_runtime} min). 
     Animation and Comedy are the quickest watches.`
  );

  // ── Audience engagement (median votes) ──
  const byVotes = [...genres].sort((a,b) => (gs[b]?.median_votes||0) - (gs[a]?.median_votes||0));
  mkChart('r4-votes', {
    type: 'bar',
    data: {
      labels: byVotes,
      datasets: [{
        data: byVotes.map(g => gs[g]?.median_votes || 0),
        backgroundColor: byVotes.map(g => genreColor(g)),
        borderWidth: 0, borderRadius: 2,
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        label: ctx => ` ${ctx.raw.toLocaleString()} median votes`,
      }}},
      scales: {
        x: { grid:{color:'rgba(12,10,8,.08)'}, ticks:{maxTicksLimit:5, callback: v => numFmt(v)} },
        y: { grid:{display:false}, ticks:{font:{size:10}} },
      },
    },
  });
  setEl('r4-votes-insight',
    `<span class="insight-label">★ Insight</span>
     <b>${byVotes[0]}</b> attracts the most votes — audiences engage most with spectacle.
     Niche genres like Biography attract fewer but potentially more dedicated voters.`
  );

  // ── Rating consistency (std_rating) ──
  const byStd = [...genres].sort((a,b) => (gs[a]?.std_rating||0) - (gs[b]?.std_rating||0));
  mkChart('r4-consistency', {
    type: 'bar',
    data: {
      labels: byStd,
      datasets: [{
        data: byStd.map(g => gs[g]?.std_rating || 0),
        backgroundColor: byStd.map((g, i) => i < 4 ? '#00695c' : i >= byStd.length-3 ? '#c62828' : '#cd7e2d'),
        borderWidth: 0, borderRadius: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        label: ctx => ` σ = ${ctx.raw.toFixed(2)} (${ctx.raw < 0.88 ? 'consistent' : 'variable'})`,
      }}},
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:10},maxRotation:35} },
        y: { min:0.6, grid:{color:'rgba(12,10,8,.08)'}, ticks:{maxTicksLimit:5} },
      },
    },
  });
  setEl('r4-consistency-insight',
    `<span class="insight-label">★ Insight</span>
     <b>${byStd[0]}</b> is the most consistent genre — predictable quality.
     <b>${byStd[byStd.length-1]}</b> varies most widely — high risk, potentially high reward.`
  );

  // ── Revenue by genre ──
  const gr = rev.genre_avg_revenue || FALLBACK.revenue_stats.genre_avg_revenue;
  const revGenres = Object.keys(gr).filter(g => genres.includes(g));
  const byRev = [...revGenres].sort((a,b) => (gr[b]||0) - (gr[a]||0));
  mkChart('r4-revenue', {
    type: 'bar',
    data: {
      labels: byRev,
      datasets: [{
        data: byRev.map(g => gr[g] || 0),
        backgroundColor: byRev.map(g => genreColor(g)),
        borderWidth: 0, borderRadius: 2,
      }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend:{display:false}, tooltip:{ callbacks:{
        label: ctx => ` $${ctx.raw.toFixed(1)}M avg gross revenue`,
      }}},
      scales: {
        x: { grid:{color:'rgba(12,10,8,.08)'}, ticks:{maxTicksLimit:5, callback: v => `$${v}M`} },
        y: { grid:{display:false}, ticks:{font:{size:10}} },
      },
    },
  });
  setEl('r4-revenue-insight',
    `<span class="insight-label">★ Insight</span>
     <b>${byRev[0]}</b> films earn the most on average. Animation's family-friendly appeal and
     Action's global spectacle dominate the box office. Critical acclaim ≠ box office success.`
  );

  // ── Hidden gems grid ──
  const gemGenres = Object.keys(hg);
  const pillsEl = el('r4-gems-pills');
  if (pillsEl) {
    gemGenres.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'pill';
      btn.dataset.genre = g;
      btn.textContent = g;
      pillsEl.appendChild(btn);
    });
  }
  renderGemsGrid('r4-gems-grid', hg, 'ALL');
  attachGemPills('r4-gems-pills', 'r4-gems-grid', hg);
}

// ─────────────────────────────────────────────────────────────────────────────
// HEATMAP + DUMBBELL + GEM GRID
// ─────────────────────────────────────────────────────────────────────────────
function renderHeatmap(containerId, rowLabels, colLabels, matrix, primaryHex) {
  const container = el(containerId);
  if (!container) return;

  const flat = matrix.flat().filter(v => v > 0);
  const maxVal = flat.length ? Math.max(...flat) : 1;
  const numCols = colLabels.length;

  let html = `<div class="heatmap-grid" style="grid-template-columns:120px repeat(${numCols},48px)">`;

  // Header row
  html += `<div class="heatmap-corner"></div>`;
  colLabels.forEach(c => {
    html += `<div class="heatmap-col-label" title="${c}">${c.slice(0,7)}</div>`;
  });

  // Data rows
  rowLabels.forEach((row, ri) => {
    html += `<div class="heatmap-row-label" title="${row}">${row.length > 18 ? row.slice(0,16)+'…' : row}</div>`;
    colLabels.forEach((col, ci) => {
      const val = matrix[ri]?.[ci] || 0;
      const alpha = maxVal > 0 ? val / maxVal : 0;
      const bg = hexToRgba(primaryHex, alpha * 0.9);
      const textCol = alpha > 0.55 ? '#f3ead3' : '#0c0a08';
      html += `<div class="heatmap-cell" style="background:${bg};color:${textCol}" title="${row} × ${col}: ${val}">${val > 0 ? val : ''}</div>`;
    });
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderDumbbell(containerId, rows) {
  // rows = [{genre, global, mine}]
  const container = el(containerId);
  if (!container || !rows.length) return;

  const allVals = rows.flatMap(r => [r.global, r.mine]).filter(Boolean);
  if (!allVals.length) return;
  const mn = Math.min(...allVals) - 0.3;
  const mx = Math.max(...allVals) + 0.3;
  const range = mx - mn || 1;

  container.innerHTML = rows.map(r => {
    const lp = ((r.global - mn) / range * 100).toFixed(1);
    const rp = ((r.mine   - mn) / range * 100).toFixed(1);
    const lo = Math.min(lp, rp);
    const hi = Math.max(lp, rp);
    const color = r.mine > r.global ? '#00695c' : '#c62828';
    return `<div class="dumbbell-row">
      <span class="db-genre">${r.genre}</span>
      <div class="db-track-wrap">
        <div class="db-track" style="left:${lo}%;width:${hi-lo}%;background:${color};height:2px;top:50%;position:absolute;transform:translateY(-50%)"></div>
        <div class="db-dot db-dot-global" style="left:${lp}%;position:absolute;top:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:#1d4ed8;border:2px solid #0c0a08"></div>
        <div class="db-dot db-dot-mine"   style="left:${rp}%;position:absolute;top:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:#cd7e2d;border:2px solid #0c0a08"></div>
      </div>
      <span class="db-values">${r.global.toFixed(1)} → ${r.mine.toFixed(1)}</span>
    </div>`;
  }).join('');
}

function renderGemsGrid(containerId, allGems, genre) {
  const container = el(containerId);
  if (!container) return;
  let items = [];
  if (genre === 'ALL') {
    Object.values(allGems).forEach(arr => items.push(...arr.slice(0,3)));
  } else {
    items = allGems[genre] || [];
  }
  if (!items.length) {
    container.innerHTML = '<p style="font-family:var(--font-mono);font-size:11px;padding:16px">No hidden gems found for this genre.</p>';
    return;
  }
  container.innerHTML = items.map(g => `
    <div class="gem-card">
      <div class="gem-rating">★ ${g.rating}</div>
      <div class="gem-title">${g.title}</div>
      <div class="gem-meta">
        <span>${numFmt(g.votes)} votes</span>
        <span>${g.dir || ''}</span>
      </div>
      <div class="gem-tags">${(g.genres||[]).map(t => `<span class="gem-tag">${t}</span>`).join('')}</div>
    </div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. SEARCH (lazy-loaded on first keystroke)
// ─────────────────────────────────────────────────────────────────────────────
let _searchLoaded = false;
let _searchData   = null;
let _searchTimer  = null;

function initSearch() {
  const input   = el('search-input');
  const genSel  = el('sf-genre');
  const ratSel  = el('sf-rating');
  const rtSel   = el('sf-runtime');
  const srtSel  = el('sf-sort');
  if (!input) return;

  const doSearch = () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(filterSearch, 120);
  };

  input.addEventListener('input', async () => {
    if (!_searchLoaded) {
      _searchLoaded = true;
      // load search_index lazily
      try {
        const res = await fetch('data/search_index.json');
        _searchData = res.ok ? await res.json() : DATA.movies_index || [];
      } catch {
        _searchData = DATA.movies_index || [];
      }
    }
    doSearch();
  });
  [genSel, ratSel, rtSel, srtSel].forEach(s => s?.addEventListener('change', doSearch));
  input.addEventListener('keydown', e => { if (e.key==='Escape') { input.value=''; filterSearch(); } });
}

function filterSearch() {
  const query   = (el('search-input')?.value  || '').toLowerCase().trim();
  const genre   = (el('sf-genre')?.value      || '');
  const minRat  = parseFloat(el('sf-rating')?.value || '0');
  const rt      = (el('sf-runtime')?.value    || '');
  const sort    = (el('sf-sort')?.value       || 'relevance');
  const countEl = el('search-count');
  const resEl   = el('search-results');
  if (!resEl) return;

  if (!query && !genre && !minRat && !rt) {
    resEl.innerHTML = '';
    if (countEl) countEl.textContent = '';
    return;
  }

  const src = _searchData || DATA.movies_index || [];
  let results = src.filter(m => {
    if (query && !m.t.toLowerCase().includes(query) &&
        !(m.desc||'').toLowerCase().includes(query) &&
        !(m.dir||[]).some(d => d.toLowerCase().includes(query))) return false;
    if (genre && !(m.g||[]).includes(genre)) return false;
    if (minRat && (m.r || 0) < minRat) return false;
    if (rt) {
      const run = m.rt || 0;
      if (rt==='under90'  && run >= 90)  return false;
      if (rt==='90-120'   && (run < 90  || run > 120)) return false;
      if (rt==='120-150'  && (run < 120 || run > 150)) return false;
      if (rt==='over150'  && run <= 150) return false;
    }
    return true;
  });

  // Sort
  if (sort==='rating')  results = sorted(results, m => m.r||0);
  if (sort==='votes')   results = sorted(results, m => m.v||0);
  if (sort==='revenue') results = results; // revenue not in search_index; keep by rating

  const total = results.length;
  results = results.slice(0,40);

  if (countEl) countEl.textContent = total ? `${total.toLocaleString()} RESULTS` : 'NO RESULTS';

  resEl.innerHTML = results.map(m => {
    const titleHL = highlight(m.t, query);
    const tags = (m.g||[]).map(g => `<span class="sc-genre-tag">${g}</span>`).join('');
    const desc = m.desc ? `<div class="sc-desc">${m.desc}</div>` : '';
    return `<div class="search-card">
      <div class="sc-title">${titleHL}</div>
      <div class="sc-meta">
        <span class="sc-rating">★ ${m.r}</span>
        <span>${numFmt(m.v)} votes</span>
        ${m.rt ? `<span>${m.rt} min</span>` : ''}
        ${m.meta ? `<span>Meta ${m.meta}</span>` : ''}
        ${(m.dir||[]).map(d=>`<span>${d}</span>`).join('')}
      </div>
      <div>${tags}</div>
      ${desc}
    </div>`;
  }).join('');
}

function highlight(text, query) {
  if (!query) return text;
  return text.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'),
    '<mark>$1</mark>');
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. REEL 5 — CSV UPLOAD & PERSONAL ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
let _r5Parsed = null;  // cleaned rows from upload

function attachCSV() {
  const fileInput = el('r5-file-input');
  const dropzone  = el('r5-dropzone');
  const status    = el('r5-status');
  if (!fileInput) return;

  fileInput.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  });

  if (dropzone) {
    dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) readFile(file);
    });
  }

  function readFile(file) {
    if (!file.name.endsWith('.csv')) {
      if (status) { status.style.color='#c62828'; status.textContent='Please upload a .csv file.'; }
      return;
    }
    if (status) { status.style.color='#00695c'; status.textContent='Reading…'; }
    const reader = new FileReader();
    reader.onload = e => handleUpload(e.target.result);
    reader.readAsText(file);
  }
}

function handleUpload(csvText) {
  if (typeof Papa === 'undefined') {
    const s = el('r5-status');
    if (s) { s.style.color='#c62828'; s.textContent='PapaParse not loaded — check network connection.'; }
    return;
  }

  const parsed = Papa.parse(csvText, { header:true, skipEmptyLines:true, trimHeaders:true });
  const rows   = parsed.data;
  if (!rows.length) {
    const s = el('r5-status');
    if (s) { s.style.color='#c62828'; s.textContent='Empty CSV — check the file.'; }
    return;
  }

  // Normalise column names (IMDb export is inconsistent)
  const norm = rows.map(r => {
    const k = key => Object.keys(r).find(k2 => k2.toLowerCase().replace(/[^a-z]/g,'').includes(key)) || '';
    return {
      tconst:      (r[k('const')]   || r['Const']  || '').trim(),
      your_rating: parseFloat(r[k('yourrating')] || r['Your Rating'] || 0),
      date_rated:  r[k('daterates')] || r['Date Rated'] || '',
      title:       r[k('title')]     || r['Title']  || '',
      imdb_rating: parseFloat(r[k('imdbrating')] || r['IMDb Rating'] || 0),
      runtime:     parseInt(r[k('runtime')]      || r['Runtime (mins)'] || 0),
      year:        parseInt(r[k('year')]         || r['Year'] || 0),
      genres:      (r[k('genres')]   || r['Genres'] || ''),
      directors:   (r[k('directors')]|| r['Directors'] || ''),
      title_type:  (r[k('titletype')]|| r['Title Type'] || 'movie'),
    };
  });

  // Filter to movies only + valid ratings
  const cleaned = norm.filter(r =>
    r.tconst &&
    !isNaN(r.your_rating) && r.your_rating >= 1 &&
    (r.title_type.includes('movie') || r.title_type.includes('Movie') || !r.title_type)
  );

  if (cleaned.length < 5) {
    const s = el('r5-status');
    if (s) { s.style.color='#c62828'; s.textContent=`Only ${cleaned.length} movies found — check format.`; }
    return;
  }

  cleaned.forEach(r => {
    r.genres_list = r.genres ? r.genres.split(/,\s*/).filter(Boolean) : [];
    r.decade      = r.year ? Math.floor(r.year/10)*10 : 0;
  });

  _r5Parsed = cleaned;

  const s = el('r5-status');
  if (s) { s.style.color='#00695c'; s.textContent=`✓ ${cleaned.length} films loaded`; }

  // Show analysis section
  const analysis = el('r5-analysis');
  if (analysis) analysis.style.display = 'block';

  const moviesIdx = DATA.movies_index || FALLBACK.movies_index || [];
  renderReel5(cleaned, moviesIdx);
}

function renderReel5(parsed, moviesIndex) {
  renderR5Patterns(parsed);
  renderR5Taste(parsed, moviesIndex);
  renderR5Blindspots(parsed, moviesIndex);
  renderR5Recs(parsed, moviesIndex);
  attachSubtabs();
  attachRecsFilters(parsed, moviesIndex);
}

function renderR5Patterns(parsed) {
  const n       = parsed.length;
  const myRatings = parsed.map(r => r.your_rating).filter(Boolean);
  const imdbRats  = parsed.map(r => r.imdb_rating).filter(Boolean);
  const avgMine   = myRatings.reduce((a,b)=>a+b,0)/myRatings.length;
  const avgImdb   = imdbRats.reduce((a,b)=>a+b,0)/imdbRats.length;

  // Mini stats
  const paired = parsed.filter(r => r.your_rating && r.imdb_rating);
  const diffs  = paired.map(r => Math.abs(r.your_rating - r.imdb_rating));
  const contrPct = (diffs.filter(d=>d>=2).length/Math.max(diffs.length,1)*100).toFixed(1);

  setEl('r5-mini-stats', `
    <div class="mini-stat"><div class="ms-value">${n.toLocaleString()}</div><div class="ms-label">FILMS RATED</div></div>
    <div class="mini-stat"><div class="ms-value">${avgMine.toFixed(2)}</div><div class="ms-label">YOUR AVG RATING</div></div>
    <div class="mini-stat"><div class="ms-value">${avgImdb.toFixed(2)}</div><div class="ms-label">IMDb AVG (SAME)</div></div>
    <div class="mini-stat"><div class="ms-value">${contrPct}%</div><div class="ms-label">CONTRARIAN INDEX</div></div>
  `);

  // Genre breakdown
  const genreCounts = {};
  parsed.forEach(r => r.genres_list.forEach(g => { genreCounts[g] = (genreCounts[g]||0)+1; }));
  const topGenres = Object.entries(genreCounts).sort((a,b)=>b[1]-a[1]).slice(0,12);
  mkChart('r5-genre-bar', {
    type:'bar',
    data:{
      labels: topGenres.map(g=>g[0]),
      datasets:[{
        data: topGenres.map(g=>g[1]),
        backgroundColor: topGenres.map(g => hexToRgba(genreColor(g[0]), 0.8)),
        borderWidth:0, borderRadius:2,
      }],
    },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>` ${ctx.raw} films`}}},
      scales:{
        x:{grid:{color:'rgba(12,10,8,.08)'},ticks:{maxTicksLimit:5}},
        y:{grid:{display:false},ticks:{font:{size:10}}},
      },
    },
  });

  // Decade breakdown
  const decadeCounts = {};
  parsed.filter(r=>r.decade>1900).forEach(r => { decadeCounts[r.decade]=(decadeCounts[r.decade]||0)+1; });
  const decades = Object.entries(decadeCounts).sort((a,b)=>a[0]-b[0]);
  mkChart('r5-decade-bar', {
    type:'bar',
    data:{
      labels: decades.map(d=>d[0]+'s'),
      datasets:[{
        data: decades.map(d=>d[1]),
        backgroundColor:'rgba(205,126,45,0.8)',
        borderWidth:0, borderRadius:2,
      }],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>` ${ctx.raw} films`}}},
      scales:{
        x:{grid:{display:false},ticks:{font:{size:10}}},
        y:{grid:{color:'rgba(12,10,8,.08)'},ticks:{maxTicksLimit:5}},
      },
    },
  });

  // Most watched directors
  const dirCounts = {};
  parsed.forEach(r => {
    r.directors.split(/,\s*/).filter(Boolean).forEach(d => { dirCounts[d]=(dirCounts[d]||0)+1; });
  });
  const topDirs = Object.entries(dirCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  mkChart('r5-directors-bar', {
    type:'bar',
    data:{
      labels: topDirs.map(d=>d[0]),
      datasets:[{
        data: topDirs.map(d=>d[1]),
        backgroundColor:'rgba(205,126,45,0.8)',
        borderWidth:0, borderRadius:2,
      }],
    },
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:ctx=>` ${ctx.raw} films`}}},
      scales:{
        x:{grid:{color:'rgba(12,10,8,.08)'},ticks:{maxTicksLimit:5}},
        y:{grid:{display:false},ticks:{font:{size:10}}},
      },
    },
  });

  // Rating timeline (avg your_rating by year of date_rated)
  const byYear = {};
  parsed.forEach(r => {
    const yr = r.date_rated ? parseInt(r.date_rated.slice(0,4)) : 0;
    if (yr > 2000 && !isNaN(r.your_rating)) {
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(r.your_rating);
    }
  });
  const timelineYears = Object.keys(byYear).sort();
  mkChart('r5-timeline', {
    type:'line',
    data:{
      labels: timelineYears,
      datasets:[{
        data: timelineYears.map(y => {
          const arr = byYear[y];
          return (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2);
        }),
        borderColor:'#cd7e2d', backgroundColor:'rgba(205,126,45,0.12)',
        fill:true, tension:0.4, pointRadius:4, pointBackgroundColor:'#cd7e2d',
      }],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{
        label:ctx=>` Avg rating ${ctx.raw} (${byYear[timelineYears[ctx.dataIndex]]?.length} films)`,
      }}},
      scales:{
        x:{grid:{display:false},ticks:{font:{size:10}}},
        y:{min:5, max:10, grid:{color:'rgba(12,10,8,.08)'},ticks:{maxTicksLimit:5}},
      },
    },
  });
}

function renderR5Taste(parsed, moviesIndex) {
  // ── Overlapping rating histograms ──
  const bins     = [1,2,3,4,5,6,7,8,9,10];
  const myHist   = bins.map(b => parsed.filter(r => Math.floor(r.your_rating)===b).length);
  const imdbHist = bins.map(b => {
    const n = parsed.filter(r => r.imdb_rating && Math.floor(r.imdb_rating)===b).length;
    return n;
  });
  mkChart('r5-overlap', {
    type:'bar',
    data:{
      labels: bins.map(b=>String(b)),
      datasets:[
        {label:'Your ratings',  data:myHist,   backgroundColor:'rgba(205,126,45,0.75)', borderWidth:0, borderRadius:2},
        {label:'IMDb ratings',  data:imdbHist, backgroundColor:'rgba(29,78,216,0.55)',  borderWidth:0, borderRadius:2},
      ],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:true,position:'top',labels:{font:{size:10},boxWidth:12}}},
      scales:{
        x:{grid:{display:false},ticks:{font:{size:10}}},
        y:{grid:{color:'rgba(12,10,8,.08)'},ticks:{maxTicksLimit:5}},
      },
    },
  });

  // ── Contrarian scatter ──
  const paired = parsed.filter(r => r.your_rating && r.imdb_rating);
  mkChart('r5-contrarian', {
    type:'scatter',
    data:{
      datasets:[
        {
          // Agreement diagonal
          type:'line',
          data:[{x:1,y:1},{x:10,y:10}],
          borderColor:'rgba(12,10,8,0.2)', borderDash:[4,4], borderWidth:1,
          pointRadius:0, fill:false,
        },
        {
          label:'Your films',
          data: paired.map(r => ({ x:r.imdb_rating, y:r.your_rating, _t:r.title })),
          backgroundColor: paired.map(r => {
            const d = r.your_rating - r.imdb_rating;
            return d > 1.5 ? hexToRgba('#00695c',0.6) : d < -1.5 ? hexToRgba('#c62828',0.6) : hexToRgba('#cd7e2d',0.5);
          }),
          pointRadius:3.5, borderWidth:0,
        },
      ],
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{
        label: ctx => ctx.raw._t ? ` ${ctx.raw._t} · You ${ctx.raw.y} / IMDb ${ctx.raw.x}` : '',
      }}},
      scales:{
        x:{min:1,max:10,title:{display:true,text:'IMDb Rating',font:{size:10}},grid:{color:'rgba(12,10,8,.06)'}},
        y:{min:1,max:10,title:{display:true,text:'Your Rating',font:{size:10}},grid:{color:'rgba(12,10,8,.06)'}},
      },
    },
  });

  const avgDiff = paired.reduce((s,r)=>s+(r.your_rating-r.imdb_rating),0)/Math.max(paired.length,1);
  setEl('r5-contrarian-insight',
    `<span class="insight-label">★ Insight</span>
     Your average deviation from IMDb: <b>${avgDiff>0?'+':''}${avgDiff.toFixed(2)}</b>.
     Green points = you rate higher than IMDb · Red = you rate lower.`
  );

  // ── Dumbbell: your genre avg vs global median ──
  const gs = DATA.genre_stats || FALLBACK.genre_stats;
  const myGenreRatings = {};
  parsed.forEach(r => {
    r.genres_list.forEach(g => {
      if (!myGenreRatings[g]) myGenreRatings[g] = [];
      myGenreRatings[g].push(r.your_rating);
    });
  });
  const dbData = GENRE_LIST.filter(g => gs[g] && myGenreRatings[g]?.length >= 3).map(g => ({
    genre:  g,
    global: gs[g].median_rating,
    mine:   parseFloat((myGenreRatings[g].reduce((a,b)=>a+b,0)/myGenreRatings[g].length).toFixed(2)),
  }));
  renderDumbbell('r5-dumbbell', dbData);
}

function renderR5Blindspots(parsed, moviesIndex) {
  const watchedIds = new Set(parsed.map(r => r.tconst));

  // My top genres by count
  const gCounts = {};
  parsed.forEach(r => r.genres_list.forEach(g => { gCounts[g]=(gCounts[g]||0)+1; }));
  const topGenres = Object.entries(gCounts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(e=>e[0]);

  const blindspots = (moviesIndex.length ? moviesIndex : []).filter(m =>
    m.r >= 7.5 &&
    m.v >= 50_000 &&
    !watchedIds.has(m.id) &&
    (m.g||[]).some(g => topGenres.includes(g))
  ).sort((a,b) => b.r - a.r);

  // Pills
  const pillsEl = el('r5-blind-pills');
  if (pillsEl) {
    pillsEl.innerHTML = '<button class="pill active" data-genre="ALL">ALL</button>';
    topGenres.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'pill';
      btn.dataset.genre = g;
      btn.textContent = g;
      pillsEl.appendChild(btn);
    });
    pillsEl.querySelectorAll('.pill').forEach(btn => {
      btn.addEventListener('click', () => {
        pillsEl.querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const genre = btn.dataset.genre;
        const filtered = genre==='ALL' ? blindspots :
          blindspots.filter(m=>(m.g||[]).includes(genre));
        setEl('r5-blind-count', `${filtered.length.toLocaleString()} BLINDSPOTS`);
        renderBlindspotCards('r5-blind-grid', filtered.slice(0,30));
      });
    });
  }

  setEl('r5-blind-count', `${blindspots.length.toLocaleString()} BLINDSPOTS`);
  renderBlindspotCards('r5-blind-grid', blindspots.slice(0,30));
}

function renderBlindspotCards(containerId, items) {
  const container = el(containerId);
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<p style="font-family:var(--font-mono);font-size:11px;padding:16px">No blindspots found — well watched!</p>';
    return;
  }
  container.innerHTML = items.map(m => `
    <div class="gem-card">
      <div class="gem-rating">★ ${m.r}</div>
      <div class="gem-title">${m.t}</div>
      <div class="gem-meta">
        <span>${numFmt(m.v)} votes</span>
        ${m.rt ? `<span>${m.rt} min</span>` : ''}
        ${(m.dir||[]).slice(0,1).map(d=>`<span>${d}</span>`).join('')}
      </div>
      <div class="gem-tags">${(m.g||[]).map(t=>`<span class="gem-tag">${t}</span>`).join('')}</div>
    </div>`).join('');
}

function computeMatchScore(movie, genreWeights, watchedDirs) {
  const gScores = (movie.g||[]).map(g => genreWeights[g] || 0.5);
  const gWeight = gScores.length ? gScores.reduce((a,b)=>a+b,0)/gScores.length : 0.5;
  const dirFam  = (movie.dir||[]).some(d => watchedDirs.has(d)) ? 1.0 : 0.5;
  const quality = Math.min(1, (movie.r||5) / 10);
  const score   = gWeight * 0.50 + dirFam * 0.25 + quality * 0.25;
  return Math.min(99, Math.max(1, Math.round(score * 100)));
}

function renderR5Recs(parsed, moviesIndex, mood='ALL', runtime='any') {
  const watchedIds = new Set(parsed.map(r => r.tconst));

  // Build genre weights
  const gRatings = {};
  parsed.forEach(r => {
    r.genres_list.forEach(g => {
      if (!gRatings[g]) gRatings[g] = [];
      if (!isNaN(r.your_rating)) gRatings[g].push(r.your_rating);
    });
  });
  const genreWeights = {};
  Object.entries(gRatings).forEach(([g, arr]) => {
    genreWeights[g] = (arr.reduce((a,b)=>a+b,0)/arr.length) / 10;
  });

  const watchedDirs = new Set();
  parsed.forEach(r => r.directors.split(/,\s*/).filter(Boolean).forEach(d => watchedDirs.add(d)));

  const moodFilter = MOOD_GENRES[mood];
  const unwatched  = (moviesIndex.length ? moviesIndex : []).filter(m => {
    if (watchedIds.has(m.id)) return false;
    if (m.r < 7.0) return false;
    if (moodFilter && !(m.g||[]).some(g => moodFilter.includes(g))) return false;
    if (runtime !== 'any' && m.rt) {
      if (runtime==='under90'  && m.rt >= 90)  return false;
      if (runtime==='90-120'   && (m.rt < 90  || m.rt > 120)) return false;
      if (runtime==='120-150'  && (m.rt < 120 || m.rt > 150)) return false;
      if (runtime==='over150'  && m.rt <= 150) return false;
    }
    return true;
  });

  const scored = unwatched.map(m => ({
    ...m,
    match: computeMatchScore(m, genreWeights, watchedDirs),
  })).sort((a,b) => b.match - a.match).slice(0,60);

  setEl('r5-rec-count', `${scored.length}+ RECOMMENDATIONS`);
  const container = el('r5-recs-grid');
  if (!container) return;

  if (!scored.length) {
    container.innerHTML = '<p style="font-family:var(--font-mono);font-size:11px;padding:16px">No recommendations matched — try different filters.</p>';
    return;
  }

  container.innerHTML = scored.slice(0,30).map(m => `
    <div class="rec-card">
      <div>
        <span class="rec-match">${m.match}</span>
        <span class="rec-match-label">% MATCH</span>
      </div>
      <div class="rec-bar-wrap"><div class="rec-bar" style="width:${m.match}%"></div></div>
      <div class="rec-title">${m.t}</div>
      <div class="rec-meta">
        <span>★ ${m.r}</span>
        ${m.rt ? `<span>${m.rt} min</span>` : ''}
        ${numFmt(m.v) !== '—' ? `<span>${numFmt(m.v)} votes</span>` : ''}
        ${(m.dir||[]).slice(0,1).map(d=>`<span>${d}</span>`).join('')}
      </div>
      <div class="rec-tags">${(m.g||[]).slice(0,3).map(g=>`<span class="rec-tag">${g}</span>`).join('')}</div>
    </div>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. UI HANDLERS
// ─────────────────────────────────────────────────────────────────────────────
function attachCollapse() {
  document.querySelectorAll('.section-title').forEach(btn => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'false';
      btn.setAttribute('aria-expanded', String(!open));
      btn.classList.toggle('collapsed', open);
    });
  });
}

function attachSubtabs() {
  const nav = document.querySelector('.subtab-nav');
  if (!nav) return;
  nav.querySelectorAll('.subtab').forEach(tab => {
    tab.addEventListener('click', () => {
      nav.querySelectorAll('.subtab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected','false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected','true');

      const panelId = 'r5-tab-' + tab.dataset.tab;
      document.querySelectorAll('.subtab-panel').forEach(p => {
        p.style.display = p.id === panelId ? '' : 'none';
      });
    });
  });
}

function attachGemPills(pillsId, gridId, allGems) {
  const pillsEl = el(pillsId);
  if (!pillsEl) return;
  pillsEl.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      pillsEl.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGemsGrid(gridId, allGems, btn.dataset.genre || 'ALL');
    });
  });
}

function attachRecsFilters(parsed, moviesIndex) {
  // Mood buttons
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mood    = btn.dataset.mood || 'ALL';
      const runtime = el('r5-runtime-filter')?.value || 'any';
      renderR5Recs(parsed, moviesIndex, mood, runtime);
    });
  });
  // Runtime select
  el('r5-runtime-filter')?.addEventListener('change', e => {
    const mood    = document.querySelector('.mood-btn.active')?.dataset.mood || 'ALL';
    renderR5Recs(parsed, moviesIndex, mood, e.target.value);
  });
}

function attachSampleNotice() {
  if (window.location.protocol === 'file:') {
    const n = el('sample-notice');
    if (n) n.style.display = 'flex';
  }
  el('sample-dismiss')?.addEventListener('click', () => {
    const n = el('sample-notice');
    if (n) n.style.display = 'none';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. INIT — orchestrates everything
//    hideLoader() is called BEFORE renderAll()
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
  setLoad('THREADING THE REEL…', 5);

  // Sequential data loading
  await loadAll();

  setLoad('CURTAIN UP!', 100);
  await new Promise(r => setTimeout(r, 250));

  // ── CRITICAL: hide loader BEFORE rendering ──
  hideLoader();

  // Attach UI handlers (collapse, search, CSV)
  attachCollapse();
  attachCSV();
  initSearch();
  attachSampleNotice();

  // Render all reels
  safeRender(renderReel1, 'Reel 1 — Global Stage');
  safeRender(renderReel2, 'Reel 2 — Critic\'s Eye');
  safeRender(renderReel3, 'Reel 3 — Directors\' Cut');
  safeRender(renderReel4, 'Reel 4 — Genre Deep Dive');
}

// Kick off
document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();
