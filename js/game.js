// Base de données externe
let database = [];

let players = [];
let roundOrder = [];
let currentTurnIndex = 0;
let currentTheme = null;
let usedThemes = [];
let targetScore = 30;
let gameOver = false;

let timerInterval = null;
let timeLeft = 0;

let roundCount = 0;
let isHiddenRound = false;
let duelChallengerIndex = null;
let duelOpponentIndex = null;
let duelQuestion = null;

// --- VARIABLES POUR LES ENCHÈRES ---
let isAuctionRound = false;
let auctionWinnerIndex = null;
const auctionSubjects = [
    "super héros",
    "personnages Disney",
    "princesses Disney",
    "méchants Disney",
    "Pokémons",
    "personnages de Harry Potter",
    "personnages de Star Wars",
    "personnages Marvel",
    "personnages de mangas",

    "films célèbres",
    "films d'animation",
    "séries télévisées",
    "dessins animés",
    "jeux vidéo célèbres",
    "consoles de jeux vidéo",

    "acteurs français",
    "acteurs américains",
    "chanteurs français",
    "chanteuses françaises",
    "groupes de musique",
    "rappeurs français",
    "youtubeurs francophones",

    "clubs de football",
    "équipes nationales de football",
    "joueurs de football",
    "joueurs NBA",
    "pilotes de Formule 1",
    "sports olympiques",

    "capitales européennes",
    "capitales du monde",
    "pays d'Europe",
    "pays d'Asie",
    "pays d'Afrique",
    "villes françaises",
    "régions françaises",
    "monuments célèbres",
    "îles célèbres",

    "marques de voitures",
    "marques de vêtements",
    "marques de sport",
    "marques de luxe",
    "marques de smartphones",
    "réseaux sociaux",
    "sites internet célèbres",

    "animaux de la savane",
    "animaux marins",
    "animaux de la ferme",
    "races de chiens",
    "félins",
    "oiseaux",

    "fruits",
    "légumes",
    "fromages",
    "pâtisseries",
    "plats italiens",
    "plats asiatiques",
    "chaînes de restauration",

    "métiers",
    "métiers du médical",
    "métiers du bâtiment",
    "métiers de l'informatique",
    "instruments de musique",
    "objets de cuisine",
    "meubles",

    "rois de France",
    "empereurs romains",
    "pharaons",
    "personnages historiques",
    "inventeurs célèbres",
    "scientifiques célèbres",

    "parcs d'attractions",
    "compagnies aériennes",
    "constructeurs automobiles",
    "musées célèbres",
    "châteaux célèbres"
];


function changeScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function addPlayer() {
    const input = document.getElementById('player-name');
    const name = input.value.trim();
    if (name === "") return;
    if (players.length >= 15) { alert("Limite maximale de 15 joueurs atteinte !"); return; }

    players.push({ name: name, score: 0, chosenNote: null, streak: 0 });
    input.value = "";
    updatePlayerList();
}

function updatePlayerList() {
    const listDiv = document.getElementById('player-list-display');
    const startBtn = document.getElementById('btn-start');
    
    if (players.length === 0) {
        listDiv.innerHTML = "Aucun joueur ajouté.";
        startBtn.style.display = "none";
    } else {
        listDiv.innerHTML = `<strong>Joueurs inscrits (${players.length}/15) :</strong><br>` + 
                            players.map((p, i) => `${i+1}. ${p.name}`).join('<br>');
        startBtn.style.display = "block";
    }
}

