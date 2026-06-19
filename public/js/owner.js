let ws = null;
let gameState = null;
let ownerToken = sessionStorage.getItem('ttmc_ownerToken') || null;
let roomCode = sessionStorage.getItem('ttmc_roomCode') || null;
let playerIndex = parseInt(sessionStorage.getItem('ttmc_ownerPlayerIndex') ?? '-1', 10);
let prevPhase = null;
let timeLeft = 0;

function connectWs(onOpen) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    setTimeout(() => connectWs(onOpen), 2000);
  };

  ws.onopen = () => {
    if (ownerToken && roomCode) {
      ws.send(JSON.stringify({ type: 'OWNER_SYNC', ownerToken, roomCode }));
    } else if (onOpen) {
      onOpen();
    }
  };
}

function send(type, payload = {}) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ownerToken, ...payload }));
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'GAME_CREATED':
      ownerToken = msg.ownerToken;
      roomCode = msg.roomCode;
      playerIndex = msg.playerIndex ?? 0;
      sessionStorage.setItem('ttmc_ownerToken', ownerToken);
      sessionStorage.setItem('ttmc_roomCode', roomCode);
      sessionStorage.setItem('ttmc_ownerPlayerIndex', String(playerIndex));
      gameState = msg.gameState;
      showScreen('screen-lobby');
      renderAll();
      break;
    case 'OWNER_SYNCED':
      playerIndex = msg.playerIndex ?? playerIndex;
      sessionStorage.setItem('ttmc_ownerPlayerIndex', String(playerIndex));
      gameState = msg.gameState;
      showScreen(gameState.phase === 'lobby' ? 'screen-lobby' : 'screen-phase');
      renderAll();
      break;
    case 'GAME_STATE':
      handleGameState(msg.gameState);
      break;
    case 'TIMER_TICK':
      timeLeft = msg.timeLeft;
      updateTimerDisplay();
      break;
    case 'ERROR':
      alert(msg.message);
      break;
  }
}

