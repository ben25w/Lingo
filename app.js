function startNewRound() {
  renderKeyboard();

  const len = state.settings.len = parseInt(lenSel.value, 10);
  state.settings.mode = modeSel.value;
  state.settings.guesses = Math.max(3, Math.min(10, parseInt(guessesInput.value, 10) || 6));
  state.settings.reveal = revealSel.value;
  persist();

  // Setup round
  state.round.maxRows = state.settings.guesses;
  // Choose secret with no repeats until pool exhausted
  state.round.secret = pickSecret(len);
  if (!state.round.secret) {
    setMessage('No words loaded. Check files in /words.', true);
    return;
  }
  state.round.stage = 'playing';

  // Alternate starter each round in two-player
  if (state.settings.mode === 'two') {
    if (!nextBtn.hidden) {
      state.round.starter = state.round.starter === 1 ? 2 : 1;
    }
  } else {
    state.round.starter = 1;
  }

  state.round.activePlayer = state.round.starter;
  state.round.firstTry = true;
  state.round.stealAvailable = (state.settings.mode === 'two');

  state.round.lockedIdx = getLockedIdx(len, state.settings.reveal);
  buildBoard();

  // Pre-fill locked letters in first row for display
  state.round.lockedIdx.forEach(i => {
    state.round.board[0][i] = state.round.secret[i];
  });

  applyPlayerTint();
  renderGrid();
  renderKeyboard();
  setMessage('');
  nextBtn.hidden = true;
}

// Event bindings
nextBtn.addEventListener('click', startNewRound);
resetBtn.addEventListener('click', () => {
  if (!confirm('Reset scores and used words?')) return;
  state.stats = {
    p1: { total_games:0, wins:0, first_try_wins:0, steals:0 },
    p2: { total_games:0, wins:0, first_try_wins:0, steals:0 }
  };
  state.used = { 4: new Set(), 5: new Set(), 6: new Set() };
  persist();
  renderScores();
  setMessage('Scores reset');
});

modeSel.addEventListener('change', () => {
  renderScores();
  startNewRound();
});
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