function startNewGame() {
    targetScore = parseInt(document.getElementById('target-score').value) || 30;
    gameOver = false;
    roundCount = 0;
    isAuctionRound = false;
    players.forEach(p => {
        p.score = 0;
        p.streak = 0;
    });
    document.getElementById('btn-next-round').style.display = "block";
    document.getElementById('score-title').innerText = "Classement Général 🏆";
    advanceRound();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function advanceRound() {
    if (gameOver) {
        showScoreboard();
        return;
    }
    
    // Alterne entre Manche Normale et Enchère
    if (!isAuctionRound && roundCount > 0) {
        isAuctionRound = true;
        setupAuction();
    } else {
        isAuctionRound = false;
        roundCount++;
        if (roundCount > 1 && (roundCount - 1) % 3 === 0 && players.length >= 2) {
            setupDuel();
        } else {
            startRound();
        }
    }
}

function getTempHtml(streak) {
    if (streak === 0) return '<span class="temp-froid">❄️ Froid</span>';
    if (streak === 1) return '<span class="temp-tiede">🌤️ Tiède</span>';
    if (streak === 2) return '<span class="temp-chaud">🔥 Chaud</span>';
    return '<span class="temp-brulant">🌋 Brûlant (+1 pt)</span>';
}

function startRound() {
    if (players.length === 0) return;

    let availableThemes = database.filter(t => !usedThemes.includes(t.theme));
    if (availableThemes.length === 0) {
        usedThemes = [];
        availableThemes = database;
    }
    currentTheme = availableThemes[Math.floor(Math.random() * availableThemes.length)];
    usedThemes.push(currentTheme.theme);

    isHiddenRound = (roundCount > 1) && (Math.random() < 0.25);

    let playersWithScore = players.map((p, index) => ({ index: index, score: p.score }));
    playersWithScore = shuffleArray(playersWithScore);
    playersWithScore.sort((a, b) => a.score - b.score);
    roundOrder = playersWithScore.map(item => item.index);

    players.forEach(p => p.chosenNote = null);
    
    const grid = document.getElementById('notes-grid');
    grid.innerHTML = "";

    const totalNotesAAfficher = Math.min(players.length, 15);
    for (let i = 1; i <= totalNotesAAfficher; i++) {
        grid.innerHTML += `<button id="btn-n${i}" class="btn-note" onclick="playerChooseNote(${i})">${i}</button>`;
    }

    currentTurnIndex = 0;
    goToBidPhase();
}

function goToBidPhase() {
    const actualPlayerIndex = roundOrder[currentTurnIndex];
    const player = players[actualPlayerIndex];
    
    if (isHiddenRound) {
        document.getElementById('bid-theme-title').innerText = "??? Thème Mystère ???";
        document.getElementById('hidden-warning').style.display = "block";
    } else {
        document.getElementById('bid-theme-title').innerText = currentTheme.theme;
        document.getElementById('hidden-warning').style.display = "none";
    }

    document.getElementById('bid-turn-indicator').innerText = `Choix de note : Joueur ${currentTurnIndex + 1} sur ${players.length}`;
    document.getElementById('bid-player-name').innerText = player.name;
    document.getElementById('bid-player-temp').innerHTML = getTempHtml(player.streak);
    
    changeScreen('screen-bid');
}

function playerChooseNote(note) {
    const actualPlayerIndex = roundOrder[currentTurnIndex];
    players[actualPlayerIndex].chosenNote = note;
    
    document.getElementById(`btn-n${note}`).disabled = true;
    currentTurnIndex++;

    if (currentTurnIndex < players.length) {
        goToBidPhase();
    } else {
        currentTurnIndex = 0;
        prepareTransition();
    }
}

function prepareTransition() {
    const actualPlayerIndex = roundOrder[currentTurnIndex];
    const player = players[actualPlayerIndex];

    document.getElementById('transition-player-name').innerText = player.name;
    document.getElementById('transition-theme').innerText = currentTheme.theme; 
    document.getElementById('transition-note').innerText = player.chosenNote;

    if (player.streak >= 3) {
        document.getElementById('transition-multiplier').style.display = "block";
    } else {
        document.getElementById('transition-multiplier').style.display = "none";
    }

    changeScreen('screen-transition');
}

function goToQuestionPhase() {
    const actualPlayerIndex = roundOrder[currentTurnIndex];
    const player = players[actualPlayerIndex];
    const note = player.chosenNote;

    let bonusPoints = player.streak >= 3 ? 1 : 0;
    let finalPoints = note + bonusPoints;

    document.getElementById('question-theme-title').innerText = currentTheme.theme;
    document.getElementById('question-turn-indicator').innerText = `Question : Joueur ${currentTurnIndex + 1} sur ${players.length}`;
    document.getElementById('question-player-name').innerText = player.name;
    document.getElementById('displayed-note').innerText = `${note} ${bonusPoints ? '(+1 bonus Brûlant = ' + finalPoints + ' pts)' : '(= ' + finalPoints + ' pts)'}`;
    document.getElementById('points-to-add').innerText = finalPoints;
    
    let qData = currentTheme.questions[note];
    if (!qData) {
        const maxDispo = Math.max(...Object.keys(currentTheme.questions).map(Number));
        qData = currentTheme.questions[maxDispo];
    }

    document.getElementById('question-text').innerText = qData.q;
    document.getElementById('answer-text').innerText = qData.a;

    document.getElementById('answer-box').style.display = "none";
    document.getElementById('validation-buttons').style.display = "none";
    document.getElementById('btn-reveal').style.display = "block";

    changeScreen('screen-question');
    
    // Lancement du chrono classique (durée variable, sonne à 5s, timeout classique)
    initTimer(15 + (note * 3), 'timer-display', 5, triggerTimeout);
}

// Fonction chrono rendue paramétrable
function initTimer(duration, displayId = 'timer-display', dangerLimit = 5, onTimeout = triggerTimeout) {
    clearInterval(timerInterval);
    timeLeft = duration;
    const timerDisplay = document.getElementById(displayId);
    timerDisplay.style.color = "var(--primary)";
    timerDisplay.innerText = `⏱️ ${timeLeft}s`;

    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.innerText = `⏱️ ${timeLeft}s`;
        
        if (timeLeft <= dangerLimit && timeLeft > 0) {
            timerDisplay.style.color = "var(--danger)";
            playSound('tick');
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            onTimeout();
        }
    }, 1000);
}

