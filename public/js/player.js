let ws = null;
let gameState = null;
let playerIndex = -1;
let playerName = '';
let roomCode = '';
let timeLeft = 0;
let prevPhase = null;

function connectWs(onOpen) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  ws.onopen = () => {
    if (onOpen) onOpen();
  };

  ws.onclose = () => {
    setTimeout(() => connectWs(onOpen), 2000);
  };
}

function joinGame() {
  roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
  playerName = document.getElementById('player-name-input').value.trim();
  const errEl = document.getElementById('join-error');

  if (!roomCode || roomCode.length !== 4) {
    errEl.textContent = 'Code de partie invalide (4 lettres).';
    errEl.style.display = 'block';
    return;
  }
  if (!playerName) {
    errEl.textContent = 'Entrez votre prénom.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  const doJoin = () => {
    ws.send(JSON.stringify({ type: 'JOIN_GAME', roomCode, playerName }));
  };

  if (ws && ws.readyState === WebSocket.OPEN) {
    doJoin();
  } else {
    connectWs(doJoin);
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'JOINED':
      playerIndex = msg.playerIndex;
      showScreen('screen-game');
      break;
    case 'GAME_STATE':
      handleGameState(msg.gameState);
      break;
    case 'TIMER_TICK':
      timeLeft = msg.timeLeft;
      updateTimerInDOM();
      break;
    case 'ERROR':
      document.getElementById('join-error').textContent = msg.message;
      document.getElementById('join-error').style.display = 'block';
      break;
  }
}

