let ws = null;
let gameState = null;
let timeLeft = 0;
let prevPhase = null;
let confettiPlayed = false;
let lastBidSnapshot = null;

const PHASE_LABELS = {
  lobby: 'Lobby',
  bid: 'Choix de notes',
  transition: 'Préparation',
  question: 'Question',
  answer_revealed: 'Réponse',
  scores: 'Classement',
  auction_setup: 'Enchères',
  auction_play: 'Enchère en cours',
  auction_result: 'Résultat enchères',
  duel_setup: 'Duel',
  duel_transition: 'Duel',
  duel_question: 'Duel flash',
  game_over: 'Victoire'
};

const AVATAR_COLORS = ['#f2a65a', '#2a9d8f', '#e76f51', '#a9def9', '#fcf6bd', '#c77dff', '#80ed99', '#ff6b6b'];

function connectWs(onOpen) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onmessage = (event) => {
    handleMessage(JSON.parse(event.data));
  };

  ws.onopen = () => {
    if (onOpen) onOpen();
  };

  ws.onclose = () => {
    setTimeout(() => connectWs(), 2000);
  };
}

function watchGame() {
  const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
  const errEl = document.getElementById('connect-error');

  if (!roomCode || roomCode.length !== 4) {
    errEl.textContent = 'Code invalide (4 lettres).';
    return;
  }
  errEl.textContent = '';

  const doWatch = () => ws.send(JSON.stringify({ type: 'WATCH_GAME', roomCode }));

  if (ws?.readyState === WebSocket.OPEN) doWatch();
  else connectWs(doWatch);
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'WATCHING':
      showScreen('screen-display');
      break;
    case 'GAME_STATE': {
      const oldPhase = gameState?.phase;
      gameState = msg.gameState;
      if (gameState.phase === 'game_over' && oldPhase !== 'game_over' && !confettiPlayed) {
        triggerConfetti();
        confettiPlayed = true;
      }
      if (gameState.phase === 'lobby') confettiPlayed = false;
      if (gameState.phase !== 'bid') lastBidSnapshot = null;
      prevPhase = oldPhase;
      renderDisplay();
      break;
    }
    case 'TIMER_TICK':
      timeLeft = msg.timeLeft;
      updateTimer();
      break;
    case 'ERROR':
      document.getElementById('connect-error').textContent = msg.message;
      break;
  }
}

function showScreen(id) {
  document.querySelectorAll('.display-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function getActivePlayer() {
  if (!gameState?.roundOrder?.length) return null;
  return gameState.players[gameState.roundOrder[gameState.currentTurnIndex]];
}

function getActivePlayerIndex() {
  if (!gameState?.roundOrder?.length) return -1;
  return gameState.roundOrder[gameState.currentTurnIndex];
}

function getTempHtml(streak) {
  if (streak === 0) return '<span class="temp-froid">❄️</span>';
  if (streak === 1) return '<span class="temp-tiede">🌤️</span>';
  if (streak === 2) return '<span class="temp-chaud">🔥</span>';
  return '<span class="temp-brulant">🌋</span>';
}

function getSortedPlayers() {
  return [...gameState.players].sort((a, b) => b.score - a.score);
}

function getHostName(gs) {
  return gs?.ownerName || gs?.players?.[gs?.ownerPlayerIndex ?? 0]?.name || "l'animateur";
}

function avatarLetter(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function renderAvatar(name, sizeClass = '') {
  const letter = avatarLetter(name);
  const color = avatarColor(name);
  return `<span class="display-avatar-circle ${sizeClass}" style="background:${color}">${letter}</span>`;
}

function setStageTheme(theme) {
  const stage = document.getElementById('display-stage');
  stage.className = `display-stage theme-${theme}`;
}

function updateStatusBar() {
  const bar = document.getElementById('display-status-bar');
  if (!gameState) {
    bar.setAttribute('aria-hidden', 'true');
    return;
  }
  bar.setAttribute('aria-hidden', 'false');
  const phaseLabel = PHASE_LABELS[gameState.phase] || gameState.phase;
  const round = gameState.roundCount > 0 ? `Manche ${gameState.roundCount}` : 'En attente';
  bar.innerHTML = `
    <span class="display-status-phase">${phaseLabel}</span>
    <span class="display-status-round">${round} · Code ${gameState.roomCode} · Objectif ${gameState.targetScore} pts</span>`;
}

function updateTimer() {
  const el = document.getElementById('display-timer');
  if (!el) return;
  el.textContent = timeLeft;
  el.classList.toggle('timer-danger', timeLeft <= 5);
}

function renderDisplayTimer() {
  return `<div class="display-timer-huge${timeLeft <= 5 ? ' timer-danger' : ''}" id="display-timer">${timeLeft}</div>`;
}

function renderQuestionCard(text, label = 'Question') {
  if (!text) return '';
  return `
    <div class="display-q-card display-q-card-tv">
      <div class="display-q-label">${label}</div>
      <p>${text}</p>
    </div>`;
}

function renderAnswerCard(text, label = 'Réponse') {
  if (!text) return '';
  return `
    <div class="display-q-card display-a-card display-a-card-tv">
      <div class="display-a-label">${label}</div>
      <p class="display-a-text">${text}</p>
    </div>`;
}

function renderQuestionPhase(gs, active) {
  return `
    <div class="display-qa-block">
      <span class="display-theme-badge">${gs.currentTheme?.theme || ''}</span>
      <p class="display-q-player"><strong>${active?.name || '—'}</strong> répond</p>
      ${renderDisplayTimer()}
      <p class="display-q-points">${gs.currentQuestion?.points || '—'} points en jeu</p>
      ${renderQuestionCard(gs.currentQuestion?.q)}
    </div>`;
}

function renderAnswerRevealedPhase(gs, active) {
  return `
    <div class="display-qa-block">
      <span class="display-theme-badge">${gs.currentTheme?.theme || ''}</span>
      <p class="display-q-player">Tour de <strong>${active?.name || '—'}</strong></p>
      ${renderQuestionCard(gs.currentQuestion?.q)}
      ${renderAnswerCard(gs.currentQuestion?.a)}
    </div>`;
}

function renderDuelQuestionPhase(gs) {
  const c = gs.players[gs.duelChallengerIndex];
  const o = gs.players[gs.duelOpponentIndex];
  const q = gs.duelQuestion?.q || '';
  const a = gs.duelQuestion?.a || '';
  return `
    <div class="display-qa-block display-duel-qa">
      <p class="display-duel-title">⚔️ DUEL ⚔️</p>
      <div class="display-duel-matchup">
        <span class="display-duel-fighter">${c?.name || '—'}</span>
        <span class="display-duel-vs">VS</span>
        <span class="display-duel-fighter">${o?.name || '—'}</span>
      </div>
      ${renderDisplayTimer()}
      <span class="display-theme-badge">${gs.duelTheme || 'Duel flash'}</span>
      ${renderQuestionCard(q, 'Question duel')}
      ${gs.duelAnswerRevealed
        ? renderAnswerCard(a, 'Réponse')
        : '<p class="display-duel-sub">Soyez vifs !</p>'}
    </div>`;
}

function animateScoreBars() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.display-score-bar-fill').forEach(el => {
      el.style.width = `${el.dataset.pct}%`;
    });
  });
}