function triggerTimeout() {
    playSound('error'); 
    revealAnswer();
    document.body.classList.add('flash-danger');
    setTimeout(() => document.body.classList.remove('flash-danger'), 600);
}

function revealAnswer() {
    clearInterval(timerInterval);
    document.getElementById('answer-box').style.display = "block";
    document.getElementById('btn-reveal').style.display = "none";
    document.getElementById('validation-buttons').style.display = "flex";
}

function validateTurn(isCorrect) {
    const actualPlayerIndex = roundOrder[currentTurnIndex];
    const player = players[actualPlayerIndex];

    let bonusPoints = player.streak >= 3 ? 1 : 0;
    
    if (isCorrect) {
        playSound('success'); 
        player.score += player.chosenNote + bonusPoints;
        player.streak++;
        document.body.classList.add('flash-success');
        setTimeout(() => document.body.classList.remove('flash-success'), 600);
    } else {
        playSound('error'); 
        player.streak = 0; 
        document.body.classList.add('flash-danger');
        setTimeout(() => document.body.classList.remove('flash-danger'), 600);
    }
    
    if (player.score >= targetScore) { gameOver = true; }

    currentTurnIndex++;

    if (currentTurnIndex < players.length) {
        prepareTransition();
    } else {
        showScoreboard();
    }
}

// --- LOGIQUE DES ENCHÈRES ---
function setupAuction() {
    const randomSubject = auctionSubjects[Math.floor(Math.random() * auctionSubjects.length)];
    document.getElementById('auction-subject').innerText = randomSubject;
    
    // Sélectionne au hasard le joueur qui commence à parler
    const randomStarterIndex = Math.floor(Math.random() * players.length);
    const starterName = players[randomStarterIndex].name;
    document.getElementById('auction-starter-display').innerHTML = `📢 C'est à <strong>${starterName}</strong> d'ouvrir les enchères !`;
    
    let grid = document.getElementById('auction-player-grid');
    grid.innerHTML = '';
    players.forEach((p, idx) => {
        grid.innerHTML += `
        <div class="btn-opponent" onclick="selectAuctionWinner(${idx})">
            <strong>${p.name}</strong>
        </div>`;
    });
    
    changeScreen('screen-auction-setup');
}