function handleGameState(state) {
  const oldPhase = gameState?.phase;
  gameState = state;

  if (state.lastSound) playSound(state.lastSound);
  if (state.phase === 'game_over' && oldPhase !== 'game_over') {
    triggerConfetti();
    saveHallOfFame(state.winnerName, getMyScore(state));
  }

  if (state.phase !== 'lobby' || playerIndex >= 0) {
    showScreen('screen-game');
  }
  renderPlayerContent();
  prevPhase = state.phase;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function isMyTurn() {
  if (!gameState || playerIndex < 0) return false;
  return gameState.roundOrder[gameState.currentTurnIndex] === playerIndex;
}

function getActivePlayer() {
  if (!gameState?.roundOrder?.length) return null;
  return gameState.players[gameState.roundOrder[gameState.currentTurnIndex]];
}

function getTakenNotes() {
  return gameState.players.map(p => p.chosenNote).filter(n => n !== null);
}

function formatBidNoteForPlayer(p, i, gs) {
  if (p.chosenNote === null) return '⏳';
  if (gs.isHiddenRound && i !== playerIndex) return '🎭';
  return String(p.chosenNote);
}

function renderBidStatusList(gs) {
  const activePlayerIdx = gs.roundOrder[gs.currentTurnIndex];
  return `
    <div class="player-bid-status">
      <p class="player-bid-status-title">Notes choisies</p>
      ${gs.players.map((p, i) => {
        const isActive = i === activePlayerIdx;
        const note = formatBidNoteForPlayer(p, i, gs);
        const done = p.chosenNote !== null;
        return `<div class="player-bid-row${isActive ? ' player-bid-row-active' : ''}${done ? ' player-bid-row-done' : ''}">
          <span class="player-bid-name">${p.name}${isActive ? ' 🎯' : ''}</span>
          <span class="player-bid-note${done ? ' player-bid-note-set' : ''}">${note}</span>
        </div>`;
      }).join('')}
    </div>`;
}

function chooseNote(note) {
  ws.send(JSON.stringify({ type: 'CHOOSE_NOTE', note }));
}

function playerReady() {
  ws.send(JSON.stringify({ type: 'PLAYER_READY' }));
}

function getTempHtml(streak) {
  if (streak === 0) return '<span class="temp-froid">❄️ Froid</span>';
  if (streak === 1) return '<span class="temp-tiede">🌤️ Tiède</span>';
  if (streak === 2) return '<span class="temp-chaud">🔥 Chaud</span>';
  return '<span class="temp-brulant">🌋 Brûlant (+1 pt)</span>';
}

function getSortedPlayers() {
  return [...gameState.players].sort((a, b) => b.score - a.score);
}

function getMyScore(state) {
  const me = state.players[playerIndex];
  return me ? me.score : 0;
}

function updateTimerInDOM() {
  const el = document.getElementById('player-timer');
  if (!el) return;
  el.textContent = `⏱️ ${timeLeft}s`;
  el.style.color = timeLeft <= 5 ? 'var(--danger)' : 'var(--primary)';
  if (timeLeft <= 5 && timeLeft > 0) playSound('tick');
}

function getHostName(gs) {
  return gs?.ownerName || gs?.players?.[gs?.ownerPlayerIndex ?? 0]?.name || "l'animateur";
}

function renderPlayerContent() {
  const el = document.getElementById('player-content');
  if (!gameState) return;

  const me = gameState.players[playerIndex];
  const active = getActivePlayer();
  const gs = gameState;
  const host = getHostName(gs);

  switch (gs.phase) {
    case 'lobby':
      el.innerHTML = `
        <h2>Bienvenue, <span style="color:var(--primary)">${me?.name || playerName}</span> !</h2>
        <p style="color:#b5c2b7;">En attente du lancement par ${host}... 👋</p>
        <div class="player-list">${gs.players.map((p, i) => {
          const tag = p.name === gs.ownerName ? ' <span style="color:var(--primary)">(animateur)</span>' : '';
          return `${i + 1}. ${p.name}${tag}`;
        }).join('<br>')}</div>`;
      break;

    case 'bid': {
      const taken = getTakenNotes();
      const theme = gs.isHiddenRound ? '??? Thème Mystère ???' : (gs.currentTheme?.theme || '');
      const statusList = renderBidStatusList(gs);

      if (isMyTurn()) {
        const total = gs.players.length;
        let buttons = '';
        for (let i = 1; i <= total; i++) {
          const disabled = taken.includes(i) ? 'disabled' : '';
          buttons += `<button class="btn-note" ${disabled} onclick="chooseNote(${i})">${i}</button>`;
        }
        el.innerHTML = `
          <h3>Choisis ta note !</h3>
          <h2>${theme}</h2>
          ${gs.isHiddenRound ? '<p style="color:var(--danger);font-size:0.9rem;">⚠️ Thème révélé après le choix !</p>' : ''}
          <p>${getTempHtml(me.streak)}</p>
          <div class="grid-dynamic">${buttons}</div>
          ${statusList}`;
      } else {
        el.innerHTML = `
          <h3>Choix de note</h3>
          <h2>${theme}</h2>
          <p style="font-size:1.3rem;">⏳ <strong style="color:var(--primary)">${active?.name}</strong> choisit sa note...</p>
          ${statusList}`;
      }
      break;
    }

    case 'transition':
      if (isMyTurn()) {
        el.innerHTML = `
          <h3>À ton tour !</h3>
          <h2 style="font-size:2rem;color:var(--primary)">${me.name}</h2>
          <p>Thème : <strong>${gs.currentTheme?.theme}</strong></p>
          <p>Note : <strong>${me.chosenNote}</strong></p>
          <p>${getTempHtml(me.streak)}</p>
          ${me.streak >= 3 ? '<p style="color:var(--danger)">🔥 Bonus Brûlant (+1 pt) !</p>' : ''}
          <button class="ready-btn" onclick="playerReady()">Je suis prêt(e) ! 🚀</button>`;
      } else {
        el.innerHTML = `
          <h3>Transition</h3>
          <p style="font-size:1.2rem;"><strong style="color:var(--primary)">${active?.name}</strong> se prépare...</p>
          <p>Thème : ${gs.currentTheme?.theme}</p>`;
      }
      break;

    case 'question':
      if (isMyTurn()) {
        el.innerHTML = `
          <h3>C'est ton tour ! 🧠</h3>
          <h2>${gs.currentTheme?.theme}</h2>
          <div class="timer" id="player-timer">⏱️ ${timeLeft}s</div>
          <p>Points en jeu : <strong style="color:var(--primary)">${gs.currentQuestion?.points} pts</strong></p>
          <div style="background:#2e2f47;padding:20px;border-radius:8px;margin:15px 0;">
            <p style="font-size:1.25rem;margin:0;font-style:italic;line-height:1.5;">${gs.currentQuestion?.q || ''}</p>
          </div>
          <p style="color:#b5c2b7;font-size:0.9rem;">Réponds à l'oral – ${host} valide</p>`;
      } else {
        el.innerHTML = `
          <h3>Phase Question</h3>
          <div class="timer" id="player-timer">⏱️ ${timeLeft}s</div>
          <p style="font-size:1.3rem;">🎙️ <strong style="color:var(--primary)">${active?.name}</strong> répond à l'oral — écoutez !</p>
          <p>Thème : ${gs.currentTheme?.theme}</p>`;
      }
      break;

    case 'answer_revealed':
      el.innerHTML = `
        <h3>Réponse révélée</h3>
        <div class="answer-box" style="display:block">
          Réponse : <strong style="color:var(--primary)">${gs.currentQuestion?.a || ''}</strong>
        </div>
        <p style="color:#b5c2b7;">${host} valide le résultat...</p>
        <p>Joueur : <strong>${active?.name}</strong></p>`;
      break;

    case 'auction_setup':
      el.innerHTML = `
        <div class="auction-box">
          <h2 style="color:var(--success)">🗣️ Enchères !</h2>
          <p>📢 <strong>${gs.players[gs.auctionStarterIndex]?.name}</strong> ouvre les enchères</p>
          <p style="font-size:1.3rem;font-weight:bold;">Citez le plus de <span style="color:var(--primary)">${gs.auctionSubject}</span></p>
          <p style="color:#b5c2b7;">Débattez – ${host} choisit le gagnant</p>
        </div>`;
      break;

    case 'auction_play':
      el.innerHTML = `
        <div class="auction-box">
          <h2 style="color:var(--success)">🗣️ Enchère en cours</h2>
          <h2 style="color:var(--primary)">${gs.players[gs.auctionWinnerIndex]?.name}</h2>
          <div class="timer" id="player-timer">⏱️ ${timeLeft}s</div>
          <p>Sujet : <strong>${gs.auctionSubject}</strong></p>
        </div>`;
      break;

    case 'auction_result':
    case 'scores': {
      const myRank = getSortedPlayers().findIndex(p => p.name === me?.name) + 1;
      el.innerHTML = `
        <h2>Classement 🏆</h2>
        <p>Ta position : <strong style="color:var(--primary)">#${myRank}</strong></p>
        ${renderScoreboard()}`;
      break;
    }

    case 'duel_setup':
    case 'duel_transition':
    case 'duel_question': {
      const c = gs.players[gs.duelChallengerIndex];
      const o = gs.players[gs.duelOpponentIndex];
      el.innerHTML = `
        <div class="duel-box">
          <h2 style="color:var(--danger)">⚔️ Duel !</h2>
          ${o ? `<h2><span style="color:var(--primary)">${c?.name}</span> VS <span style="color:var(--primary)">${o?.name}</span></h2>` : `<p><strong>${c?.name}</strong> choisit sa cible...</p>`}
          ${gs.phase === 'duel_question' ? `
            <div style="background:rgba(0,0,0,0.3);padding:15px;border-radius:8px;margin:15px 0;">
              <p style="font-style:italic;">[${gs.duelTheme}] ${gs.duelQuestion?.q || ''}</p>
            </div>
            ${gs.duelAnswerRevealed ? `<div class="answer-box" style="display:block">Réponse : <strong style="color:var(--primary)">${gs.duelQuestion?.a}</strong></div>` : '<p>Soyez vifs !</p>'}
          ` : ''}
        </div>`;
      break;
    }

    case 'game_over': {
      const sorted = getSortedPlayers();
      const winner = gs.winnerName || sorted[0]?.name;
      el.innerHTML = `
        <h1>🏆 ${winner} gagne !</h1>
        ${renderScoreboard(true)}`;
      break;
    }

    default:
      el.innerHTML = `<p>Phase : ${gs.phase}</p>`;
  }
}

function renderScoreboard(highlightMe = true) {
  const sorted = getSortedPlayers();
  const me = gameState.players[playerIndex];
  let rows = sorted.map((p, i) => {
    const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
    const pct = Math.min((p.score / gameState.targetScore) * 100, 100);
    const highlight = highlightMe && p.name === me?.name ? ' style="background:rgba(242,166,90,0.15)"' : '';
    return `<tr${highlight}>
      <td>${medal}${i + 1}</td>
      <td><strong>${p.name}</strong></td>
      <td>${getTempHtml(p.streak)}</td>
      <td><strong>${p.score}/${gameState.targetScore}</strong>
        <div class="progress-container"><div class="progress-bar" style="width:${pct}%"></div></div>
      </td>
    </tr>`;
  }).join('');
  return `<table><thead><tr><th>#</th><th>Joueur</th><th>Temp.</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>`;
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
  if (!name) return;
  let record = JSON.parse(localStorage.getItem('ttmc_record')) || { name: 'Aucun', score: 0 };
  if (score > record.score) {
    localStorage.setItem('ttmc_record', JSON.stringify({ name, score }));
  }
}

document.getElementById('room-code-input')?.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
});

window.onload = () => {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const name = params.get('name');
  if (code) {
    document.getElementById('room-code-input').value = code.toUpperCase().replace(/[^A-Z]/g, '');
  }
  if (name) {
    document.getElementById('player-name-input').value = name;
  }
  connectWs(() => {
    if (code && name && code.length === 4) joinGame();
  });
};
