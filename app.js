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
    wordsByLen: { 4: [], 5: [], 6: [] },
    dict: new Set(),
    used: { 4: new Set(), 5: new Set(), 6: new Set() },
    settings: { mode: 'single', len: 5, guesses: 6, reveal: 'first' },
    round: {},
    stats: { p1: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 }, p2: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 } }
  };

  const STORAGE_KEY_STATS = 'lingo_stats_v1';
  const STORAGE_KEY_USED = 'lingo_used_v1';
  const STORAGE_KEY_PREFS = 'lingo_prefs_v1';

  // Utils
  function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function setMessage(msg, isError=false) {
    messageEl.textContent = msg;
    messageEl.classList.toggle('error', !!isError);
  }

  // Persistence
  function loadPersisted() {
    try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY_STATS)); if (s) state.stats = s; } catch {}
    try { const u = JSON.parse(localStorage.getItem(STORAGE_KEY_USED)); if (u) { for (const k of [4,5,6]) state.used[k] = new Set(u[k]||[]); } } catch {}
    try { const p = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFS)); if (p) state.settings = { ...state.settings, ...p }; } catch {}
  }
  function persist() {
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(state.stats));
    localStorage.setItem(STORAGE_KEY_USED, JSON.stringify({ 4:[...state.used[4]], 5:[...state.used[5]], 6:[...state.used[6]] }));
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(state.settings));
  }

  // Word loading
  async function loadWords() {
    const files = [
      { len:4, path:'/words/words-4.txt' },
      { len:5, path:'/words/words-5.txt' },
      { len:6, path:'/words/words-6.txt' },
    ];
    for (const f of files) {
      const res = await fetch(f.path);
      const txt = await res.text();
      const list = txt.split(/\r?\n/).map(w=>w.trim()).filter(Boolean).filter(w=>/^[A-Za-z]+$/.test(w));
      const up = list.map(w=>w.toUpperCase()).filter(w=>w.length===f.len);
      state.wordsByLen[f.len] = up;
      up.forEach(w=>state.dict.add(w));
    }
  }

  function pickSecret(len) {
    const pool = state.wordsByLen[len];
    if (!pool.length) return '';
    if (state.used[len].size >= pool.length) state.used[len].clear();
    let word;
    do { word = randChoice(pool); } while (state.used[len].has(word));
    return word;
  }

  // Rendering (simplified for now)
  function renderGrid() { gridEl.textContent = ''; }
  function renderKeyboard() { keyboardEl.textContent = ''; }
  function renderScores() {
    const r1 = state.stats.p1;
    const r2 = state.stats.p2;
    let html = `<tr><td>Player 1</td><td>${r1.total_games}</td><td>${r1.wins}</td><td>${r1.first_try_wins}</td><td>${r1.steals}</td></tr>`;
    if (state.settings.mode==='two') {
      html += `<tr><td>Player 2</td><td>${r2.total_games}</td><td>${r2.wins}</td><td>${r2.first_try_wins}</td><td>${r2.steals}</td></tr>`;
    }
    scoreRows.innerHTML = html;
  }

  // Round setup
  function startNewRound() {
    const len = state.settings.len = parseInt(lenSel.value, 10);
    state.settings.mode = modeSel.value;
    state.settings.guesses = Math.max(3, Math.min(10, parseInt(guessesInput.value, 10) || 6));
    state.settings.reveal = revealSel.value;
    persist();

    state.round = {
      secret: pickSecret(len),
      stage: 'playing',
      starter: state.settings.mode==='two' && !nextBtn.hidden ? (state.round.starter===1?2:1) : 1,
      activePlayer: 1,
      firstTry: true,
      stealAvailable: (state.settings.mode==='two')
    };

    if (!state.round.secret) {
      setMessage('No words loaded. Check files in /words.', true);
      return;
    }

    renderGrid();
    renderKeyboard();
    renderScores();
    setMessage('');
    nextBtn.hidden = true;
  }

  // Dark mode toggle
  function setupDarkMode() {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    if (prefersLight) document.body.classList.add('light');
    darkToggle.addEventListener('click', ()=>document.body.classList.toggle('light'));
  }

  // Event bindings
  nextBtn.addEventListener('click', startNewRound);
  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset scores and used words?')) return;
    state.stats = { p1:{total_games:0,wins:0,first_try_wins:0,steals:0}, p2:{total_games:0,wins:0,first_try_wins:0,steals:0} };
    state.used = { 4:new Set(), 5:new Set(), 6:new Set() };
    persist();
    renderScores();
    setMessage('Scores reset');
  });
  modeSel.addEventListener('change', startNewRound);
  lenSel.addEventListener('change', startNewRound);
  guessesInput.addEventListener('change', startNewRound);
  revealSel.addEventListener('change', startNewRound);

  // Init
  loadPersisted();
  modeSel.value = state.settings.mode;
  lenSel.value = String(state.settings.len);
  guessesInput.value = String(state.settings.guesses);
  revealSel.value = state.settings.reveal;
  setupDarkMode();
  renderScores();

  loadWords().then(startNewRound);
})();
