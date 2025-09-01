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
  const darkToggle = qs('#darkToggle');
  const scoreRows = qs('#scoreRows');

  // Timer element
  const timerEl = document.createElement('div');
  timerEl.id = 'timerBar';
  timerEl.style.height = '10px';
  timerEl.style.background = '#4A90E2';
  timerEl.style.margin = '10px auto';
  timerEl.style.transition = 'width 1s linear';
  timerEl.style.maxWidth = '300px';

  // State
  const state = {
    wordsByLen: { 4: [], 5: [], 6: [] },
    dict: new Set(),
    used: { 4: new Set(), 5: new Set(), 6: new Set() },
    settings: { mode: 'single', len: 5, guesses: 6, reveal: 'first', timer: 10 },
    round: {},
    stats: { p1: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 }, p2: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 } },
    timerInterval: null,
    timeLeft: 0
  };

  const STORAGE_KEY_STATS = 'lingo_stats_v1';
  const STORAGE_KEY_USED = 'lingo_used_v1';
  const STORAGE_KEY_PREFS = 'lingo_prefs_v1';

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
    do { word = pool[Math.floor(Math.random() * pool.length)]; } while (state.used[len].has(word));
    state.used[len].add(word);
    return word;
  }

  // Grid
  function renderGrid() {
    gridEl.innerHTML = '';
    const len = state.settings.len;
    const rows = state.settings.guesses;

    gridEl.style.display = 'grid';
    gridEl.style.gap = '8px';
    gridEl.style.justifyContent = 'center';

    state.round.board = [];
    for (let r = 0; r < rows; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.display = 'grid';
      row.style.gap = '8px';
      row.style.gridTemplateColumns = `repeat(${len}, 52px)`;

      const rowData = [];
      for (let c = 0; c < len; c++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.style.width = '52px';
        tile.style.height = '52px';
        tile.style.display = 'flex';
        tile.style.alignItems = 'center';
        tile.style.justifyContent = 'center';
        tile.style.border = '2px solid #999';
        tile.style.borderRadius = '8px';
        tile.style.textTransform = 'uppercase';
        tile.textContent = '';
        row.appendChild(tile);
        rowData.push(tile);
      }
      state.round.board.push(rowData);
      gridEl.appendChild(row);
    }
  }

  // Keyboard
  function renderKeyboard() {
    keyboardEl.innerHTML = '';

    const rows = [
      'QWERTYUIOP',
      'ASDFGHJKL',
      'ZXCVBNM'
    ];

    rows.forEach((row, i) => {
      const rowEl = document.createElement('div');
      rowEl.style.display = 'flex';
      rowEl.style.justifyContent = 'center';
      rowEl.style.gap = '6px';
      rowEl.style.marginBottom = '6px';

      if (i === 1) {
        rowEl.style.paddingLeft = '20px'; // indent 2nd row
      }
      if (i === 2) {
        rowEl.style.paddingLeft = '40px'; // indent 3rd row
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
        key.style.padding = '10px';
        key.style.border = '1px solid #999';
        key.style.borderRadius = '6px';
        key.style.textTransform = 'uppercase';
        key.dataset.key = ch;
        rowEl.appendChild(key);
      }

      if (i === 2) {
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
    const r1 = state.stats.p1;
    const r2 = state.stats.p2;
    let html = `<tr><td>Player 1</td><td>${r1.total_games}</td><td>${r1.wins}</td><td>${r1.first_try_wins}</td><td>${r1.steals}</td></tr>`;
    if (state.settings.mode==='two') {
      html += `<tr><td>Player 2</td><td>${r2.total_games}</td><td>${r2.wins}</td><td>${r2.first_try_wins}</td><td>${r2.steals}</td></tr>`;
    }
    scoreRows.innerHTML = html;
  }

  function startTimer() {
    clearInterval(state.timerInterval);
    state.timeLeft = state.settings.timer;
    timerEl.style.width = '100%';
    if (!timerEl.parentNode) {
      gridEl.insertAdjacentElement('afterend', timerEl);
    }

    const total = state.settings.timer;
    state.timerInterval = setInterval(() => {
      state.timeLeft--;
      timerEl.style.width = `${(state.timeLeft / total) * 100}%`;
      if (state.timeLeft <= 0) {
        clearInterval(state.timerInterval);
        timeOutEnd();
      }
    }, 1000);
  }

  function timeOutEnd() {
    if (state.round.stage !== 'playing') return;
    const secret = state.round.secret;
    messageEl.textContent = `⏰ Time's up! Word was ${secret}`;
    state.round.stage = 'lost';
    nextBtn.hidden = false;
  }

  function startNewRound() {
    const len = state.settings.len = parseInt(lenSel.value, 10);
    state.settings.mode = modeSel.value;
    state.settings.guesses = Math.max(3, Math.min(10, parseInt(guessesInput.value, 10) || 6));
    state.settings.reveal = revealSel.value;
    persist();

    state.round = {
      secret: pickSecret(len),
      stage: 'playing',
      row: 0,
      col: 0,
      board: []
    };

    renderGrid();
    renderKeyboard();
    renderScores();
    messageEl.textContent = '';
    nextBtn.hidden = true;

    // Reveal first letter if option is set
    if (state.settings.reveal === 'first' && state.round.secret) {
      state.round.board[0][0].textContent = state.round.secret[0];
      state.round.col = 1;
    }

    startTimer();
  }

  // Typing and guesses
  function handleKey(key) {
    if (state.round.stage !== 'playing') return;
    const len = state.settings.len;
    const row = state.round.row;
    const col = state.round.col;

    if (/^[A-Z]$/.test(key)) {
      if (col < len) {
        state.round.board[row][col].textContent = key;
        state.round.col++;
      }
    } else if (key === 'Backspace') {
      if (state.round.col > 0) {
        state.round.col--;
        if (!(state.settings.reveal === 'first' && row === 0 && state.round.col === 0)) {
          state.round.board[row][state.round.col].textContent = '';
        } else {
          state.round.col = 1;
        }
      }
    } else if (key === 'Enter') {
      if (state.round.col === len) {
        const guess = state.round.board[row].map(t => t.textContent).join('');
        submitGuess(guess);
      } else {
        messageEl.textContent = 'Not enough letters';
      }
    }
  }

  function submitGuess(guess) {
    guess = guess.toUpperCase();
    if (!state.dict.has(guess)) {
      messageEl.textContent = 'Not in word list';
      return;
    }

    const secret = state.round.secret;
    const rowTiles = state.round.board[state.round.row];

    for (let i = 0; i < guess.length; i++) {
      if (guess[i] === secret[i]) {
        rowTiles[i].style.backgroundColor = '#2ECC71';
      } else if (secret.includes(guess[i])) {
        rowTiles[i].style.backgroundColor = '#F4C542';
      } else {
        rowTiles[i].style.backgroundColor = '#9AA0A6';
      }
    }

    if (guess === secret) {
      messageEl.textContent = 'Correct!';
      state.round.stage = 'won';
      clearInterval(state.timerInterval);
      nextBtn.hidden = false;
      return;
    }

    state.round.row++;
    state.round.col = (state.settings.reveal === 'first' ? 1 : 0);

    if (state.round.row >= state.settings.guesses) {
      messageEl.textContent = `Out of guesses! Word was ${secret}`;
      state.round.stage = 'lost';
      clearInterval(state.timerInterval);
      nextBtn.hidden = false;
    } else {
      startTimer();
    }
  }

  function setupDarkMode() {
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    if (prefersLight) document.body.classList.add('light');
    darkToggle.addEventListener('click', ()=>document.body.classList.toggle('light'));
  }

  // Event bindings
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-zA-Z]$/.test(e.key)) {
      handleKey(e.key === 'Enter' || e.key === 'Backspace' ? e.key : e.key.toUpperCase());
    }
  });

  nextBtn.addEventListener('click', startNewRound);
  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset scores and used words?')) return;
    state.stats = { p1:{total_games:0,wins:0,first_try_wins:0,steals:0}, p2:{total_games:0,wins:0,first_try_wins:0,steals:0} };
    state.used = { 4:new Set(), 5:new Set(), 6:new Set() };
    persist();
    renderScores();
    messageEl.textContent = 'Scores reset';
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
