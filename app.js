(() => {
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  // Elements
  const gridEl = qs('#grid');
  const keyboardEl = qs('#keyboard');
  const messageEl = qs('#message');
  const bannerEl = qs('#activeBanner');
  const nextBtn = qs('#nextRound');
  const resetBtn = qs('#resetScores');

  const modeSel = qs('#mode');
  const lenSel = qs('#wordLength');
  const guessesInput = qs('#guesses');
  const revealSel = qs('#reveal');
  const darkToggle = qs('#darkToggle');
  const scoreRows = qs('#scoreRows');

  // State
  const state = {
    loaded: false,
    wordsByLen: { 4: [], 5: [], 6: [] },
    dict: new Set(),
    used: { 4: new Set(), 5: new Set(), 6: new Set() },
    settings: {
      mode: 'single',
      len: 5,
      guesses: 6,
      reveal: 'first', // 'first' | 'last' | 'none'
    },
    round: {
      secret: '',
      lockedIdx: [],
      rowCount: 0,
      maxRows: 6,
      board: [], // array of arrays of tiles (string or '')
      statuses: [], // per row statuses
      cursor: { row: 0, col: 0 },
      stage: 'playing', // 'playing' | 'steal' | 'done'
      starter: 1, // 1 or 2; alternates each round in two-player
      activePlayer: 1,
      firstTry: true,
      stealAvailable: true,
    },
    stats: {
      p1: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 },
      p2: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 },
    },
  };

  const STORAGE_KEY_STATS = 'lingo_stats_v1';
  const STORAGE_KEY_USED = 'lingo_used_v1';
  const STORAGE_KEY_PREFS = 'lingo_prefs_v1';

  // Load from localStorage
  function loadPersisted() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY_STATS));
      if (s && s.p1 && s.p2) state.stats = s;
    } catch {}
    try {
      const u = JSON.parse(localStorage.getItem(STORAGE_KEY_USED));
      if (u) {
        for (const k of [4,5,6]) {
          state.used[k] = new Set(u[k] || []);
        }
      }
    } catch {}
    try {
      const p = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFS));
      if (p) {
        state.settings = { ...state.settings, ...p };
      }
    } catch {}
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(state.stats));
    localStorag
