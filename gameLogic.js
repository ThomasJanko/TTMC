const crypto = require('crypto');

const ROOM_CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXYZ';

const AUCTION_SUBJECTS = [
  'super héros', 'personnages Disney', 'princesses Disney', 'méchants Disney',
  'Pokémons', 'personnages de Harry Potter', 'personnages de Star Wars',
  'personnages Marvel', 'personnages de mangas', 'films célèbres', 'films d\'animation',
  'séries télévisées', 'dessins animés', 'jeux vidéo célèbres', 'consoles de jeux vidéo',
  'acteurs français', 'acteurs américains', 'chanteurs français', 'chanteuses françaises',
  'groupes de musique', 'rappeurs français', 'youtubeurs francophones',
  'clubs de football', 'équipes nationales de football', 'joueurs de football',
  'joueurs NBA', 'pilotes de Formule 1', 'sports olympiques',
  'capitales européennes', 'capitales du monde', 'pays d\'Europe', 'pays d\'Asie',
  'pays d\'Afrique', 'villes françaises', 'régions françaises', 'monuments célèbres',
  'îles célèbres', 'marques de voitures', 'marques de vêtements', 'marques de sport',
  'marques de luxe', 'marques de smartphones', 'réseaux sociaux', 'sites internet célèbres',
  'animaux de la savane', 'animaux marins', 'animaux de la ferme', 'races de chiens',
  'félins', 'oiseaux', 'fruits', 'légumes', 'fromages', 'pâtisseries',
  'plats italiens', 'plats asiatiques', 'chaînes de restauration',
  'métiers', 'métiers du médical', 'métiers du bâtiment', 'métiers de l\'informatique',
  'instruments de musique', 'objets de cuisine', 'meubles',
  'rois de France', 'empereurs romains', 'pharaons', 'personnages historiques',
  'inventeurs célèbres', 'scientifiques célèbres',
  'parcs d\'attractions', 'compagnies aériennes', 'constructeurs automobiles',
  'musées célèbres', 'châteaux célèbres'
];

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function generateOwnerToken() {
  return crypto.randomBytes(16).toString('hex');
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createInitialGameState(targetScore = 30) {
  return {
    roomCode: '',
    phase: 'lobby',
    players: [],
    roundOrder: [],
    currentTurnIndex: 0,
    currentTheme: null,
    usedThemes: [],
    targetScore,
    roundCount: 0,
    isAuctionRound: false,
    isHiddenRound: false,
    auctionSubject: null,
    auctionStarterIndex: null,
    auctionWinnerIndex: null,
    duelChallengerIndex: null,
    duelOpponentIndex: null,
    duelQuestion: null,
    duelTheme: null,
    currentQuestion: null,
    answerRevealed: false,
    duelAnswerRevealed: false,
    timerStartedAt: null,
    timerDuration: 0,
    gameOver: false,
    winnerName: null,
    ownerName: null,
    ownerPlayerIndex: 0,
    ownerDisconnected: false,
    lastSound: null,
    auctionSuccess: null
  };
}

function getActivePlayerIndex(state) {
  if (!state.roundOrder.length) return null;
  return state.roundOrder[state.currentTurnIndex];
}

function getTakenNotes(state) {
  return state.players.map(p => p.chosenNote).filter(n => n !== null);
}

function getQuestionForNote(theme, note) {
  let qData = theme.questions[String(note)];
  if (!qData) {
    const maxDispo = Math.max(...Object.keys(theme.questions).map(Number));
    qData = theme.questions[String(maxDispo)];
  }
  return qData;
}

function computePoints(player) {
  const bonus = player.streak >= 3 ? 1 : 0;
  return player.chosenNote + bonus;
}

function clearTimer(state) {
  state.timerStartedAt = null;
  state.timerDuration = 0;
}

function setTimer(state, duration) {
  state.timerStartedAt = Date.now();
  state.timerDuration = duration;
}

function startGame(state, database) {
  if (state.players.length < 2) {
    throw new Error('Il faut au moins 2 joueurs pour lancer la partie.');
  }
  state.gameOver = false;
  state.roundCount = 0;
  state.isAuctionRound = false;
  state.usedThemes = [];
  state.players.forEach(p => {
    p.score = 0;
    p.streak = 0;
    p.chosenNote = null;
    p.isReady = false;
  });
  advanceRound(state, database);
}

function advanceRound(state, database) {
  if (state.gameOver) {
    state.phase = state.gameOver ? 'game_over' : 'scores';
    return;
  }

  clearTimer(state);
  state.answerRevealed = false;
  state.duelAnswerRevealed = false;
  state.currentQuestion = null;
  state.lastSound = null;

  if (!state.isAuctionRound && state.roundCount > 0) {
    state.isAuctionRound = true;
    setupAuction(state);
  } else {
    state.isAuctionRound = false;
    state.roundCount++;
    if (state.roundCount > 1 && (state.roundCount - 1) % 3 === 0 && state.players.length >= 2) {
      setupDuel(state);
    } else {
      startRound(state, database);
    }
  }
}

function startRound(state, database) {
  if (!database || !database.length) {
    throw new Error('Base de questions non chargée.');
  }

  let availableThemes = database.filter(t => !state.usedThemes.includes(t.theme));
  if (availableThemes.length === 0) {
    state.usedThemes = [];
    availableThemes = database;
  }
  const theme = availableThemes[Math.floor(Math.random() * availableThemes.length)];
  state.currentTheme = { theme: theme.theme, questions: theme.questions };
  state.usedThemes.push(theme.theme);

  state.isHiddenRound = state.roundCount > 1 && Math.random() < 0.25;

  let playersWithScore = state.players.map((p, index) => ({ index, score: p.score }));
  playersWithScore = shuffleArray(playersWithScore);
  playersWithScore.sort((a, b) => a.score - b.score);
  state.roundOrder = playersWithScore.map(item => item.index);

  state.players.forEach(p => {
    p.chosenNote = null;
    p.isReady = false;
  });

  state.currentTurnIndex = 0;
  state.phase = 'bid';
}

function chooseNote(state, playerIndex, note) {
  if (state.phase !== 'bid') throw new Error('Pas en phase de choix de note.');
  const activeIndex = getActivePlayerIndex(state);
  if (playerIndex !== activeIndex) throw new Error("Ce n'est pas votre tour.");
  if (note < 1 || note > state.players.length) throw new Error('Note invalide.');
  if (getTakenNotes(state).includes(note)) throw new Error('Note déjà prise.');

  state.players[playerIndex].chosenNote = note;
  state.currentTurnIndex++;

  if (state.currentTurnIndex < state.players.length) {
    // stay in bid
  } else {
    state.currentTurnIndex = 0;
    state.phase = 'transition';
  }
}

function readyForQuestion(state, database) {
  if (state.phase !== 'transition') throw new Error('Pas en phase de transition.');
  const activeIndex = getActivePlayerIndex(state);
  const player = state.players[activeIndex];
  const note = player.chosenNote;

  let qData = getQuestionForNote(state.currentTheme, note);
  state.currentQuestion = {
    q: qData.q,
    a: qData.a,
    theme: state.currentTheme.theme,
    note,
    points: computePoints(player)
  };
  state.answerRevealed = false;
  state.phase = 'question';
  setTimer(state, 15 + note * 3);
}

function revealAnswer(state) {
  if (state.phase !== 'question') throw new Error('Pas en phase question.');
  clearTimer(state);
  state.answerRevealed = true;
  state.phase = 'answer_revealed';
}

function validateTurn(state, isCorrect) {
  if (state.phase !== 'answer_revealed') throw new Error('Réponse non révélée.');
  const activeIndex = getActivePlayerIndex(state);
  const player = state.players[activeIndex];
  const points = computePoints(player);

  if (isCorrect) {
    player.score += points;
    player.streak++;
    state.lastSound = 'success';
  } else {
    player.streak = 0;
    state.lastSound = 'error';
  }

  if (player.score >= state.targetScore) {
    state.gameOver = true;
    state.winnerName = player.name;
  }

  state.currentTurnIndex++;

  if (state.gameOver) {
    state.phase = 'game_over';
    clearTimer(state);
    return;
  }

  if (state.currentTurnIndex < state.players.length) {
    state.phase = 'transition';
    state.answerRevealed = false;
    state.currentQuestion = null;
  } else {
    state.phase = 'scores';
    clearTimer(state);
  }
}

function setupAuction(state) {
  state.auctionSubject = AUCTION_SUBJECTS[Math.floor(Math.random() * AUCTION_SUBJECTS.length)];
  state.auctionStarterIndex = Math.floor(Math.random() * state.players.length);
  state.auctionWinnerIndex = null;
  state.phase = 'auction_setup';
}

function selectAuctionWinner(state, playerIndex) {
  if (state.phase !== 'auction_setup') throw new Error('Pas en phase enchères.');
  if (playerIndex < 0 || playerIndex >= state.players.length) throw new Error('Joueur invalide.');
  state.auctionWinnerIndex = playerIndex;
  state.phase = 'auction_play';
  setTimer(state, 45);
}

function resolveAuction(state, success) {
  if (state.phase !== 'auction_play') throw new Error('Pas en phase enchère active.');
  clearTimer(state);

  if (success) {
    state.players[state.auctionWinnerIndex].score += 4;
    state.lastSound = 'success';
  } else {
    state.players.forEach((p, idx) => {
      if (idx !== state.auctionWinnerIndex) p.score += 1;
    });
    state.lastSound = 'error';
  }

  if (state.players.some(p => p.score >= state.targetScore)) {
    state.gameOver = true;
    const winner = [...state.players].sort((a, b) => b.score - a.score)[0];
    state.winnerName = winner.name;
  }

  state.phase = 'auction_result';
  state.auctionSuccess = success;
}

function endAuction(state, database) {
  if (state.phase !== 'auction_result') throw new Error('Pas en phase résultat enchère.');
  if (state.gameOver) {
    state.phase = 'game_over';
    return;
  }
  advanceRound(state, database);
}

function setupDuel(state) {
  state.duelChallengerIndex = Math.floor(Math.random() * state.players.length);
  state.duelOpponentIndex = null;
  state.duelQuestion = null;
  state.duelTheme = null;
  state.duelAnswerRevealed = false;
  state.phase = 'duel_setup';
}

function selectDuelOpponent(state, opponentIndex) {
  if (state.phase !== 'duel_setup') throw new Error('Pas en phase duel setup.');
  if (opponentIndex === state.duelChallengerIndex) throw new Error('Impossible de se défier soi-même.');
  state.duelOpponentIndex = opponentIndex;
  state.phase = 'duel_transition';
}

function readyForDuel(state, database) {
  if (state.phase !== 'duel_transition') throw new Error('Pas en phase transition duel.');
  const randTheme = database[Math.floor(Math.random() * database.length)];
  const qData = randTheme.questions['5'] || randTheme.questions['1'];
  state.duelTheme = randTheme.theme;
  state.duelQuestion = { q: qData.q, a: qData.a };
  state.duelAnswerRevealed = false;
  state.phase = 'duel_question';
}

function revealDuelAnswer(state) {
  if (state.phase !== 'duel_question') throw new Error('Pas en phase duel question.');
  state.duelAnswerRevealed = true;
}

function resolveDuel(state, database, winner) {
  if (state.phase !== 'duel_question') throw new Error('Pas en phase duel question.');

  if (winner === 'challenger') {
    const stolen = Math.min(3, state.players[state.duelOpponentIndex].score);
    state.players[state.duelOpponentIndex].score = Math.max(0, state.players[state.duelOpponentIndex].score - stolen);
    state.players[state.duelChallengerIndex].score += 3;
    state.lastSound = 'success';
  } else if (winner === 'opponent') {
    const stolen = Math.min(3, state.players[state.duelChallengerIndex].score);
    state.players[state.duelChallengerIndex].score = Math.max(0, state.players[state.duelChallengerIndex].score - stolen);
    state.players[state.duelOpponentIndex].score += 3;
    state.lastSound = 'success';
  } else {
    state.lastSound = 'error';
  }

  startRound(state, database);
}

function resetToLobby(state) {
  const roomCode = state.roomCode;
  const targetScore = state.targetScore;
  const ownerName = state.ownerName;
  const ownerPlayerIndex = state.ownerPlayerIndex ?? 0;
  const players = state.players.map(p => ({
    id: p.id,
    name: p.name,
    score: 0,
    streak: 0,
    chosenNote: null,
    isReady: false
  }));
  Object.assign(state, createInitialGameState(targetScore));
  state.roomCode = roomCode;
  state.ownerName = ownerName;
  state.ownerPlayerIndex = ownerPlayerIndex;
  state.players = players;
  state.phase = 'lobby';
}

function getTimeLeft(state) {
  if (!state.timerStartedAt || !state.timerDuration) return 0;
  const elapsed = Math.floor((Date.now() - state.timerStartedAt) / 1000);
  return Math.max(0, state.timerDuration - elapsed);
}

function handleTimerExpired(state, database) {
  if (state.phase === 'question' && !state.answerRevealed) {
    state.lastSound = 'error';
    revealAnswer(state);
    return true;
  }
  if (state.phase === 'auction_play') {
    state.lastSound = 'error';
    resolveAuction(state, false);
    return true;
  }
  return false;
}

function getPublicGameState(state) {
  return JSON.parse(JSON.stringify(state));
}

module.exports = {
  generateRoomCode,
  generateOwnerToken,
  createInitialGameState,
  getActivePlayerIndex,
  getTakenNotes,
  computePoints,
  startGame,
  advanceRound,
  chooseNote,
  readyForQuestion,
  revealAnswer,
  validateTurn,
  selectAuctionWinner,
  resolveAuction,
  endAuction,
  selectDuelOpponent,
  readyForDuel,
  revealDuelAnswer,
  resolveDuel,
  resetToLobby,
  getTimeLeft,
  handleTimerExpired,
  getPublicGameState,
  clearTimer
};