function triggerPhaseAnimation() {
  const content = document.getElementById('display-content');
  content.classList.remove('display-animate');
  void content.offsetWidth;
  content.classList.add('display-animate');
}

function getDisplayBidNote(p, gs) {
  if (p.chosenNote === null) return '?';
  if (gs.isHiddenRound) return '🎭';
  return String(p.chosenNote);
}

function renderDisplay() {
  const el = document.getElementById('display-content');
  if (!gameState) return;

  const gs = gameState;
  const active = getActivePlayer();
  const activeIdx = getActivePlayerIndex();
  const host = getHostName(gs);

  triggerPhaseAnimation();
  updateStatusBar();

  switch (gs.phase) {
    case 'lobby': {
      setStageTheme('default');
      const joinUrl = getPlayerJoinUrl(gs.roomCode);
      const joinHint = getPlayerJoinHint();
      el.innerHTML = `
        <div class="display-lobby-share">
          <div id="display-qrcode" class="share-qrcode share-qrcode-display"></div>
          <p class="display-lobby-url">${joinUrl}</p>
          <div class="display-lobby-code">${gs.roomCode}</div>
          <p class="display-lobby-hint">Scanne le QR code ou va sur <strong>${joinHint}</strong></p>
        </div>
        <p class="display-lobby-host">Partie animée par <strong>${host}</strong></p>
        <div class="display-avatar-grid">${gs.players.map(p => {
          const isHost = p.name === gs.ownerName;
          return `<div class="display-avatar-card${isHost ? ' is-host' : ''}">
            ${renderAvatar(p.name)}
            <span class="display-avatar-name">${p.name}</span>
            ${isHost ? '<span class="display-avatar-tag">Animateur</span>' : ''}
          </div>`;
        }).join('')}</div>`;
      renderQrIntoElement('display-qrcode', joinUrl, 512);
      break;
    }

    case 'bid': {
      setStageTheme('default');
      const theme = gs.isHiddenRound ? '??? Thème Mystère ???' : (gs.currentTheme?.theme || '');
      const prevSnapshot = lastBidSnapshot;
      lastBidSnapshot = gs.players.map(p => p.chosenNote);

      el.innerHTML = `
        <p class="display-section-label">Choix de note</p>
        <p class="display-bid-theme">${theme}</p>
        <p class="display-bid-active">${active?.name || '—'} choisit sa note…</p>
        <div class="display-bid-grid">${gs.players.map((p, i) => {
          const isActive = i === activeIdx;
          const done = p.chosenNote !== null;
          const justPicked = done && prevSnapshot && prevSnapshot[i] === null;
          const noteDisplay = getDisplayBidNote(p, gs);
          return `<div class="display-bid-player${isActive ? ' is-active' : ''}${done ? ' is-done' : ''}">
            <span class="display-bid-avatar" style="background:${avatarColor(p.name)}">${avatarLetter(p.name)}</span>
            <div class="display-bid-info">
              <strong>${p.name}</strong>
              <span class="display-bid-badge ${done ? 'done' : 'wait'}">${done ? '✓ Choisi' : 'En attente'}</span>
            </div>
            <span class="display-bid-note${justPicked ? ' display-bid-note-pop' : ''}${done ? ' display-bid-note-revealed' : ''}">${noteDisplay}</span>
          </div>`;
        }).join('')}</div>`;
      break;
    }

    case 'transition':
      setStageTheme('default');
      el.innerHTML = `
        <span class="display-theme-badge">${gs.currentTheme?.theme || ''}</span>
        <p class="display-q-player">C'est au tour de <strong>${active?.name}</strong></p>
        <p class="display-q-points">Note ${active?.chosenNote} · ${getTempHtml(active?.streak || 0)} · ${active?.chosenNote || 0} pts en jeu</p>
        <p class="display-lobby-hint">Préparez-vous…</p>`;
      break;

    case 'question':
      setStageTheme('default');
      el.innerHTML = renderQuestionPhase(gs, active);
      break;

    case 'answer_revealed':
      setStageTheme('default');
      el.innerHTML = renderAnswerRevealedPhase(gs, active);
      break;

    case 'scores':
      setStageTheme('default');
      el.innerHTML = `
        <h2 class="display-scores-title">Classement 🏆</h2>
        ${renderScoreboard()}`;
      animateScoreBars();
      break;

    case 'game_over': {
      setStageTheme('victory');
      const winner = gs.winnerName || getSortedPlayers()[0]?.name || '';
      el.innerHTML = `
        <p class="display-section-label">Victoire</p>
        <div class="display-winner-shine">${winner.toUpperCase()}</div>
        <p class="display-winner-sub">🏆 remporte la partie !</p>
        ${renderScoreboard()}`;
      animateScoreBars();
      break;
    }

    case 'auction_setup':
      setStageTheme('auction');
      el.innerHTML = `
        <p class="display-auction-title">🗣️ ENCHÈRES</p>
        <p class="display-auction-subject">${gs.auctionSubject}</p>
        <p class="display-duel-sub">📢 ${gs.players[gs.auctionStarterIndex]?.name} ouvre les enchères</p>`;
      break;

    case 'auction_play':
      setStageTheme('auction');
      el.innerHTML = `
        <div class="display-qa-block">
          <p class="display-auction-title">🗣️ ENCHÈRES</p>
          <p class="display-auction-subject">${gs.auctionSubject}</p>
          <p class="display-auction-player">${gs.players[gs.auctionWinnerIndex]?.name}</p>
          ${renderDisplayTimer()}
        </div>`;
      break;

    case 'auction_result':
      setStageTheme('auction');
      el.innerHTML = `
        <h2 class="display-scores-title">Résultat des enchères</h2>
        ${renderScoreboard()}`;
      animateScoreBars();
      break;

    case 'duel_setup':
    case 'duel_transition': {
      setStageTheme('duel');
      const c = gs.players[gs.duelChallengerIndex];
      const o = gs.players[gs.duelOpponentIndex];
      el.innerHTML = `
        <p class="display-duel-title">⚔️ DUEL ⚔️</p>
        ${o ? `
          <div class="display-duel-matchup">
            <span class="display-duel-fighter">${c?.name}</span>
            <span class="display-duel-vs">VS</span>
            <span class="display-duel-fighter">${o?.name}</span>
          </div>
        ` : `<p class="display-duel-sub"><strong>${c?.name}</strong> choisit sa cible…</p>`}`;
      break;
    }

    case 'duel_question':
      setStageTheme('duel');
      el.innerHTML = renderDuelQuestionPhase(gs);
      break;

    default:
      setStageTheme('default');
      el.innerHTML = `<p class="display-lobby-hint">Phase : ${gs.phase}</p>`;
  }
}

function renderScoreboard() {
  const sorted = getSortedPlayers();
  const target = gameState.targetScore;
  return `<div class="display-scores-list">${sorted.map((p, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
    const pct = Math.min((p.score / target) * 100, 100);
    return `<div class="display-score-row" style="animation-delay:${i * 0.08}s">
      <span class="display-score-rank">${medal}</span>
      <div>
        <div class="display-score-name">${p.name} ${getTempHtml(p.streak)}</div>
        <div class="display-score-meta">
          <div class="display-score-bar-wrap">
            <div class="display-score-bar-fill" data-pct="${pct}"></div>
          </div>
          <span class="display-score-pct">${Math.round(pct)}%</span>
        </div>
      </div>
      <span class="display-score-pts">${p.score} / ${target}</span>
    </div>`;
  }).join('')}</div>`;
}

function triggerConfetti() {
  const duration = 5 * 1000;
  const end = Date.now() + duration;
  (function frame() {
    confetti({ particleCount: 4, angle: 60, spread: 80, origin: { x: 0, y: 0.65 } });
    confetti({ particleCount: 4, angle: 120, spread: 80, origin: { x: 1, y: 0.65 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  }());
}

document.getElementById('room-code-input')?.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
});

window.onload = () => connectWs();
