let ws = null;

function connectWs(onOpen) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'GAME_CREATED') {
      sessionStorage.setItem('ttmc_ownerToken', msg.ownerToken);
      sessionStorage.setItem('ttmc_roomCode', msg.roomCode);
      sessionStorage.setItem('ttmc_ownerPlayerIndex', String(msg.playerIndex ?? 0));
      window.location.href = '/owner';
    } else if (msg.type === 'ERROR') {
      showError('create-error', msg.message);
      document.getElementById('btn-create').disabled = false;
    }
  };

  ws.onopen = () => {
    if (onOpen) onOpen();
  };

  ws.onclose = () => {
    setTimeout(() => connectWs(), 2000);
  };
}

function showError(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.style.display = 'block';
}

function createParty() {
  const ownerName = document.getElementById('create-owner-name').value.trim();
  const targetScore = parseInt(document.getElementById('create-target-score').value, 10) || 30;
  const btn = document.getElementById('btn-create');
  document.getElementById('create-error').style.display = 'none';

  if (!ownerName) {
    showError('create-error', 'Entrez votre prénom pour créer la partie.');
    return;
  }

  btn.disabled = true;

  const doCreate = () => {
    ws.send(JSON.stringify({ type: 'CREATE_GAME', targetScore, ownerName }));
  };

  if (ws && ws.readyState === WebSocket.OPEN) {
    doCreate();
  } else {
    connectWs(doCreate);
  }
}

function joinParty() {
  const roomCode = document.getElementById('join-room-code').value.trim().toUpperCase();
  const playerName = document.getElementById('join-player-name').value.trim();
  const errEl = document.getElementById('join-error');

  if (!roomCode || roomCode.length !== 4) {
    showError('join-error', 'Code invalide (4 lettres).');
    return;
  }
  if (!playerName) {
    showError('join-error', 'Entrez votre prénom.');
    return;
  }

  errEl.style.display = 'none';
  const params = new URLSearchParams({ code: roomCode, name: playerName });
  window.location.href = `/player?${params.toString()}`;
}

function displayHallOfFame() {
  const el = document.getElementById('hof-display');
  if (!el) return;
  const record = JSON.parse(localStorage.getItem('ttmc_record')) || { name: 'Aucun', score: 0 };
  el.textContent = record.score > 0
    ? `🏆 Record : ${record.name} (${record.score} pts)`
    : '🏆 Record : Aucun';
}

document.getElementById('join-room-code')?.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
});

window.onload = () => {
  connectWs();
  displayHallOfFame();
};
