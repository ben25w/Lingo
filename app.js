(function () {
  function qs(s) { return document.querySelector(s); }

  // Elements
  var gridEl        = qs('#grid');
  var keyboardEl    = qs('#keyboard'); // hidden
  var messageEl     = qs('#message');
  var nextBtn       = qs('#nextRound');
  var resetBtn      = qs('#resetScores');

  var modeSel       = qs('#mode');           // single/two (future)
  var lenSel        = qs('#wordLength');     // 4/5/6
  var guessesInput  = qs('#guesses');        // attempts
  var revealSel     = qs('#reveal');         // first/last/none
  var timerSel      = qs('#timerSel');       // optional
  var singlishToggle= qs('#singlishToggle'); // checkbox
  var darkToggle    = qs('#darkToggle');
  var scoreRows     = qs('#scoreRows');

  // Timer bar
  var timerEl = document.createElement('div');
  timerEl.style.height    = '10px';
  timerEl.style.background= '#4A90E2';
  timerEl.style.margin    = '10px auto';
  timerEl.style.transition= 'width 0.1s linear';
  timerEl.style.maxWidth  = '320px';
  timerEl.style.width     = '100%';

  // State
  var state = {
    wordsByLen: { 4: [], 5: [], 6: [] }, // English
    singlish5: [],                        // Singlish (5 letters)
    used: { 4: {}, 5: {}, 6: {}, sg5: {} },

    settings: {
      mode: 'single',
      len: 5,
      guesses: 6,
      reveal: 'first',     // first | last | none
      wordSet: 'english',  // english | singlish
      timer: 15
    },

    round: {
      secret: '',
      stage: 'idle',
      row: 0,
      col: 0,
      board: [],
      lockedIdx: []
    },

    // timer
    timerRunning: false,
    timerInterval: null,
    deadlineTs: 0,

    stats: {
      p1: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 },
      p2: { total_games: 0, wins: 0, first_try_wins: 0, steals: 0 }
    }
  };

  var STORAGE_KEY_STATS = 'lingo_stats_v1';
  var STORAGE_KEY_USED  = 'lingo_used_v1';
  var STORAGE_KEY_PREFS = 'lingo_prefs_v1';

  // ---------- Persistence ----------
  function loadPersisted() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY_STATS));
      if (s) state.stats = s;
    } catch (e) {}
    try {
      var u = JSON.parse(localStorage.getItem(STORAGE_KEY_USED));
      if (u) {
        state.used[4]  = objFromArr(u[4]  || []);
        state.used[5]  = objFromArr(u[5]  || []);
        state.used[6]  = objFromArr(u[6]  || []);
        state.used.sg5 = objFromArr(u.sg5 || []);
      }
    } catch (e) {}
    try {
      var p = JSON.parse(localStorage.getItem(STORAGE_KEY_PREFS));
      if (p) for (var k in p) state.settings[k] = p[k];
    } catch (e) {}
  }
  function persist() {
    localStorage.setItem(STORAGE_KEY_STATS, JSON.stringify(state.stats));
    localStorage.setItem(STORAGE_KEY_USED, JSON.stringify({
      4:   Object.keys(state.used[4]),
      5:   Object.keys(state.used[5]),
      6:   Object.keys(state.used[6]),
      sg5: Object.keys(state.used.sg5)
    }));
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(state.settings));
  }
  function objFromArr(arr) { var o={}; for (var i=0;i<arr.length;i++) o[arr[i]] = true; return o; }

  // ---------- Load words ----------
  function loadWords() {
    var files = [
      { len:4, path:'/words/words-4.txt' },
      { len:5, path:'/words/words-5.txt' },
      { len:6, path:'/words/words-6.txt' }
    ];
    var promises = files.map(function(f){
      return fetch(f.path).then(function(r){ return r.text(); }).then(function(txt){
        var list = txt.split(/\r?\n/).map(trim).filter(Boolean).filter(alphaOnly);
        var up   = list.map(upper).filter(function(w){ return w.length===f.len; });
        state.wordsByLen[f.len] = up;
      }).catch(function(){});
    });

    var pSing = fetch('/words/SINGLISH').then(function(r){ return r.ok ? r.text() : ''; })
      .then(function(txt){
        if (!txt) return;
        var list = txt.split(/\r?\n/).map(trim).filter(Boolean).filter(alphaOnly);
        state.singlish5 = list.map(upper).filter(function(w){ return w.length===5; });
      }).catch(function(){});

    return Promise.all(promises.concat([pSing]));
  }
  function trim(s){ return s.trim(); }
  function alphaOnly(s){ return /^[A-Za-z]+$/.test(s); }
  function upper(s){ return s.toUpperCase(); }

  // ---------- Secret selection ----------
  function pickSecret(wordSet, len) {
    var pool, usedMap;
    if (wordSet === 'singlish') { pool = state.singlish5; usedMap = state.used.sg5; }
    else { pool = state.wordsByLen[len] || []; usedMap = state.used[len]; }

    if (!pool || pool.length === 0) return '';

    if (Object.keys(usedMap).length >= pool.length) {
      // reset repeats
      if (wordSet === 'singlish') state.used.sg5 = {};
      else state.used[len] = {};
      usedMap = (wordSet === 'singlish') ? state.used.sg5 : state.used[len];
    }
    var word, guard=0;
    do { word = pool[Math.floor(Math.random()*pool.length)]; guard++; if (guard>10000) break; }
    while (usedMap[word]);
    usedMap[word] = true;
    return word;
  }

  // ---------- Locked letters ----------
  function computeLockedIdx(len, reveal) {
    if (reveal === 'first') return [0];
    if (reveal === 'last')  return [len-1];
    return [];
  }
  function prefillLockedForRow(r) {
    var secret = state.round.secret;
    var lockedIdx = state.round.lockedIdx;
    var board = state.round.board;
    for (var i=0;i<lockedIdx.length;i++) {
      var idx = lockedIdx[i];
      board[r][idx].textContent = secret[idx];
    }
  }
  function firstEditableCol(len, lockedIdx) {
    var locked = {}; for (var i=0;i<lockedIdx.length;i++) locked[lockedIdx[i]] = true;
    for (var c=0;c<len;c++) if (!locked[c]) return c;
    return 0;
  }
  function isLocked(col) {
    for (var i=0;i<state.round.lockedIdx.length;i++) if (state.round.lockedIdx[i]===col) return true;
    return false;
  }
  function moveColForward() {
    var len = state.settings.len, c = state.round.col;
    do { c++; } while (c < len && isLocked(c));
    state.round.col = Math.min(c, len);
  }
  function moveColBack() {
    var c = state.round.col;
    do { c--; } while (c > 0 && isLocked(c));
    state.round.col = Math.max(c, 0);
  }

  // ---------- Grid ----------
  function renderGrid() {
    gridEl.innerHTML = '';
    var len  = state.settings.len;
    var rows = state.settings.guesses;

    gridEl.style.display = 'grid';
    gridEl.style.gap = '8px';
    gridEl.style.justifyContent = 'center';

    state.round.board = [];
    for (var r=0;r<rows;r++) {
      var row = document.createElement('div');
      row.className = 'row';
      row.style.display = 'grid';
      row.style.gap = '8px';
      row.style.gridTemplateColumns = 'repeat(' + len + ', 52px)';

      var rowData = [];
      for (var c=0;c<len;c++) {
        var tile = document.createElement('div');
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
      gridEl.appendChild(row);
      state.round.board.push(rowData);
    }
  }

  // ---------- Keyboard (hidden) ----------
  function renderKeyboard() {
    if (!keyboardEl) return;
    keyboardEl.innerHTML = '';
    keyboardEl.style.display = 'none';
  }

  // ---------- Scores ----------
  function renderScores() {
    if (!scoreRows) return;
    var r1 = state.stats.p1, r2 = state.stats.p2;
    var html = '<tr><td>Player 1</td><td>'+r1.total_games+'</td><td>'+r1.wins+'</td><td>'+r1.first_try_wins+'</td><td>'+r1.steals+'</td></tr>';
    if (state.settings.mode==='two') {
      html += '<tr><td>Player 2</td><td>'+r2.total_games+'</td><td>'+r2.wins+'</td><td>'+r2.first_try_wins+'</td><td>'+r2.steals+'</td></tr>';
    }
    scoreRows.innerHTML = html;
  }

  // ---------- Timer ----------
  function placeTimerBar() {
    if (!timerEl.parentNode && gridEl) gridEl.insertAdjacentElement('afterend', timerEl);
    timerEl.style.width = '100%';
  }
  function startTimerForRow() {
    clearInterval(state.timerInterval);
    state.timerRunning = true;
    var totalMs = state.settings.timer * 1000;
    state.deadlineTs = Date.now() + totalMs;
    placeTimerBar();
    state.timerInterval = setInterval(function(){
      var remaining = Math.max(0, state.deadlineTs - Date.now());
      timerEl.style.width = ((remaining/totalMs)*100) + '%';
      if (remaining <= 0) {
        clearInterval(state.timerInterval);
        state.timerRunning = false;
        onTimeOut();
      }
    }, 100);
  }
  function stopTimer() { clearInterval(state.timerInterval); state.timerRunning = false; }
  function onTimeOut() {
    if (state.round.stage !== 'playing') return;
    var secret = state.round.secret;
    setMessage('⏰ Time\'s up! Word was ' + secret);
    state.round.stage = 'lost';
    if (nextBtn) nextBtn.hidden = false;
  }

  // ---------- Round ----------
  function startNewRound() {
    // Read current controls
    if (modeSel && modeSel.value) state.settings.mode = modeSel.value;

    if (singlishToggle && singlishToggle.checked) {
      state.settings.wordSet = 'singlish';
    } else {
      state.settings.wordSet = 'english';
    }

    if (lenSel && lenSel.value) state.settings.len = parseInt(lenSel.value, 10);
    if (state.settings.wordSet === 'singlish') {
      state.settings.len = 5;
      if (lenSel && lenSel.value !== '5') lenSel.value = '5'; // force UI to match
    }

    if (guessesInput && guessesInput.value) {
      var g = parseInt(guessesInput.value, 10); if (isNaN(g)) g = 6;
      state.settings.guesses = Math.max(3, Math.min(10, g));
    }
    if (revealSel && revealSel.value) state.settings.reveal = revealSel.value;

    if (timerSel && timerSel.value) {
      var t = parseInt(timerSel.value, 10); if (!isNaN(t) && t > 0) state.settings.timer = t;
    }
    persist();

    var len = state.settings.len;

    state.round.secret    = pickSecret(state.settings.wordSet, len);
    if (!state.round.secret) { setMessage('No words loaded. Check /words files.', true); return; }

    state.round.stage     = 'playing';
    state.round.row       = 0;
    state.round.lockedIdx = computeLockedIdx(len, state.settings.reveal);

    renderGrid();
    renderKeyboard();
    renderScores();
    setMessage('');
    if (nextBtn) nextBtn.hidden = true;

    // Pre-fill locked letters on all rows (keeps column fixed)
    for (var r=0;r<state.settings.guesses;r++) prefillLockedForRow(r);

    state.round.col = firstEditableCol(len, state.round.lockedIdx);

    // Timer waits for first key
    stopTimer();
    placeTimerBar();
  }

  function setMessage(msg, isError) {
    if (!messageEl) return;
    messageEl.textContent = msg;
    if (isError) messageEl.classList.add('error'); else messageEl.classList.remove('error');
  }

  // ---------- Typing & submission ----------
  document.addEventListener('keydown', function(e){
    if (state.round.stage !== 'playing') return;
    var k = e.key;

    if (/^[a-zA-Z]$/.test(k)) {
      if (!state.timerRunning) startTimerForRow();

      if (isLocked(state.round.col)) moveColForward();
      if (state.round.col >= state.settings.len) return;
      if (isLocked(state.round.col)) return;

      var ch = k.toUpperCase();
      state.round.board[state.round.row][state.round.col].textContent = ch;
      moveColForward();
    }
    else if (k === 'Backspace') {
      if (!state.timerRunning) startTimerForRow();
      moveColBack();
      if (isLocked(state.round.col)) {
        moveColForward();
      } else {
        state.round.board[state.round.row][state.round.col].textContent = '';
      }
    }
    else if (k === 'Enter') {
      var tiles = mapRowWithLocks();
      for (var i=0;i<tiles.length;i++) {
        if (!tiles[i] && !isLocked(i)) { setMessage('Not enough letters', true); return; }
      }
      submitGuess(tiles.join(''));
    }
  });

  function mapRowWithLocks() {
    var row = state.round.row, arr = [];
    for (var i=0;i<state.settings.len;i++) {
      if (isLocked(i)) arr[i] = state.round.secret[i];
      else arr[i] = state.round.board[row][i].textContent || '';
    }
    return arr;
  }

  // ---------- Colouring with duplicate handling ----------
  function colourRow(guess, secret, rowTiles) {
    var len = guess.length;
    var counts = {};
    for (var i=0;i<len;i++) counts[secret[i]] = (counts[secret[i]]||0)+1;

    var marks = new Array(len); for (i=0;i<len;i++) marks[i] = 'absent';

    // Greens
    for (i=0;i<len;i++) {
      if (guess[i] === secret[i]) { marks[i] = 'correct'; counts[guess[i]] -= 1; }
    }
    // Yellows
    for (i=0;i<len;i++) {
      if (marks[i] === 'correct') continue;
      var ch = guess[i];
      if ((counts[ch]||0) > 0) { marks[i] = 'present'; counts[ch] -= 1; }
    }

    for (i=0;i<len;i++) {
      if (marks[i] === 'correct') rowTiles[i].style.backgroundColor = '#2ECC71';
      else if (marks[i] === 'present') rowTiles[i].style.backgroundColor = '#F4C542';
      else rowTiles[i].style.backgroundColor = '#9AA0A6';
    }
  }

  // ---------- Submit guess (invalid words still count) ----------
  function submitGuess(rawGuess) {
    var guess  = (rawGuess || '').toUpperCase();
    var secret = state.round.secret;
    var rowTiles = state.round.board[state.round.row];

    colourRow(guess, secret, rowTiles);

    if (guess === secret) {
      setMessage('Correct!');
      state.round.stage = 'won';
      stopTimer();
      if (nextBtn) nextBtn.hidden = false;
      return;
    }

    state.round.row += 1;
    if (state.round.row >= state.settings.guesses) {
      setMessage('Out of guesses! Word was ' + secret);
      state.round.stage = 'lost';
      stopTimer();
      if (nextBtn) nextBtn.hidden = false;
      return;
    }

    prefillLockedForRow(state.round.row);
    state.round.col = firstEditableCol(state.settings.len, state.round.lockedIdx);
    stopTimer();
    timerEl.style.width = '100%';
    setMessage('');
  }

  // ---------- Buttons ----------
  if (nextBtn) nextBtn.addEventListener('click', startNewRound);
  if (resetBtn) resetBtn.addEventListener('click', function(){
    if (!confirm('Reset scores and used words?')) return;
    state.stats = { p1:{total_games:0,wins:0,first_try_wins:0,steals:0},
                    p2:{total_games:0,wins:0,first_try_wins:0,steals:0} };
    state.used  = { 4:{}, 5:{}, 6:{}, sg5:{} };
    persist();
    renderScores();
    setMessage('Scores reset');
  });

  // ---------- Controls → startNewRound on change ----------
  if (modeSel)       modeSel.addEventListener('change', startNewRound);
  if (lenSel)        lenSel.addEventListener('change', startNewRound);
  if (guessesInput)  guessesInput.addEventListener('change', startNewRound);
  if (revealSel)     revealSel.addEventListener('change', startNewRound);
  if (timerSel)      timerSel.addEventListener('change', startNewRound);
  if (singlishToggle)singlishToggle.addEventListener('change', startNewRound);

  // ---------- Dark mode ----------
  function setupDarkMode() {
    try {
      var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      if (prefersLight) document.body.classList.add('light');
      if (darkToggle) darkToggle.addEventListener('click', function(){
        document.body.classList.toggle('light');
      });
    } catch (e) {}
  }

  // Init
  loadPersisted();
  if (modeSel)      modeSel.value = state.settings.mode;
  if (lenSel)       lenSel.value  = String(state.settings.len);
  if (guessesInput) guessesInput.value = String(state.settings.guesses);
  if (revealSel)    revealSel.value = state.settings.reveal;
  if (timerSel)     timerSel.value = String(state.settings.timer);
  if (singlishToggle) singlishToggle.checked = (state.settings.wordSet === 'singlish');

  setupDarkMode();
  renderScores();
  loadWords().then(startNewRound);
})();