function handleGameState(state) {
  const oldPhase = gameState?.phase;
  gameState = state;

  if (state.lastSound) playSound(state.lastSound);
  if (state.phase === 'game_over' && oldPhase !== 'game_over') {
    triggerConfetti();
    const winner = state.winnerName || getSortedPlayers()[0]?.name;
    if (winner) saveHallOfFame(winner, getSortedPlayers()[0]?.score || 0);
  }

  if (state.phase === 'lobby') {
    showScreen('screen-lobby');
  } else {
    showScreen('screen-phase');
  }
  renderAll();
  prevPhase = state.phase;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function createGame() {
  const ownerName = document.getElementById('owner-name').value.trim();
  const targetScore = parseInt(document.getElementById('target-score').value, 10) || 30;
  if (!ownerName) {
    alert('Entrez votre prénom pour créer la partie.');
    return;
  }
  const doCreate = () => {
    ws.send(JSON.stringify({ type: 'CREATE_GAME', targetScore, ownerName }));
  };
  if (ws && ws.readyState === WebSocket.OPEN) {
    doCreate();
  } else {
    connectWs(doCreate);
  }
}

function isMyTurn() {
  if (!gameState || playerIndex < 0) return false;
  return gameState.roundOrder[gameState.currentTurnIndex] === playerIndex;
}

function getTakenNotes() {
  if (!gameState) return [];
  return gameState.players.map(p => p.chosenNote).filter(n => n !== null);
}

function chooseNote(note) {
  ws.send(JSON.stringify({ type: 'CHOOSE_NOTE', note }));
}

function playerReady() {
  ws.send(JSON.stringify({ type: 'PLAYER_READY' }));
}

function getMe() {
  return gameState?.players[playerIndex] || null;
}

function startGame() {
  const targetScore = parseInt(document.getElementById('lobby-target-score').value, 10) || 30;
  send('START_GAME', { targetScore });
}

function copyRoomCode() {
  if (roomCode) {
    copyTextToClipboard(roomCode);
  }
}

function copyShareLink() {
  const input = document.getElementById('share-link-input');
  if (input?.value) {
    copyTextToClipboard(input.value);
  }
}

function updateLobbyShare(code) {
  const joinUrl = getPlayerJoinUrl(code);
  const shareInput = document.getElementById('share-link-input');
  if (shareInput) shareInput.value = joinUrl;
  renderQrIntoElement('owner-qrcode', joinUrl, 256);
}

function ownerAction(action) {
  send('OWNER_ACTION', { action });
}

function resolveTurn(isCorrect) {
  send('RESOLVE_TURN', { isCorrect });
}

function selectAuctionWinner(idx) {
  send('SELECT_AUCTION_WINNER', { playerIndex: idx });
}

function resolveAuction(success) {
  send('RESOLVE_AUCTION', { success });
}

function selectDuelOpponent(idx) {
  send('SELECT_DUEL_OPPONENT', { playerIndex: idx });
}

function resolveDuel(winner) {
  send('RESOLVE_DUEL', { winner });
}

function getSortedPlayers() {
  if (!gameState) return [];
  return [...gameState.players].sort((a, b) => b.score - a.score);
}

function getTempHtml(streak) {
  if (streak === 0) return '<span class="temp-froid">❄️ Froid</span>';
  if (streak === 1) return '<span class="temp-tiede">🌤️ Tiède</span>';
  if (streak === 2) return '<span class="temp-chaud">🔥 Chaud</span>';
  return '<span class="temp-brulant">🌋 Brûlant (+1 pt)</span>';
}

function getActivePlayer() {
  if (!gameState || !gameState.roundOrder.length) return null;
  const idx = gameState.roundOrder[gameState.currentTurnIndex];
  return gameState.players[idx];
}

function renderSidebar() {
  const el = document.getElementById('sidebar-scores');
  if (!gameState || !gameState.players.length) {
    el.innerHTML = '<p style="color:#b5c2b7;font-size:0.85rem;">Aucun joueur</p>';
    return;
  }
  const sorted = getSortedPlayers();
  el.innerHTML = sorted.map((p, i) => {
    const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
    const pct = Math.min((p.score / gameState.targetScore) * 100, 100);
    const isMe = gameState.players.indexOf(p) === playerIndex;
    return `<div class="sidebar-player${isMe ? ' sidebar-player-me' : ''}">
      <strong>${medal}${p.name}${isMe ? ' (vous)' : ''}</strong>
      <span>${p.score} pts</span>
      <div class="progress-container"><div class="progress-bar" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');
}

function renderPhaseBadge() {
  const phases = {
    lobby: 'Lobby', bid: 'Choix de note', transition: 'Transition',
    question: 'Question', answer_revealed: 'Validation',
    scores: 'Scores', auction_setup: 'Enchères', auction_play: 'Enchère en cours',
    auction_result: 'Résultat enchère', duel_setup: 'Duel', duel_transition: 'Duel',
    duel_question: 'Duel Flash', game_over: 'Fin de partie'
  };
  document.getElementById('phase-badge').textContent = phases[gameState?.phase] || '—';
}

function updateTimerDisplay() {
  const el = document.getElementById('owner-timer');
  if (!el) return;
  el.textContent = `⏱️ ${timeLeft}s`;
  el.style.color = timeLeft <= 5 ? 'var(--danger)' : 'var(--primary)';
  if (timeLeft <= 5 && timeLeft > 0) playSound('tick');
}

function renderLobby() {
  const code = gameState.roomCode || roomCode;
  document.getElementById('room-code-display').textContent = code;
  updateLobbyShare(code);
  document.getElementById('player-count').textContent = gameState.players.length;
  document.getElementById('player-list').innerHTML = gameState.players.length
    ? gameState.players.map((p, i) => {
        const tag = i === playerIndex ? ' <strong style="color:var(--primary)">(vous – animateur)</strong>' : '';
        return `${i + 1}. ${p.name}${tag}`;
      }).join('<br>')
    : 'En attente de joueurs...';
  document.getElementById('btn-start').disabled = gameState.players.length < 2;
  document.getElementById('lobby-target-score').value = gameState.targetScore;
  document.getElementById('owner-pause-msg').style.display = gameState.ownerDisconnected ? 'block' : 'none';
}

function renderScoreboard(full = true) {
  const sorted = getSortedPlayers();
  let rows = sorted.map((p, i) => {
    const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
    const pct = Math.min((p.score / gameState.targetScore) * 100, 100);
    return `<tr>
      <td><strong>${medal}${i + 1}</strong></td>
      <td>${p.name}</td>
      <td>${getTempHtml(p.streak)}</td>
      <td><strong>${p.score} / ${gameState.targetScore} pts</strong>
        <div class="progress-container"><div class="progress-bar" style="width:${pct}%"></div></div>
      </td>
    </tr>`;
  }).join('');
  return `<table><thead><tr><th>Pos</th><th>Joueur</th><th>Temp.</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderPhaseContent() {
  const el = document.getElementById('phase-content');
  if (!gameState) return;

  const active = getActivePlayer();
  const gs = gameState;

  switch (gs.phase) {
    case 'bid': {
      const theme = gs.isHiddenRound ? '??? Thème Mystère ???' : (gs.currentTheme?.theme || '—');
      const me = getMe();
      let playerBlock = '';
      if (isMyTurn()) {
        const taken = getTakenNotes();
        let buttons = '';
        for (let i = 1; i <= gs.players.length; i++) {
          const disabled = taken.includes(i) ? 'disabled' : '';
          buttons += `<button class="btn-note" ${disabled} onclick="chooseNote(${i})">${i}</button>`;
        }
        playerBlock = `
          <div class="owner-play-panel">
            <p><strong>C'est votre tour !</strong> Choisissez votre note :</p>
            ${me ? `<p>${getTempHtml(me.streak)}</p>` : ''}
            <div class="grid-dynamic">${buttons}</div>
          </div>`;
      } else {
        playerBlock = `<p>En attente que <strong style="color:var(--primary)">${active?.name || '—'}</strong> choisisse sa note...</p>`;
      }
      el.innerHTML = `
        <h3>Choix de note</h3>
        <h2>${theme}</h2>
        ${gs.isHiddenRound ? '<p style="color:var(--danger);">⚠️ Thème mystère – révélé après les choix</p>' : ''}
        <p class="turn-indicator">Joueur ${gs.currentTurnIndex + 1} sur ${gs.players.length}</p>
        ${playerBlock}
        <div class="grid-dynamic">${renderNotesStatus()}</div>`;
      break;
    }
    case 'transition': {
      let actionBlock = '';
      if (isMyTurn()) {
        actionBlock = `
          <div class="owner-play-panel">
            <p><strong>C'est votre tour !</strong></p>
            <button class="ready-btn" onclick="playerReady()">Je suis prêt(e) ! 🚀</button>
          </div>
          <p style="color:#b5c2b7;font-size:0.85rem;margin-top:10px;">Ou lancer manuellement (animateur) :</p>
          <button onclick="ownerAction('READY_TO_QUESTION')">Lancer la question ▶️</button>`;
      } else {
        actionBlock = `
          <p style="color:#b5c2b7;">En attente que <strong>${active?.name}</strong> se prépare...</p>
          <button class="ready-btn" onclick="ownerAction('READY_TO_QUESTION')">Lancer la question ▶️</button>`;
      }
      el.innerHTML = `
        <h3>Transition</h3>
        <h2 style="font-size:2.5rem;color:var(--primary)">${active?.name}</h2>
        <p>Thème : <strong>${gs.currentTheme?.theme}</strong></p>
        <p>Note : <strong>${active?.chosenNote}</strong> · ${getTempHtml(active?.streak || 0)}</p>
        ${active?.streak >= 3 ? '<p style="color:var(--danger)">🔥 Bonus Brûlant (+1 pt) !</p>' : ''}
        ${actionBlock}`;
      break;
    }
    case 'question': {
      const myTurnLabel = isMyTurn()
        ? '<p class="owner-play-panel" style="padding:10px;border-radius:8px;"><strong>🎤 C\'est votre tour – répondez à l\'oral !</strong></p>'
        : '';
      el.innerHTML = `
        <h3>Phase Question</h3>
        <h2>${gs.currentTheme?.theme}</h2>
        <div class="timer" id="owner-timer">⏱️ ${timeLeft}s</div>
        <p>Joueur : <strong style="color:var(--primary)">${active?.name}</strong></p>
        <p>Points : <strong>${gs.currentQuestion?.points || '—'} pts</strong></p>
        ${myTurnLabel}
        <div style="background:#2e2f47;padding:20px;border-radius:8px;margin:15px 0;">
          <p style="font-size:1.25rem;margin:0;font-style:italic;">${gs.currentQuestion?.q || ''}</p>
        </div>
        <button onclick="ownerAction('REVEAL_ANSWER')">Révéler la réponse</button>`;
      break;
    }
    case 'answer_revealed':
      el.innerHTML = `
        <h3>Validation</h3>
        <div style="background:#4a4e69;padding:15px;border-radius:8px;margin:15px 0;border-left:5px solid var(--primary);">
          Réponse : <strong style="color:var(--primary)">${gs.currentQuestion?.a || ''}</strong>
        </div>
        <p>Joueur : <strong>${active?.name}</strong> · ${gs.currentQuestion?.points} pts en jeu</p>
        <div class="btn-group">
          <button class="btn-erreur" onclick="resolveTurn(false)">Erroné ❌</button>
          <button class="btn-valide" onclick="resolveTurn(true)">Validé ✔️ (+${gs.currentQuestion?.points} pts)</button>
        </div>`;
      break;
    case 'scores':
      el.innerHTML = `
        <h1>Classement 🏆</h1>
        ${renderScoreboard()}
        <button onclick="ownerAction('NEXT_ROUND')" style="background:var(--success);color:white;margin-top:20px;">Manche Suivante 🔄</button>`;
      break;
    case 'auction_setup':
      el.innerHTML = `
        <div class="auction-box">
          <h1 style="color:var(--success)">🗣️ Les Enchères !</h1>
          <p style="color:#fcf6bd;background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;">
            📢 C'est à <strong>${gs.players[gs.auctionStarterIndex]?.name}</strong> d'ouvrir les enchères !
          </p>
          <p style="font-size:1.4rem;font-weight:bold;">Citez le plus de <span style="color:var(--primary)">${gs.auctionSubject}</span></p>
          <p style="color:#b5c2b7;">Sélectionnez le gagnant de l'enchère :</p>
          <div class="grid-dynamic">${gs.players.map((p, i) =>
            `<div class="btn-opponent" onclick="selectAuctionWinner(${i})"><strong>${p.name}</strong></div>`
          ).join('')}</div>
        </div>`;
      break;
    case 'auction_play':
      el.innerHTML = `
        <div class="auction-box">
          <h1 style="color:var(--success)">🗣️ Validation Enchère</h1>
          <h2 style="color:var(--primary)">${gs.players[gs.auctionWinnerIndex]?.name}</h2>
          <div class="timer" id="owner-timer">⏱️ ${timeLeft}s</div>
          <p>Sujet : <strong>${gs.auctionSubject}</strong></p>
          <div class="btn-group" style="justify-content:center;">
            <button class="btn-valide" onclick="resolveAuction(true)">A réussi ✔️</button>
            <button class="btn-erreur" onclick="resolveAuction(false)">A échoué ❌</button>
          </div>
        </div>`;
      break;
    case 'auction_result': {
      el.innerHTML = `
        <h1>Résultat Enchères</h1>
        ${renderAuctionResult()}
        <button onclick="ownerAction('END_AUCTION')" style="background:var(--success);color:white;margin-top:20px;">Continuer ➡️</button>`;
      break;
    }
    case 'duel_setup':
      el.innerHTML = `
        <div class="duel-box">
          <h1 style="color:var(--danger)">⚔️ L'Heure du Duel !</h1>
          <p><strong style="font-size:1.8rem;color:white">${gs.players[gs.duelChallengerIndex]?.name}</strong> choisit sa cible :</p>
          <div class="grid-dynamic">${gs.players.map((p, i) =>
            i !== gs.duelChallengerIndex
              ? `<div class="btn-opponent" onclick="selectDuelOpponent(${i})"><strong>${p.name}</strong><span>${p.score} pts</span></div>`
              : ''
          ).join('')}</div>
        </div>`;
      break;
    case 'duel_transition': {
      const c = gs.players[gs.duelChallengerIndex];
      const o = gs.players[gs.duelOpponentIndex];
      el.innerHTML = `
        <div class="duel-box">
          <h1 style="color:var(--danger)">⚔️ Face à Face</h1>
          <h2><span style="color:var(--primary)">${c?.name}</span> VS <span style="color:var(--primary)">${o?.name}</span></h2>
          <button class="ready-btn" onclick="ownerAction('READY_FOR_DUEL')">Nous sommes prêts 🔥</button>
        </div>`;
      break;
    }
    case 'duel_question': {
      const c = gs.players[gs.duelChallengerIndex];
      const o = gs.players[gs.duelOpponentIndex];
      el.innerHTML = `
        <div class="duel-box">
          <h3 style="color:var(--danger)">🔥 DUEL FLASH 🔥</h3>
          <h2>${c?.name} vs ${o?.name}</h2>
          <div style="background:rgba(0,0,0,0.3);padding:20px;border-radius:8px;margin:15px 0;">
            <p style="font-size:1.25rem;font-style:italic;">[${gs.duelTheme}] ${gs.duelQuestion?.q || ''}</p>
          </div>
          ${gs.duelAnswerRevealed ? `<div class="answer-box" style="display:block">Réponse : <strong style="color:var(--primary)">${gs.duelQuestion?.a}</strong></div>` : ''}
          ${!gs.duelAnswerRevealed ? `<button onclick="ownerAction('REVEAL_DUEL_ANSWER')">Révéler la réponse</button>` : `
            <p>Qui a répondu en premier ?</p>
            <div class="btn-group">
              <button class="btn-valide" onclick="resolveDuel('challenger')">${c?.name}</button>
              <button class="btn-valide" onclick="resolveDuel('opponent')">${o?.name}</button>
            </div>
            <button class="btn-erreur" onclick="resolveDuel('nobody')" style="margin-top:10px;background:#4a4e69;">Personne / Égalité</button>`}
        </div>`;
      break;
    }
    case 'game_over': {
      const winner = gs.winnerName || getSortedPlayers()[0]?.name;
      el.innerHTML = `
        <h1>🏆 VICTOIRE DE ${winner?.toUpperCase()} ! 🎉</h1>
        ${renderScoreboard()}
        <button onclick="ownerAction('RESET_GAME')" style="background:#4a4e69;color:white;margin-top:20px;">Recommencer</button>`;
      break;
    }
    default:
      el.innerHTML = `<p>Phase : ${gs.phase}</p>`;
  }
}

function renderNotesStatus() {
  return gameState.players.map(p => {
    const note = p.chosenNote !== null ? p.chosenNote : '?';
    return `<div class="note-status">${p.name}: <strong>${note}</strong></div>`;
  }).join('');
}

function renderAuctionResult() {
  const winnerIdx = gameState.auctionWinnerIndex;
  const success = gameState.auctionSuccess;
  const rows = gameState.players.map((p, idx) => {
    let diff = '0';
    if (success && idx === winnerIdx) diff = '+4';
    else if (!success && idx !== winnerIdx) diff = '+1';
    return `<tr><td>${p.name}</td><td>${p.score} pts</td><td style="color:var(--success)">${diff}</td></tr>`;
  }).join('');
  const title = success
    ? `${gameState.players[winnerIdx]?.name} a réussi l'enchère ! 🎉`
    : `${gameState.players[winnerIdx]?.name} a échoué ! ❌`;
  return `<h2 style="color:${success ? 'var(--success)' : 'var(--danger)'}">${title}</h2>
    <table><thead><tr><th>Joueur</th><th>Score</th><th>Gain</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAll() {
  displayHallOfFame();
  renderSidebar();
  renderPhaseBadge();
  if (gameState?.phase === 'lobby') renderLobby();
  else renderPhaseContent();
}

function triggerConfetti() {
  const duration = 4 * 1000;
  const end = Date.now() + duration;
  (function frame() {
    confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.8 } });
    confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.8 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  }());
}

function saveHallOfFame(name, score) {
  let record = JSON.parse(localStorage.getItem('ttmc_record')) || { name: 'Aucun', score: 0 };
  if (score > record.score) {
    record = { name, score };
    localStorage.setItem('ttmc_record', JSON.stringify(record));
  }
  displayHallOfFame();
}

function displayHallOfFame() {
  const el = document.getElementById('hof-display');
  if (!el) return;
  const record = JSON.parse(localStorage.getItem('ttmc_record')) || { name: 'Aucun', score: 0 };
  el.textContent = record.score > 0
    ? `🏆 Record Historique : ${record.name} (${record.score} pts)`
    : '🏆 Record Historique : Aucun';
}

window.onload = () => {
  connectWs();
  displayHallOfFame();
};
