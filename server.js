require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const vm = require('vm');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const game = require('./gameLogic');

const PORT = process.env.PORT || 3000;
console.log(`PORT: ${PORT}`);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Load question database from public/js/database.js
function loadDatabase() {
  const dbPath = path.join(__dirname, 'public', 'js', 'database.js');
  const code = fs.readFileSync(dbPath, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${code}\nthis.DATA = DATA;`, sandbox);
  return sandbox.DATA;
}

const database = loadDatabase();
console.log(`Base chargée : ${database.length} thèmes`);

const rooms = new Map();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/owner', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'owner.html'));
});

app.get('/player', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

app.get('/display', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

function send(ws, type, payload = {}) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcastRoom(room, type, payload = {}) {
  room.clients.forEach((_client, ws) => {
    send(ws, type, payload);
  });
}

function broadcastGameState(room) {
  broadcastRoom(room, 'GAME_STATE', { gameState: game.getPublicGameState(room.gameState) });
  room.gameState.lastSound = null;
}

function stopRoomTimer(room) {
  if (room.timerInterval) {
    clearInterval(room.timerInterval);
    room.timerInterval = null;
  }
}

function startRoomTimer(room) {
  stopRoomTimer(room);
  const { gameState } = room;
  if (!gameState.timerStartedAt || !gameState.timerDuration) return;

  room.timerInterval = setInterval(() => {
    const timeLeft = game.getTimeLeft(gameState);
    broadcastRoom(room, 'TIMER_TICK', { timeLeft });

    if (timeLeft <= 0) {
      const changed = game.handleTimerExpired(gameState, database);
      if (changed) {
        broadcastGameState(room);
      }
      stopRoomTimer(room);
    }
  }, 1000);

  broadcastRoom(room, 'TIMER_TICK', { timeLeft: game.getTimeLeft(gameState) });
}

function getRoomByWs(ws) {
  for (const room of rooms.values()) {
    if (room.clients.has(ws)) return room;
  }
  return null;
}

function verifyOwner(room, token) {
  return room.ownerToken === token;
}

function isPlayerClient(client) {
  return client && client.playerIndex >= 0 && (client.role === 'player' || client.role === 'owner');
}

function findPlayerIndexByName(room, name) {
  return room.gameState.players.findIndex(
    p => p.name.toLowerCase() === name.trim().toLowerCase()
  );
}

function createRoom(ws, targetScore, ownerName) {
  const name = ownerName?.trim();
  if (!name) {
    send(ws, 'ERROR', { message: 'Nom du joueur requis.' });
    return;
  }

  let roomCode;
  do {
    roomCode = game.generateRoomCode();
  } while (rooms.has(roomCode));

  const gameState = game.createInitialGameState(targetScore);
  gameState.roomCode = roomCode;
  gameState.ownerName = name;
  gameState.ownerPlayerIndex = 0;
  gameState.players.push({
    id: '0',
    name,
    score: 0,
    streak: 0,
    chosenNote: null,
    isReady: false
  });

  const room = {
    gameState,
    ownerToken: game.generateOwnerToken(),
    ownerPlayerIndex: 0,
    clients: new Map(),
    ownerWs: ws,
    timerInterval: null
  };

  rooms.set(roomCode, room);
  room.clients.set(ws, { role: 'owner', playerIndex: 0 });

  send(ws, 'GAME_CREATED', {
    roomCode,
    ownerToken: room.ownerToken,
    playerIndex: 0,
    gameState: game.getPublicGameState(gameState)
  });
}

function joinAsPlayer(ws, roomCode, playerName) {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) {
    send(ws, 'ERROR', { message: 'Partie introuvable.' });
    return;
  }

  const name = playerName.trim();
  if (!name) {
    send(ws, 'ERROR', { message: 'Nom de joueur requis.' });
    return;
  }

  if (room.gameState.phase !== 'lobby') {
    const existingIndex = findPlayerIndexByName(room, name);
    if (existingIndex === -1) {
      send(ws, 'ERROR', { message: 'La partie a déjà commencé.' });
      return;
    }
    room.clients.set(ws, { role: 'player', playerIndex: existingIndex });
    room.gameState.players[existingIndex].id = String(existingIndex);
    room.gameState.ownerDisconnected = false;
    send(ws, 'JOINED', { playerIndex: existingIndex });
    broadcastGameState(room);
    return;
  }

  if (room.gameState.players.length >= 15) {
    send(ws, 'ERROR', { message: 'Partie complète (15 joueurs max).' });
    return;
  }

  const dupIndex = findPlayerIndexByName(room, name);
  if (dupIndex !== -1) {
    room.clients.set(ws, { role: 'player', playerIndex: dupIndex });
    room.gameState.players[dupIndex].id = String(dupIndex);
    send(ws, 'JOINED', { playerIndex: dupIndex });
    broadcastGameState(room);
    return;
  }

  const playerIndex = room.gameState.players.length;
  room.gameState.players.push({
    id: String(playerIndex),
    name,
    score: 0,
    streak: 0,
    chosenNote: null,
    isReady: false
  });

  room.clients.set(ws, { role: 'player', playerIndex });
  send(ws, 'JOINED', { playerIndex });
  broadcastRoom(room, 'PLAYER_JOINED', { playerName: name });
  broadcastGameState(room);
}

function watchGame(ws, roomCode) {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) {
    send(ws, 'ERROR', { message: 'Partie introuvable.' });
    return;
  }
  room.clients.set(ws, { role: 'display', playerIndex: -1 });
  send(ws, 'WATCHING', {});
  broadcastGameState(room);
}

function handleOwnerAction(room, action) {
  const { gameState } = room;

  switch (action) {
    case 'READY_TO_QUESTION':
      game.readyForQuestion(gameState, database);
      startRoomTimer(room);
      break;
    case 'REVEAL_ANSWER':
      game.revealAnswer(gameState);
      stopRoomTimer(room);
      break;
    case 'NEXT_ROUND':
      if (gameState.phase === 'scores') {
        game.advanceRound(gameState, database);
      }
      break;
    case 'READY_FOR_DUEL':
      game.readyForDuel(gameState, database);
      break;
    case 'REVEAL_DUEL_ANSWER':
      game.revealDuelAnswer(gameState);
      break;
    case 'END_AUCTION':
      game.endAuction(gameState, database);
      break;
    case 'RESET_GAME':
      game.resetToLobby(gameState);
      gameState.roomCode = room.gameState.roomCode;
      stopRoomTimer(room);
      break;
    default:
      throw new Error('Action owner inconnue.');
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      send(ws, 'ERROR', { message: 'Message JSON invalide.' });
      return;
    }

    try {
      switch (msg.type) {
        case 'CREATE_GAME': {
          createRoom(ws, parseInt(msg.targetScore, 10) || 30, msg.ownerName);
          break;
        }

        case 'OWNER_SYNC': {
          const room = rooms.get(msg.roomCode?.toUpperCase());
          if (!room || !verifyOwner(room, msg.ownerToken)) {
            send(ws, 'ERROR', { message: 'Session owner invalide ou partie introuvable.' });
            return;
          }
          const playerIndex = room.ownerPlayerIndex ?? 0;
          room.clients.set(ws, { role: 'owner', playerIndex });
          room.ownerWs = ws;
          room.gameState.ownerDisconnected = false;
          send(ws, 'OWNER_SYNCED', {
            playerIndex,
            gameState: game.getPublicGameState(room.gameState)
          });
          break;
        }

        case 'JOIN_GAME': {
          joinAsPlayer(ws, msg.roomCode, msg.playerName);
          break;
        }

        case 'WATCH_GAME': {
          watchGame(ws, msg.roomCode);
          break;
        }

        case 'START_GAME': {
          const room = getRoomByWs(ws);
          if (!room || !verifyOwner(room, msg.ownerToken)) {
            send(ws, 'ERROR', { message: 'Non autorisé.' });
            return;
          }
          if (msg.targetScore) {
            room.gameState.targetScore = parseInt(msg.targetScore, 10) || room.gameState.targetScore;
          }
          game.startGame(room.gameState, database);
          broadcastGameState(room);
          break;
        }

        case 'CHOOSE_NOTE': {
          const room = getRoomByWs(ws);
          if (!room) {
            send(ws, 'ERROR', { message: 'Non connecté à une partie.' });
            return;
          }
          const client = room.clients.get(ws);
          if (!isPlayerClient(client)) {
            send(ws, 'ERROR', { message: 'Non autorisé.' });
            return;
          }
          game.chooseNote(room.gameState, client.playerIndex, parseInt(msg.note, 10));
          // chosenNote mis à jour immédiatement dans gameState → visible par tous au broadcast
          broadcastGameState(room);
          break;
        }

        case 'PLAYER_READY': {
          const room = getRoomByWs(ws);
          if (!room) {
            send(ws, 'ERROR', { message: 'Non connecté.' });
            return;
          }
          const client = room.clients.get(ws);
          if (!isPlayerClient(client)) {
            send(ws, 'ERROR', { message: 'Non autorisé.' });
            return;
          }
          const activeIndex = game.getActivePlayerIndex(room.gameState);
          if (client.playerIndex !== activeIndex) {
            send(ws, 'ERROR', { message: "Ce n'est pas votre tour." });
            return;
          }
          game.readyForQuestion(room.gameState, database);
          startRoomTimer(room);
          broadcastGameState(room);
          break;
        }

        case 'OWNER_ACTION': {
          const room = getRoomByWs(ws);
          if (!room || !verifyOwner(room, msg.ownerToken)) {
            send(ws, 'ERROR', { message: 'Non autorisé.' });
            return;
          }
          handleOwnerAction(room, msg.action);
          broadcastGameState(room);
          break;
        }

        case 'RESOLVE_TURN': {
          const room = getRoomByWs(ws);
          if (!room || !verifyOwner(room, msg.ownerToken)) {
            send(ws, 'ERROR', { message: 'Non autorisé.' });
            return;
          }
          game.validateTurn(room.gameState, !!msg.isCorrect);
          stopRoomTimer(room);
          broadcastGameState(room);
          break;
        }

        case 'SELECT_AUCTION_WINNER': {
          const room = getRoomByWs(ws);
          if (!room || !verifyOwner(room, msg.ownerToken)) {
            send(ws, 'ERROR', { message: 'Non autorisé.' });
            return;
          }
          game.selectAuctionWinner(room.gameState, parseInt(msg.playerIndex, 10));
          startRoomTimer(room);
          broadcastGameState(room);
          break;
        }

        case 'RESOLVE_AUCTION': {
          const room = getRoomByWs(ws);
          if (!room || !verifyOwner(room, msg.ownerToken)) {
            send(ws, 'ERROR', { message: 'Non autorisé.' });
            return;
          }
          game.resolveAuction(room.gameState, !!msg.success);
          stopRoomTimer(room);
          broadcastGameState(room);
          break;
        }

        case 'SELECT_DUEL_OPPONENT': {
          const room = getRoomByWs(ws);
          if (!room || !verifyOwner(room, msg.ownerToken)) {
            send(ws, 'ERROR', { message: 'Non autorisé.' });
            return;
          }
          game.selectDuelOpponent(room.gameState, parseInt(msg.playerIndex, 10));
          broadcastGameState(room);
          break;
        }

        case 'RESOLVE_DUEL': {
          const room = getRoomByWs(ws);
          if (!room || !verifyOwner(room, msg.ownerToken)) {
            send(ws, 'ERROR', { message: 'Non autorisé.' });
            return;
          }
          game.resolveDuel(room.gameState, database, msg.winner);
          broadcastGameState(room);
          break;
        }

        default:
          send(ws, 'ERROR', { message: `Type de message inconnu : ${msg.type}` });
      }
    } catch (err) {
      send(ws, 'ERROR', { message: err.message });
    }
  });

  ws.on('close', () => {
    const room = getRoomByWs(ws);
    if (!room) return;

    const client = room.clients.get(ws);
    room.clients.delete(ws);

    if (client && client.role === 'owner') {
      room.ownerWs = null;
      room.gameState.ownerDisconnected = true;
      broadcastGameState(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`TTMC serveur démarré sur http://localhost:${PORT}`);
  console.log(`  Accueil → http://localhost:${PORT}/`);
  console.log(`  Owner   → http://localhost:${PORT}/owner`);
  console.log(`  Player  → http://localhost:${PORT}/player`);
  console.log(`  Display → http://localhost:${PORT}/display`);
});
