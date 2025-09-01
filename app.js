(() => {
  const qs = (s) => document.querySelector(s);

  // Elements
  const gridEl = qs('#grid');
  const keyboardEl = qs('#keyboard'); // we will hide/empty this for now
  const messageEl = qs('#message');
  const nextBtn = qs('#nextRound');
  const resetBtn = qs('#resetScores');

  const modeSel = qs('#mode');             // single / two  (kept for future)
  const lenSel = qs('#wordLength');        // 4 / 5 / 6
  const guessesInput = qs('#guesses');     // attempts
  const revealSel = qs('#reveal');         // first / last / none
  const wordSetSel = qs('#wordSet');       // NEW: english / singlish (optional in HTML)
  const timerSel = qs('#timerSel');        // timer seconds (optional in HTML)
  const darkToggle = qs('#darkToggle');
  const scoreRows = qs('#scoreRows');

  // Timer bar (below grid, above keyboard)
  const timerEl = document.createElement('div');
  Object.assign(timerEl.style, {
    height: '10px',
    background: '#4A90E2',
    margin: '10px auto',
    transition: 'width 0.1s linear',
    maxWidth: '320px',
    width: '100%'
  });

  // State
  const state = {
    // English lists by length
    wordsByLen: { 4: [], 5: [], 6: [] },
    // Singlish 5-letter list (from /words/SINGLISH)
    singlish5: [],
    // Current dictionary for validation (set each round)
    dictCurrent: new Set(),

    used: { 4: new Set(), 5: new Set(), 6: new Set(), sg5: new Set() },

    settings: {
      mode: 'single',   // single / two  (two-player coming later)
      len: 5,
      guesses: 6,
      reveal: 'first',  // first | last | none
      wordSet: 'english', // english | singlish
      timer: 15         // seconds
    },

    round: {
      secret: '',
      stage: 'idle', // playing | won | lost
      row: 0,
      col: 0,
      board: [],
      lockedIdx: []
    },

    // timer fields
    timerRunning: false,
    timerInterval: null,
    deadlineTs: 0,     // timestamp when this row times out

    // simple scores placeholder (two-player later)
    stats: {
      p1: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 },
      p2: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 }
    }
  };

  const STORAGE_KEY_STATS = 'lingo_stats_v1';
  const STORAGE_KEY_USED  = 'lingo_used_v1';
  const STORAGE_KEY_PREFS = 'lingo_prefs_v1';

  // ---------- Persistence ----------
  function loadPersisted() {
    try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY_STATS)); if (s) state.stats = s; } catch {}
    try { const u = JSON.parse(localStorage.getItem(STORAGE_KEY_USED));  if (u) {
      state.used[4] = new Set(u[4] || []);
      state.used[5] = new Set(u[5] || []);
      state.used[6] = new Set(u[6] || []);
      state.used.sg5 = new Set(u.sg5 || []);
    }} catch {}
    try { const p = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFS)); if (p) state.settings = { ...state.settings, ...p }; } catch {}
  }
  function persist() {
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(state.stats));
    localStorage.setItem(STORAGE_KEY_USED, JSON.stringify({
      4:[...state.used[4]], 5:[...state.used[5]], 6:[...state.used[6]], sg5:[...state.used.sg5]
    }));
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(state.settings));
  }

  // ---------- Word loading ----------
  async function loadWords() {
    // English files
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
    }
    // Singlish file (exactly 5 letters)
    try {
      const res = await fetch('/words/SINGLISH');
      if (res.ok) {
        const txt = await res.text();
        const list = txt.split(/\r?\n/).map(w=>w.trim()).filter(Boolean).filter(w=>/^[A-Za-z]+$/.test(w));
        state.singlish5 = list.map(w=>w.toUpperCase()).filter(w=>w.length===5);
      }
    } catch {}
  }

  // pick a secret from the correct pool, prevent repeats until exhausted
  function pickSecret(wordSet, len) {
    if (wordSet === 'singlish') {
      const pool = state.singlish5;
      if (!pool.length) return '';
      if (state.used.sg5.size >= pool.length) state.used.sg5.clear();
      let word;
      let tries = 0;
      do { word = pool[Math.floor(Math.random()*pool.length)]; tries++; } while (state.used.sg5.has(word) && tries < 10000);
      state.used.sg5.add(word);
      return word;
    } else {
      const pool = state.wordsByLen[len] || [];
      if (!pool.length) return '';
      if (state.used[len].size >= pool.length) state.used[len].clear();
      let word; let tries = 0;
      do { word = pool[Math.floor(Math.random()*pool.length)]; tries++; } while (state.used[len].has(word) && tries < 10000);
      state.used[len].add(word);
      return word;
    }
  }

  // ---------- Helpers for locked letters ----------
  function computeLockedIdx(len, reveal) {
    if (reveal === 'first') return [0];
    if (reveal === 'last')  return [len-1];
    return [];
  }
  function prefillLockedForRow(r) {
    const { secret, lockedIdx, board } = state.round;
    lockedIdx.forEach(idx => { board[r][idx].textContent = secret[idx]; });
  }
  function firstEditableCol(len, lockedIdx) {
    const lock = new Set(lockedIdx);
    for (let c=0;c<len;c++) if (!lock.has(c)) return c;
    return 0;
  }
  function isLocked(col) {
    return state.round.lockedIdx.includes(col);
  }
  function moveColForward() {
    const len = state.settings.len;
    let c = state.round.col;
    do { c++; } while (c < len && isLocked(c));
    state.round.col = Math.min(c, len);
  }
  function moveColBack() {
    let c = state.round.col;
    do { c--; } while (c > 0 && isLocked(c));
    state.round.col = Math.max(c, 0);
  }

  // ---------- Grid ----------
  function renderGrid() {
    gridEl.innerHTML = '';
    const len  = state.settings.len;
    const rows = state.settings.guesses;

    Object.assign(gridEl.style, { display:'grid', gap:'8px', justifyContent:'center' });
    state.round.board = [];

    for (let r=0;r<rows;r++) {
      const row = document.createElement('div');
      row.className = 'row';
      Object.assign(row.style, { display:'grid', gap:'8px', gridTemplateColumns:`repeat(${len},52px)` });

      const rowData = [];
      for (let c=0;c<len;c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        Object.assign(tile.style, {
          width:'52px', height:'52px', display:'flex', alignItems:'center',
          justifyContent:'center', border:'2px solid #999', borderRadius:'8px',
          textTransform:'uppercase'
        });
        tile.textContent = '';
        row.appendChild(tile);
        rowData.push(tile);
      }
      gridEl.appendChild(row);
      state.round.board.push(rowData);
    }
  }

  // ---------- Keyboard (removed for now) ----------
  function renderKeyboard() {
    keyboardEl.innerHTML = '';   // clear and hide
    keyboardEl.style.display = 'none';
  }

  // ---------- Scores (simple table, unchanged) ----------
  function renderScores() {
    const r1 = state.stats.p1, r2 = state.stats.p2;
    let html = `<tr><td>Player 1</td><td>${r1.total_games}</td><td>${r1.wins}</td><td>${r1.first_try_wins}</td><td>${r1.steals}</td></tr>`;
    if (state.settings.mode==='two') {
      html += `<tr><td>Player 2</td><td>${r2.total_games}</td><td>${r2.wins}</td><td>${r2.first_try_wins}</td><td>${r2.steals}</td></tr>`;
    }
    scoreRows.innerHTML = html;
  }

  // ---------- Timer (accurate, starts on first typed letter) ----------
  function placeTimerBar() {
    if (!timerEl.parentNode) gridEl.insertAdjacentElement('afterend', timerEl);
    timerEl.style.width = '100%';
  }

  function startTimerForRow() {
    // Accurate countdown using timestamps (updates every 100ms)
    clearInterval(state.timerInterval);
    state.timerRunning = true;
    const totalMs = state.settings.timer * 1000;
    state.deadlineTs = Date.now() + totalMs;
    placeTimerBar();

    state.timerInterval = setInterval(() => {
      const remaining = Math.max(0, state.deadlineTs - Date.now());
      timerEl.style.width = `${(remaining / totalMs) * 100}%`;
      if (remaining <= 0) {
        clearInterval(state.timerInterval);
        state.timerRunning = false;
        onTimeOut();
      }
    }, 100);
  }

  function stopTimer() {
    clearInterval(state.timerInterval);
    state.timerRunning = false;
  }

  function onTimeOut() {
    if (state.round.stage !== 'playing') return;
    const secret = state.round.secret;
    setMessage(`⏰ Time's up! Word was ${secret}`);
    state.round.stage = 'lost';
    nextBtn.hidden = false;
  }

  // ---------- Round ----------
  function buildCurrentDict() {
    state.dictCurrent = new Set();
    if (state.settings.wordSet === 'singlish') {
      state.singlish5.forEach(w => state.dictCurrent.add(w));
    } else {
      const arr = state.wordsByLen[state.settings.len] || [];
      arr.forEach(w => state.dictCurrent.add(w));
    }
  }

  function startNewRound() {
    // read controls (with safety if controls missing)
    state.settings.mode    = modeSel?.value || state.settings.mode;
    state.settings.len     = parseInt(lenSel?.value ?? state.settings.len, 10);
    state.settings.guesses = Math.max(3, Math.min(10, parseInt(guessesInput?.value ?? state.settings.guesses, 10) || 6));
    state.settings.reveal  = revealSel?.value || state.settings.reveal;
    state.settings.wordSet = wordSetSel?.value || state.settings.wordSet;
    state.settings.timer   = parseInt(timerSel?.value ?? state.settings.timer, 10) || state.settings.timer;
    persist();

    // If Singlish selected but length ≠ 5, force length to 5 (that’s the only Singlish size)
    if (state.settings.wordSet === 'singlish' && state.settings.len !== 5) {
      state.settings.len = 5;
      if (lenSel) lenSel.value = '5';
    }

    const len = state.settings.len;

    // prepare dict and secret
    buildCurrentDict();
    state.round.secret    = pickSecret(state.settings.wordSet, len);
    state.round.stage     = 'playing';
    state.round.row       = 0;
    state.round.lockedIdx = computeLockedIdx(len, state.settings.reveal);

    renderGrid();
    renderKeyboard(); // currently hidden
    renderScores();
    setMessage('');
    nextBtn.hidden = true;

    // prefill locked letters on EVERY row (so the locked letter stays at col 0 / last)
    for (let r=0;r<state.settings.guesses;r++) prefillLockedForRow(r);

    // set cursor to first editable col
    state.round.col = firstEditableCol(len, state.round.lockedIdx);

    // timer waits for first typed letter in the row
    stopTimer();
    placeTimerBar();
  }

  function setMessage(msg, isError=false) {
    messageEl.textContent = msg;
    messageEl.classList.toggle('error', !!isError);
  }

  // ---------- Typing & guesses (physical keyboard only) ----------
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if (state.round.stage !== 'playing') return;

    if (/^[a-zA-Z]$/.test(k)) {
      // start timer at first input
      if (!state.timerRunning) startTimerForRow();

      // if current col is locked, skip forward
      if (isLocked(state.round.col)) moveColForward();
      if (state.round.col >= state.settings.len) return;
      if (isLocked(state.round.col)) return;

      const ch = k.toUpperCase();
      state.round.board[state.round.row][state.round.col].textContent = ch;
      moveColForward();
    }
    else if (k === 'Backspace') {
      if (!state.timerRunning) startTimerForRow(); // allow backspace to also begin timer
      moveColBack();
      if (isLocked(state.round.col)) {
        // cannot delete locked letter; step forward again
        moveColForward();
      } else {
        state.round.board[state.round.row][state.round.col].textContent = '';
      }
    }
    else if (k === 'Enter') {
      // must fill all editable spots
      const tiles = state.round.board[state.round.row].map((t,i) => isLocked(i) ? state.round.secret[i] : (t.textContent||''));
      if (tiles.some((ch,i)=>!ch && !isLocked(i))) {
        setMessage('Not enough letters', true);
        return;
      }
      submitGuess(tiles.join(''));
    }
  });

  function submitGuess(guess) {
    guess = guess.toUpperCase();

    // validate against current dictionary (English of selected length OR Singlish)
    if (!state.dictCurrent.has(guess)) {
      setMessage('Not in word list', true);
      return;
    }

    const secret = state.round.secret;
    const rowTiles = state.round.board[state.round.row];

    // color tiles (simple Wordle behaviour)
    for (let i=0;i<guess.length;i++) {
      if (guess[i] === secret[i]) {
        rowTiles[i].style.backgroundColor = '#2ECC71'; // green
      } else if (secret.includes(guess[i])) {
        rowTiles[i].style.backgroundColor = '#F4C542'; // amber
      } else {
        rowTiles[i].style.backgroundColor = '#9AA0A6'; // grey
      }
    }

    // win?
    if (guess === secret) {
      setMessage('Correct!');
      state.round.stage = 'won';
      stopTimer();
      nextBtn.hidden = false;
      return;
    }

    // next row or end
    state.round.row += 1;
    if (state.round.row >= state.settings.guesses) {
      setMessage(`Out of guesses! Word was ${secret}`);
      state.round.stage = 'lost';
      stopTimer();
      nextBtn.hidden = false;
      return;
    }

    // prep next row
    prefillLockedForRow(state.round.row);
    state.round.col = firstEditableCol(state.settings.len, state.round.lockedIdx);
    stopTimer();          // wait for typing to restart
    timerEl.style.width = '100%';
    setMessage('');
  }

  // ---------- Buttons & init ----------
  nextBtn.addEventListener('click', startNewRound);

  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset scores and used words?')) return;
    state.stats = { p1:{total_games:0,wins:0,first_try_wins:0,steals:0},
                    p2:{total_games:0,wins:0,first_try_wins:0,steals:0} };
    state.used  = { 4:new Set(), 5:new Set(), 6:new Set(), sg5:new Set() };
    persist();
    renderScores();
    setMessage('Scores reset');
  });

  function setupDarkMode() {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    if (prefersLight) document.body.classList.add('light');
    darkToggle.addEventListener('click', () => document.body.classList.toggle('light'));
  }

  // init
  loadPersisted();
  if (modeSel)    modeSel.value = state.settings.mode;
  if (lenSel)     lenSel.value  = String(state.settings.len);
  if (guessesInput) guessesInput.value = String(state.settings.guesses);
  if (revealSel)  revealSel.value = state.settings.reveal;
  if (wordSetSel) wordSetSel.value = state.settings.wordSet;
  if (timerSel)   timerSel.value = String(state.settings.timer);

  setupDarkMode();
  renderScores();

  loadWords().then(startNewRound);
})();