function selectAuctionWinner(index) {
    auctionWinnerIndex = index;
    document.getElementById('auction-winner-name').innerText = players[auctionWinnerIndex].name;
    changeScreen('screen-auction-play');
    
    // Lancer le chrono de 45s, affiché sur 'auction-timer-display', qui sonne à 10s
    initTimer(45, 'auction-timer-display', 10, triggerAuctionTimeout);
}

// Fonction appelée si le chrono des enchères tombe à zéro
function triggerAuctionTimeout() {
    playSound('error'); 
    document.body.classList.add('flash-danger');
    setTimeout(() => document.body.classList.remove('flash-danger'), 600);
    // Le joueur a manqué de temps, c'est un échec automatique
    resolveAuction(false); 
}

function resolveAuction(success) {
    clearInterval(timerInterval); // Arrête le chrono s'il restait du temps
    
    let tbody = document.getElementById('auction-result-tbody');
    tbody.innerHTML = '';
    
    if (success) {
        playSound('success');
        players.forEach((p, idx) => {
            let diff = 0;
            if (idx === auctionWinnerIndex) {
                p.score += 4;
                diff = "+4";
            } else {
                diff = "0";
            }
            tbody.innerHTML += `<tr><td>${p.name}</td><td>${p.score} pts</td><td style="color:var(--success); font-weight:bold;">${diff}</td></tr>`;
        });
        document.getElementById('auction-result-title').innerText = `${players[auctionWinnerIndex].name} a réussi l'enchère ! 🎉`;
        document.getElementById('auction-result-title').style.color = "var(--success)";
    } else {
        playSound('error');
        players.forEach((p, idx) => {
            let diff = 0;
            if (idx === auctionWinnerIndex) {
                diff = "0";
            } else {
                p.score += 1;
                diff = "+1";
            }
            tbody.innerHTML += `<tr><td>${p.name}</td><td>${p.score} pts</td><td style="color:${diff==='+1'?'var(--success)':'white'}; font-weight:bold;">${diff}</td></tr>`;
        });
        document.getElementById('auction-result-title').innerText = `${players[auctionWinnerIndex].name} a échoué ! ❌`;
        document.getElementById('auction-result-title').style.color = "var(--danger)";
    }
    
    if (players.some(p => p.score >= targetScore)) { gameOver = true; }
    
    changeScreen('screen-auction-result');
}

function endAuction() {
    advanceRound();
}

// --- LOGIQUE DU DUEL ---
function setupDuel() {
    duelChallengerIndex = Math.floor(Math.random() * players.length);
    document.getElementById('duel-challenger-name').innerText = players[duelChallengerIndex].name;
    
    let grid = document.getElementById('duel-opponent-grid');
    grid.innerHTML = '';
    players.forEach((p, idx) => {
        if (idx !== duelChallengerIndex) {
            grid.innerHTML += `
            <div class="btn-opponent" onclick="prepareDuelTransition(${idx})">
                <strong>${p.name}</strong>
                <span>${p.score} pts</span>
            </div>`;
        }
    });
    
    changeScreen('screen-duel-setup');
}

function prepareDuelTransition(opponentIndex) {
    duelOpponentIndex = opponentIndex;
    let p1Name = players[duelChallengerIndex].name;
    let p2Name = players[duelOpponentIndex].name;

    document.getElementById('duel-transition-matchup').innerHTML = 
        `<span style="color:var(--primary);">${p1Name}</span> <span style="color:white; font-size:1.2rem;">VS</span> <span style="color:var(--primary);">${p2Name}</span>`;

    changeScreen('screen-duel-transition');
}

