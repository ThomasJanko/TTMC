# TTMC – Context de migration Multijoueur WebSocket

## Vue d'ensemble du projet actuel

TTMC (Tu Te Mets Combien ?) est un quiz multijoueur en temps réel. Le jeu existe actuellement sous forme d'une SPA HTML/CSS/JS **mono-écran** (tous les joueurs partagent le même téléphone). L'objectif de cette migration est de passer en mode **multi-devices** via WebSockets : chaque joueur joue sur son propre téléphone, un owner contrôle la partie, et un écran de display affiche l'état du jeu en temps réel.

---

## Stack cible

| Couche | Technologie |
|---|---|
| Backend | Node.js + Express + `ws` (WebSocket natif) |
| Frontend | HTML/CSS/JS vanilla (pas de framework) – conserver le style actuel |
| Communication | WebSocket (JSON messages) |
| Déploiement | Un seul process Node, fichiers statiques servis par Express |

---

## Architecture des fichiers

```
TTMC_v3/
├── server.js                  # Serveur Express + WebSocket
├── package.json
├── public/
│   ├── owner.html             # Interface owner (créer/contrôler la partie)
│   ├── player.html            # Interface joueur (rejoindre, choisir note, répondre)
│   ├── display.html           # Écran TV / grand écran (lecture seule)
│   ├── css/
│   │   └── styles.css         # CSS existant (+ ajouts pour les nouvelles vues)
│   └── js/
│       ├── database.js        # Base de questions (inchangée)
│       ├── audio.js           # Sons (inchangé)
│       ├── owner.js           # Logique client owner
│       ├── player.js          # Logique client joueur
│       └── display.js         # Logique client display
```

---

## Rôles et URLs

| Rôle | URL | Description |
|---|---|---|
| **Owner** | `/owner` | Crée la partie, contrôle le flow (avancer les phases, valider les réponses) |
| **Player** | `/player` | Rejoint avec un code, choisit sa note, voit la question sur son écran |
| **Display** | `/display` | Grand écran partagé, affichage live des scores/questions/résultats. Lecture seule |

---

## Modèle de données côté serveur (état de la partie)

```js
const gameState = {
  roomCode: "ABCD",           // Code à 4 lettres pour rejoindre
  phase: "lobby",             // Phase courante (voir enum ci-dessous)
  players: [
    {
      id: "ws-socket-id",
      name: "Alice",
      score: 0,
      streak: 0,              // Nombre de bonnes réponses consécutives
      chosenNote: null,       // Note choisie dans la phase bid (1-15)
      isReady: false
    }
  ],
  roundOrder: [],             // Indices des joueurs dans l'ordre de jeu du round
  currentTurnIndex: 0,        // Index dans roundOrder du joueur actif
  currentTheme: null,         // { theme: "...", questions: { "1": {q,a}, ... } }
  usedThemes: [],
  targetScore: 30,
  roundCount: 0,
  isAuctionRound: false,
  isHiddenRound: false,
  auctionSubject: null,
  auctionWinnerIndex: null,
  duelChallengerIndex: null,
  duelOpponentIndex: null,
  duelQuestion: null,
  timerStartedAt: null,       // timestamp Date.now() du début du timer
  timerDuration: 0,           // durée en secondes
  gameOver: false
}
```

### Enum des phases

```
"lobby"              → Owner attend que les joueurs rejoignent
"bid"                → Chaque joueur choisit sa note (à tour de rôle)
"transition"         → Écran de transition avant la question
"question"           → Phase de réponse (timer actif)
"answer_revealed"    → Réponse affichée, owner valide
"scores"             → Scoreboard entre les rounds
"auction_setup"      → Phase enchères – sélection du gagnant
"auction_play"       → Le gagnant de l'enchère tente sa liste
"auction_result"     → Résultat de l'enchère
"duel_setup"         → Le challengeur choisit sa cible
"duel_transition"    → Écran de transition duel
"duel_question"      → Question duel flash
"game_over"          → Fin de partie
```

---

## Protocole WebSocket – Messages

Tous les messages sont du JSON avec un champ `type`.

### Client → Serveur

