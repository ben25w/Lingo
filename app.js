(() => {
  const qs = (s) => document.querySelector(s);

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
  const timerSel = qs('#timerSel'); // optional (safe if missing)
  const darkToggle = qs('#darkToggle');
  const scoreRows = qs('#scoreRows');

  // Timer bar (sits between grid and keyboard)
  const timerEl = document.createElement('div');
  timerEl.id = 'timerBar';
  Object.assign(timerEl.style, {
    height: '10px',
    background: '#4A90E2',
    margin: '10px auto',
    transition: 'width 1s linear',
    maxWidth: '300px',
    width: '100%'
  });

  // State
  const state = {
    wordsByLen: { 4: [], 5: [], 6: [] },
    dict: new Set(),
    used: { 4: new Set(), 5: new Set(), 6: new Set() },
    settings: { mode: 'single', len: 5, guesses: 6, reveal: 'first', timer: 15 },
    round: {
      secret: '',
      stage: 'idle',
      row: 0,
      col: 0,
      board: [],
      lockedIdx: []
    },
    stats: {
      p1: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 },
      p2: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 }
    },
    timerInterval: null,
    timeLeft: 0,
    timerRunning: false
  };

  const STORAGE_KEY_STATS = 'lingo_stats_v1';
  const STORAGE_KEY_USED  = 'lingo_used_v1';
  const STORAGE_KEY_PREFS = 'lingo_prefs_v1';

  // ---------- Persistence ----------
  function loadPersisted() {
    try { const s = JSON.parse(localStorage.getItem(STORAGE_KEY_STATS)); if (s) state.stats = s; } catch {}
    try { const u = JSON.parse(localStorage.getItem(STORAGE_KEY_USED));  if (u) for (const k of [4,5,6]) state.used[k] = new Set(u[k]||[]); } catch {}
    try { const p = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFS)); if (p) state.settings = { ...state.settings, ...p }; } catch {}
  }
  function persist() {
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(state.stats));
    localStorage.setItem(STORAGE_KEY_USED, JSON.stringify({4:[...state.used[4]],5:[...state.used[5]],6:[...state.used[6]]}));
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(state.settings));
  }

  // ---------- Words ----------
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
      const up   = list.map(w=>w.toUpperCase()).filter(w=>w.length===f.len);
      state.wordsByLen[f.len] = up;
      up.forEach(w=>state.dict.add(w));
    }
  }
  function pickSecret(len) {
    const pool = state.wordsByLen[len] || [];
    if (!pool.length) return '';
    if (state.used[len].size >= pool.length) state.used[len].clear();
    let word;
    do { word = pool[Math.floor(Math.random()*pool.length)]; } while (state.used[len].has(word));
    state.used[len].add(word);
    return word;
  }

  // ---------- Helpers for locked letters ----------
  function computeLockedIdx(len, reveal) {
    if (reveal === 'first') return [0];
    if (reveal === 'last')  return [len-1];
    return [];
  }
  function firstEditableCol(len, lockedIdx) {
    const locked = new Set(lockedIdx);
    for (let c=0;c<len;c++) if (!locked.has(c)) return c;
    return 0;
  }
  function isLocked(col) {
    return state.round.lockedIdx.includes(col);
  }
  function prefillLockedForRow(r) {
    const { secret, lockedIdx, board } = state.round;
    lockedIdx.forEach(idx => {
      board[r][idx].textContent = secret[idx];
    });
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

  // ---------- Keyboard (Wordle style) ----------
  function renderKeyboard() {
    keyboardEl.innerHTML = '';
    const rows = ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];

    rows.forEach((row, i) => {
      const rowEl = document.createElement('div');
      Object.assign(rowEl.style, { display:'flex', justifyContent:'center', gap:'6px', marginBottom:'6px' });
      if (i===1) rowEl.style.paddingLeft = '20px';
      if (i===2) rowEl.style.paddingLeft = '40px';

      if (i===2) {
        const enter = document.createElement('button');
        enter.textContent = 'Enter';
        enter.className = 'key wide';
        enter.dataset.key = 'Enter';
        rowEl.appendChild(enter);
      }

      for (const ch of row) {
        const key = document.createElement('button');
        key.textContent = ch;
        key.className = 'key';
        Object.assign(key.style, { padding:'10px', border:'1px solid #999', borderRadius:'6px', textTransform:'uppercase' });
        key.dataset.key = ch;
        rowEl.appendChild(key);
      }

      if (i===2) {
        const back = document.createElement('button');
        back.textContent = '⌫';
        back.className = 'key wide';
        back.dataset.key = 'Backspace';
        rowEl.appendChild(back);
      }

      keyboardEl.appendChild(rowEl);
    });

    keyboardEl.querySelectorAll('.key').forEach(btn => {
      btn.addEventListener('click', () => handleKey(btn.dataset.key));
    });
  }

  function renderScores() {
    const r1 = state.stats.p1, r2 = state.stats.p2;
    let html = `<tr><td>Player 1</td><td>${r1.total_games}</td><td>${r1.wins}</td><td>${r1.first_try_wins}</td><td>${r1.steals}</td></tr>`;
    if (state.settings.mode==='two') {
      html += `<tr><td>Player 2</td><td>${r2.total_games}</td><td>${r2.wins}</td><td>${r2.first_try_wins}</td><td>${r2.steals}</td></tr>`;
    }
    scoreRows.innerHTML = html;
  }

  // ---------- Timer ----------
  function resetTimerVisual() {
    timerEl.style.width = '100%';
    if (!timerEl.parentNode) gridEl.insertAdjacentElement('afterend', timerEl);
  }
  function startTimerForRow() {
    clearInterval(state.timerInterval);
    state.timeLeft = state.settings.timer;
    state.timerRunning = true;
    resetTimerVisual();

    const total = state.settings.timer;
    // wait 1s before first decrement so it feels like a true full count
    state.timerInterval = setInterval(() => {
      state.timeLeft -= 1;
      timerEl.style.width = `${Math.max(0, (state.timeLeft/total)*100)}%`;
      if (state.timeLeft <= 0) {
        clearInterval(state.timerInterval);
        onTimeOut();
      }
    }, 1000);
  }
  function stopTimer() {
    clearInterval(state.timerInterval);
    state.timerRunning = false;
  }
  function onTimeOut() {
    if (state.round.stage !== 'playing') return;
    const secret = state.round.secret;
    messageEl.textContent = `⏰ Time's up! Word was ${secret}`;
    state.round.stage = 'lost';
    nextBtn.hidden = false;
  }

  // ---------- Round ----------
  function startNewRound() {
    const len = state.settings.len = parseInt(lenSel.value, 10);
    state.settings.mode    = modeSel.value;
    state.settings.guesses = Math.max(3, Math.min(10, parseInt(guessesInput.value, 10) || 6));
    state.settings.reveal  = revealSel.value;
    // timer select is optional in HTML
    if (timerSel && timerSel.value) state.settings.timer = parseInt(timerSel.value, 10) || state.settings.timer;
    persist();

    state.round.secret    = pickSecret(len);
    state.round.stage     = 'playing';
    state.round.row       = 0;
    state.round.lockedIdx = computeLockedIdx(len, state.settings.reveal);

    renderGrid();
    renderKeyboard();
    renderScores();
    setMessage('');
    nextBtn.hidden = true;

    // Pre-fill locked letters on ALL rows so columns never shift
    for (let r=0; r<state.settings.guesses; r++) prefillLockedForRow(r);

    // Set cursor to first editable column
    state.round.col = firstEditableCol(len, state.round.lockedIdx);

    // Timer: wait until first typing
    stopTimer();
    resetTimerVisual();
  }

  function setMessage(msg, isError=false) {
    messageEl.textContent = msg;
    messageEl.classList.toggle('error', !!isError);
  }

  // ---------- Input / Guessing ----------
  function handleKey(key) {
    if (state.round.stage !== 'playing') return;

    // Start timer for this row on first actual input
    if (!state.timerRunning && (key === 'Backspace' || key === 'Enter' || /^[A-Z]$/.test(key))) {
      startTimerForRow();
    }

    const len = state.settings.len;
    const row = state.round.row;

    if (/^[A-Z]$/.test(key)) {
      // If current col is locked, hop forward
      if (isLocked(state.round.col)) moveColForward();
      if (state.round.col >= len) return;
      if (isLocked(state.round.col)) return; // safety
      state.round.board[row][state.round.col].textContent = key;
      moveColForward();
    } else if (key === 'Backspace') {
      // move back to previous editable col and clear it
      moveColBack();
      if (isLocked(state.round.col)) {
        // If we landed on a locked spot, hop forward again (can't delete it)
        moveColForward();
      } else {
        state.round.board[row][state.round.col].textContent = '';
      }
    } else if (key === 'Enter') {
      // Build guess including locked letters
      const tiles = state.round.board[row].map((t,i) => isLocked(i) ? state.round.secret[i] : (t.textContent||''));
      const guess = tiles.join('').toUpperCase();

      // Must be full length
      if (tiles.some((ch,i)=>!ch && !isLocked(i))) {
        setMessage('Not enough letters', true);
        return;
      }

      submitGuess(guess);
    }
  }

  function submitGuess(guess) {
    if (!state.dict.has(guess)) {
      setMessage('Not in word list', true);
      return;
    }

    const secret = state.round.secret;
    const row    = state.round.row;
    const rowTiles = state.round.board[row];

    // Simple Wordle coloring
    for (let i=0;i<guess.length;i++) {
      if (guess[i] === secret[i]) {
        rowTiles[i].style.backgroundColor = '#2ECC71';
      } else if (secret.includes(guess[i])) {
        rowTiles[i].style.backgroundColor = '#F4C542';
      } else {
        rowTiles[i].style.backgroundColor = '#9AA0A6';
      }
    }

    // Win?
    if (guess === secret) {
      setMessage('Correct!');
      state.round.stage = 'won';
      stopTimer();
      nextBtn.hidden = false;
      return;
    }

    // Next row or end
    state.round.row += 1;
    if (state.round.row >= state.settings.guesses) {
      setMessage(`Out of guesses! Word was ${secret}`);
      state.round.stage = 'lost';
      stopTimer();
      nextBtn.hidden = false;
      return;
    }

    // Prepare next row
    prefillLockedForRow(state.round.row);
    state.round.col = firstEditableCol(state.settings.len, state.round.lockedIdx);
    stopTimer();            // wait for typing to restart timer
    resetTimerVisual();     // reset bar to full width
    setMessage('');
  }

  // ---------- Dark mode ----------
  function setupDarkMode() {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    if (prefersLight) document.body.classList.add('light');
    darkToggle.addEventListener('click', () => document.body.classList.toggle('light'));
  }

  // ---------- Events ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-zA-Z]$/.test(e.key)) {
      handleKey(e.key === 'Enter' || e.key === 'Backspace' ? e.key : e.key.toUpperCase());
    }
  });

  nextBtn.addEventListener('click', startNewRound);

  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset scores and used words?')) return;
    state.stats = { p1:{total_games:0,wins:0,first_try_wins:0,steals:0}, p2:{total_games:0,wins:0,first_try_wins:0,steals:0} };
    state.used  = { 4:new Set(), 5:new Set(), 6:new Set() };
    persist();
    renderScores();
    setMessage('Scores reset');
  });

  modeSel.addEventListener('change', startNewRound);
  lenSel.addEventListener('change', startNewRound);
  guessesInput.addEventListener('change', startNewRound);
  revealSel.addEventListener('change', startNewRound);
  if (timerSel) timerSel.addEventListener('change', startNewRound);

  // ---------- Init ----------
  loadPersisted();
  modeSel.value = state.settings.mode;
  lenSel.value = String(state.settings.len);
  guessesInput.value = String(state.settings.guesses);
  revealSel.value = state.settings.reveal;
  if (timerSel) timerSel.value = String(state.settings.timer);

  setupDarkMode();
  renderScores();
  loadWords().then(startNewRound);
})();