function goToDuelQuestionPhase() {
    let p1Name = players[duelChallengerIndex].name;
    let p2Name = players[duelOpponentIndex].name;
    
    document.getElementById('duel-matchup').innerHTML = `<span style="color:var(--primary);">${p1Name}</span> VS <span style="color:var(--primary);">${p2Name}</span>`;
    
    let randTheme = database[Math.floor(Math.random() * database.length)];
    duelQuestion = randTheme.questions[5] || randTheme.questions[1]; 
    
    document.getElementById('duel-question-text').innerText = `[Thème : ${randTheme.theme}]\n${duelQuestion.q}`;
    document.getElementById('duel-answer-text').innerText = duelQuestion.a;
    
    document.getElementById('btn-win-challenger').innerText = p1Name;
    document.getElementById('btn-win-opponent').innerText = p2Name;
    
    document.getElementById('answer-box-duel').style.display = 'none';
    document.getElementById('duel-validation-buttons').style.display = 'none';
    document.getElementById('btn-reveal-duel').style.display = 'block';

    changeScreen('screen-duel-question');
}

function revealDuel() {
    document.getElementById('answer-box-duel').style.display = 'block';
    document.getElementById('btn-reveal-duel').style.display = 'none';
    document.getElementById('duel-validation-buttons').style.display = 'block';
}

function resolveDuel(winner) {
    if (winner === 'challenger') {
        let stolen = Math.min(3, players[duelOpponentIndex].score);
        players[duelOpponentIndex].score = Math.max(0, players[duelOpponentIndex].score - stolen);
        players[duelChallengerIndex].score += 3;
        playSound('success');
    } else if (winner === 'opponent') {
        let stolen = Math.min(3, players[duelChallengerIndex].score);
        players[duelChallengerIndex].score = Math.max(0, players[duelChallengerIndex].score - stolen);
        players[duelOpponentIndex].score += 3;
        playSound('success');
    } else {
        playSound('error');
    }
    
    startRound(); 
}

function showScoreboard() {
    const tbody = document.getElementById('scores-table-body');
    tbody.innerHTML = "";
    
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

    sortedPlayers.forEach((p, index) => {
        let medal = index === 0 ? "🥇 " : index === 1 ? "🥈 " : index === 2 ? "🥉 " : "";
        let percentage = Math.min((p.score / targetScore) * 100, 100);

        tbody.innerHTML += `<tr>
            <td><strong>${medal}${index + 1}</strong></td>
            <td>${p.name}</td>
            <td>${getTempHtml(p.streak)}</td>
            <td>
                <strong>${p.score} / ${targetScore} pts</strong>
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${percentage}%"></div>
                </div>
            </td>
        </tr>`;
    });

    if (gameOver) {
        const absoluteWinner = sortedPlayers[0];
        document.getElementById('score-title').innerHTML = `🏆 VICTOIRE DE ${absoluteWinner.name.toUpperCase()} ! 🎉`;
        document.getElementById('btn-next-round').style.display = "none";
        
        triggerConfetti();
        saveHallOfFame(absoluteWinner.name, absoluteWinner.score);
    }

    changeScreen('screen-scores');
}

function triggerConfetti() {
    var duration = 4 * 1000;
    var end = Date.now() + duration;

    (function frame() {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.8 } });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.8 } });
        if (Date.now() < end) { requestAnimationFrame(frame); }
    }());
}

function saveHallOfFame(name, score) {
    let record = JSON.parse(localStorage.getItem('ttmc_record')) || { name: "Aucun", score: 0 };
    if (score > record.score) {
        record = { name: name, score: score };
        localStorage.setItem('ttmc_record', JSON.stringify(record));
    }
    displayHallOfFame();
}

function displayHallOfFame() {
    let record = JSON.parse(localStorage.getItem('ttmc_record')) || { name: "Aucun", score: 0 };
    if (record.score > 0) {
        document.getElementById('hof-display').innerText = `🏆 Record Historique : ${record.name} (${record.score} pts)`;
    } else {
        document.getElementById('hof-display').innerText = `🏆 Record Historique : Aucun`;
    }
}

function resetGame() {
    players = [];
    usedThemes = [];
    roundCount = 0;
    isAuctionRound = false;
    clearInterval(timerInterval);
    updatePlayerList();
    changeScreen('screen-setup');
}