| type | Émis par | Payload | Description |
|---|---|---|---|
| `CREATE_GAME` | Owner | `{ targetScore }` | Crée une nouvelle partie, retourne le roomCode |
| `JOIN_GAME` | Player | `{ roomCode, playerName }` | Rejoindre une partie existante |
| `WATCH_GAME` | Display | `{ roomCode }` | S'abonner en lecture seule |
| `START_GAME` | Owner | `{}` | Lance la partie (min 2 joueurs) |
| `CHOOSE_NOTE` | Player | `{ note: number }` | Joueur choisit sa note dans la phase bid |
| `OWNER_ACTION` | Owner | `{ action }` | Actions de contrôle du flow |
| `RESOLVE_TURN` | Owner | `{ isCorrect: boolean }` | Valider ou invalider la réponse |
| `SELECT_AUCTION_WINNER` | Owner | `{ playerIndex }` | Choisir le gagnant de l'enchère |
| `RESOLVE_AUCTION` | Owner | `{ success: boolean }` | Enchère réussie ou échouée |
| `SELECT_DUEL_OPPONENT` | Owner | `{ playerIndex }` | Choisir la cible du duel |
| `RESOLVE_DUEL` | Owner | `{ winner: 'challenger'|'opponent'|'nobody' }` | Résoudre le duel |

**`OWNER_ACTION` – valeurs possibles pour `action` :**
- `"READY_TO_QUESTION"` → passer de la transition à la phase question
- `"REVEAL_ANSWER"` → révéler la réponse (stop timer)
- `"NEXT_ROUND"` → avancer au round suivant
- `"READY_FOR_DUEL"` → passer de duel_transition à duel_question
- `"REVEAL_DUEL_ANSWER"` → révéler la réponse du duel
- `"END_AUCTION"` → passer de auction_result au round suivant
- `"RESET_GAME"` → retour au lobby

### Serveur → Clients (broadcast)

| type | Payload | Description |
|---|---|---|
| `GAME_STATE` | `{ gameState }` | Sync complète de l'état (envoyé à chaque changement) |
| `TIMER_TICK` | `{ timeLeft }` | Tick du timer toutes les secondes |
| `ERROR` | `{ message }` | Erreur (room introuvable, action invalide, etc.) |
| `PLAYER_JOINED` | `{ playerName }` | Notification d'arrivée d'un joueur dans le lobby |

> **Règle** : après chaque mutation du `gameState`, le serveur broadcast un `GAME_STATE` complet à tous les clients de la room. Les `TIMER_TICK` sont envoyés séparément pour ne pas polluer le state.

---

## Logique serveur

### Gestion des rooms
- Chaque partie a un `roomCode` unique à 4 lettres (ex: `XKQZ`), généré aléatoirement
- Les rooms sont stockées en mémoire dans un `Map<roomCode, Room>`
- Une `Room` contient : `{ gameState, clients: Map<ws, { role, playerIndex }> }`
- Si l'owner se déconnecte, la partie est mise en pause (message aux joueurs)
- Si un joueur se déconnecte, son slot est gardé en mémoire (reconnexion possible par nom)

### Timer côté serveur
- Le timer tourne **côté serveur** (setInterval)
- Le serveur envoie `TIMER_TICK` à tous les clients chaque seconde
- À 0, le serveur déclenche automatiquement `triggerTimeout` (comme actuellement) et broadcast le nouvel état

### Logique de jeu
Toute la logique de jeu (calcul des scores, gestion des streaks, enchères, duels) est **migrée côté serveur** dans `server.js`. Les fichiers `game.js` actuels disparaissent du client. Les clients ne font que :
1. Envoyer des actions utilisateur au serveur
2. Rendre l'état reçu dans le DOM

---

## Interfaces client

### `owner.html` – Panneau de contrôle

**Lobby :**
- Affiche le `roomCode` en grand (QR code optionnel)
- Liste des joueurs connectés en temps réel
- Champ "Score cible" (modifiable avant le lancement)
- Bouton "Lancer la partie" (actif si ≥ 2 joueurs)

**Pendant la partie :**
- Affiche toujours la **phase courante** et le **joueur actif**
- Boutons contextuels selon la phase :
  - Phase `bid` → indicateur de qui doit choisir (la note est choisie par le joueur sur son téléphone)
  - Phase `transition` → bouton "Lancer la question"
  - Phase `question` → timer visible + bouton "Révéler la réponse"
  - Phase `answer_revealed` → boutons "✔️ Validé" / "❌ Erroné"
  - Phase `auction_setup` → grid de sélection du gagnant
  - Phase `auction_play` → timer + boutons "A réussi" / "A échoué"
  - Phase `duel_setup` → grid de sélection de la cible
  - Phase `duel_question` → bouton "Révéler" + boutons vainqueur
  - Phase `scores` → bouton "Manche suivante"
- Scoreboard compact toujours visible en sidebar

### `player.html` – Interface joueur

**Avant de rejoindre :**
- Champ `roomCode` + champ `playerName`
- Bouton "Rejoindre"

**Lobby :**
- Message "En attente du lancement par le owner..."
- Nom du joueur affiché + score (0)

**Phase `bid` :**
- Si c'est **son tour** : grille des notes disponibles (boutons 1-15, notes déjà prises désactivées)
- Si ce n'est **pas son tour** : "En attente de [Nom]..."

**Phase `transition` :**
- Affiche : nom du joueur actif, thème, note choisie, statut température
- Si c'est son tour : bouton "Je suis prêt(e) ! 🚀" → envoie `OWNER_ACTION` (seul le joueur actif peut déclencher, ou l'owner)

**Phase `question` :**
- Si c'est **son tour** : question affichée sur son téléphone + timer
- Si ce n'est **pas son tour** : "🎙️ [Nom] répond à l'oral — écoutez !"

**Phase `answer_revealed` :**
- Affiche la réponse sur tous les écrans joueur (pour que le groupe décide)
- Le joueur actif voit : "Le groupe vote... Le owner valide le résultat"

**Phases duel, enchères :**
- Affichage contextuel (qui duel, sujet de l'enchère, etc.)
- Pas d'action interactive pour le joueur (c'est l'owner qui valide)

**Phase `scores` :**
- Scoreboard complet affiché

### `display.html` – Grand écran

Affichage "TV" en lecture seule, toujours synchronisé avec le `gameState`.

**Lobby :** Gros `roomCode` + liste des joueurs avec avatar/emoji

**Phase `bid` :** Grille de qui a choisi quelle note (masquée ou visible selon `isHiddenRound`)

**Phase `question` :**
- Joueur actif + thème + timer géant
- Question affichée (après reveal)

**Phase `scores` :** Tableau des scores avec barres de progression (même logique qu'actuellement)

**Phases duel / enchères :** Affichage dramatique (matchup, sujet, timer)

---

## Règles de jeu (inchangées)

- **Streak / Température** : ❄️ Froid (0) → 🌤️ Tiède (1) → 🔥 Chaud (2) → 🌋 Brûlant (3+, +1 pt bonus)
- **Enchères** : tous les 2 manches normales. Réussite = +4 pts, Échec = +1 pt pour tous les autres
- **Duel** : tous les 3 rounds. Challenger désigné au hasard, choisit sa cible. Victoire = +3 pts volés à l'adversaire
- **Fin de partie** : premier joueur à atteindre `targetScore`
- **Notes** : de 1 à `players.length` (max 15), chaque note est unique dans un round

---

## Points d'attention / Contraintes

1. **Pas de base de données** — tout en mémoire. Si le serveur redémarre, les parties sont perdues (acceptable pour v1)
2. **Reconnexion** — si un joueur se reconnecte avec le même nom et roomCode, récupérer son slot
3. **Compatibilité mobile** — les interfaces player et display doivent être 100% responsive (viewport mobile)
4. **Audio** — `audio.js` reste côté client, les sons se déclenchent sur les events reçus du serveur (ex: `GAME_STATE` avec phase `answer_revealed` + `isCorrect: true`)
5. **Sécurité légère** — vérifier que seul l'owner peut envoyer les actions de contrôle (via un `ownerToken` envoyé à la création de la partie)
6. **Timer de confiance** — le timer affiché côté client est recalculé depuis `timerStartedAt + timerDuration` (tolérance latence réseau). Le serveur reste la source de vérité

---

## Ordre d'implémentation suggéré

1. `server.js` — setup Express + ws, gestion des rooms, messages CREATE/JOIN/WATCH
2. Logique de jeu serveur — migrer `game.js` en fonctions pures appelées par les handlers WS
3. `owner.html` + `owner.js` — lobby + contrôles de base
4. `player.html` + `player.js` — rejoindre + phase bid
5. `display.html` + `display.js` — affichage synchronisé
6. Timer côté serveur + TIMER_TICK
7. Phases avancées : enchères, duel
8. Gestion déconnexion / reconnexion
