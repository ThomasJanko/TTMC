# Prompt Cursor – Migration TTMC vers Multijoueur WebSocket

## Contexte

Ce projet est un quiz multijoueur appelé TTMC (Tu Te Mets Combien ?). Il existe aujourd'hui sous forme d'une SPA HTML/CSS/JS mono-device (`TTMC_V3.html` + `js/` + `css/`). Je veux le migrer vers une architecture **multi-devices WebSocket** : chaque joueur joue sur son propre téléphone.

Lis le fichier `CONTEXT.md` à la racine du projet avant de commencer. Il contient l'architecture complète, le protocole WebSocket, les interfaces client, et toutes les règles de jeu.

---

## Ce que tu dois faire

### 1. Initialiser le projet Node.js

Crée un `package.json` avec les dépendances :
- `express`
- `ws`

Structure les fichiers comme décrit dans `CONTEXT.md` (dossier `public/` pour les fichiers statiques).

Déplace les fichiers existants `css/styles.css`, `js/database.js`, `js/audio.js` dans `public/css/` et `public/js/`.

---

### 2. Créer `server.js`

Le serveur doit :

- Servir les fichiers statiques du dossier `public/`
- Servir `public/owner.html` sur `/owner`
- Servir `public/player.html` sur `/player`
- Servir `public/display.html` sur `/display`
- Gérer les connexions WebSocket

**Gestion des rooms :**
```js
// Structure en mémoire
const rooms = new Map(); // roomCode → { gameState, clients: Map<ws, { role, playerIndex }> }
```

**Logique de jeu côté serveur :** migre toute la logique de `js/game.js` (calcul des scores, streaks, enchères, duels, rounds) en fonctions pures dans `server.js` ou un module séparé `gameLogic.js`.

**Timer côté serveur :** le timer tourne avec `setInterval`, envoie `TIMER_TICK` chaque seconde à tous les clients de la room, et déclenche automatiquement le timeout à 0.

**Handler WebSocket :** implémente tous les messages décrits dans `CONTEXT.md` (section "Protocole WebSocket – Messages"). Après chaque mutation du `gameState`, broadcast un message `GAME_STATE` complet à tous les clients de la room.

**Sécurité owner :** à la création de la partie, génère un `ownerToken` (uuid ou random hex) et renvoie-le uniquement au créateur. Vérifie ce token sur toutes les actions de contrôle.

**Reconnexion :** si un joueur envoie `JOIN_GAME` avec un `roomCode` + `playerName` déjà existants, réattribue son slot (met à jour le `ws` dans `clients`).

---

### 3. Créer `public/owner.html` + `public/js/owner.js`

Conserve le style visuel existant (`styles.css`). Pas de framework JS.

**Écran Lobby :**
- Affiche le `roomCode` en très grand (avec un bouton "Copier le code")
- Liste live des joueurs connectés (mise à jour sur chaque `GAME_STATE`)
- Input "Score cible" (valeur par défaut 30)
- Bouton "Lancer la partie 🚀" (disabled si < 2 joueurs)

**Pendant la partie :**
- Sidebar permanente avec le scoreboard compact
- Zone principale qui change selon la phase reçue dans `GAME_STATE` :

| Phase | Affichage owner |
|---|---|
| `bid` | Indicateur "En attente que [Nom] choisisse sa note" |
| `transition` | Récapitulatif (joueur, thème, note) + bouton "Lancer la question ▶️" |
| `question` | Timer + thème + question affichée + bouton "Révéler la réponse" |
| `answer_revealed` | Réponse + boutons "✔️ Validé" / "❌ Erroné" |
| `auction_setup` | Sujet de l'enchère + grid pour sélectionner le gagnant |
| `auction_play` | Timer + nom du gagnant + boutons "A réussi ✔️" / "A échoué ❌" |
| `auction_result` | Tableau des gains + bouton "Continuer ➡️" |
| `duel_setup` | Nom du challengeur + grid pour sélectionner la cible |
| `duel_transition` | Matchup + bouton "Nous sommes prêts 🔥" |
| `duel_question` | Question + bouton "Révéler" + boutons vainqueur |
| `scores` | Scoreboard complet + bouton "Manche suivante 🔄" (si pas game_over) |
| `game_over` | Confetti + nom du gagnant + bouton "Recommencer" |

---

### 4. Créer `public/player.html` + `public/js/player.js`

**Avant de rejoindre :**
- Input `roomCode` (4 lettres, majuscules auto)
- Input `playerName`
- Bouton "Rejoindre"

Stocke le `roomCode`, `playerName` et le `ws` en mémoire dans le client.

**Rendu selon la phase reçue dans `GAME_STATE` :**

| Phase | Affichage joueur |
|---|---|
| `lobby` | "En attente du lancement... 👋" + liste des joueurs |
| `bid` (son tour) | Grille des notes disponibles (boutons 1 à N, notes prises désactivées) |
| `bid` (pas son tour) | "⏳ [Nom] choisit sa note..." |
| `transition` (son tour) | Thème, note choisie, statut température + bouton "Je suis prêt(e) ! 🚀" |
| `transition` (pas son tour) | "[Nom] se prépare..." |
| `question` (son tour) | Question + timer |
| `question` (pas son tour) | "🎙️ [Nom] répond à l'oral — écoutez !" |
| `answer_revealed` | Réponse affichée ("Le owner valide...") |
| `auction_setup` | Sujet de l'enchère affiché |
| `auction_play` | Timer visible + nom du joueur qui tente |
| `duel_setup` / `duel_transition` / `duel_question` | Infos du duel |
| `scores` | Scoreboard complet avec sa position mise en valeur |
| `game_over` | Résultat final |

Pour déterminer si c'est "son tour" : compare `gameState.roundOrder[gameState.currentTurnIndex]` avec l'index du joueur local.

---

### 5. Créer `public/display.html` + `public/js/display.js`

Interface "grand écran" / TV, lecture seule.

**Connexion :**
- Input `roomCode` + bouton "Rejoindre en tant qu'écran"
- Envoie `WATCH_GAME` au serveur

**Rendu selon la phase :**

| Phase | Affichage display |
|---|---|
| `lobby` | Gros `roomCode` centré + liste des joueurs avec emoji |
| `bid` | Grille montrant qui a choisi (note masquée si `isHiddenRound`) |
| `transition` | Joueur actif + thème + note |
| `question` | Joueur + thème + timer géant + question (après reveal) |
| `answer_revealed` | Question + réponse |
| `scores` | Tableau des scores avec barres de progression (comme le scoreboard actuel) |
| `auction_*` | Sujet + timer + résultats |
| `duel_*` | Matchup dramatique + question + résultat |
| `game_over` | 🏆 Gagnant en grand |

---

### 6. Mettre à jour `public/css/styles.css`

Garde tout le CSS existant. Ajoute :
- `.screen-owner`, `.screen-player`, `.screen-display` pour les layouts spécifiques
- Styles pour le `roomCode` (grosse typo, monospace)
- Styles pour le timer géant sur display
- Media queries pour mobile (player.html doit être 100% utilisable sur téléphone)

---

### 7. Points de détail importants

- **Audio** : dans `player.js` et `owner.js`, écoute les transitions de phase dans `GAME_STATE` et déclenche les sons via `audio.js` (ex: phase passe à `answer_revealed` avec `lastCorrect: true` → `playSound('success')`)
- **Confetti** : sur la phase `game_over`, déclenche `triggerConfetti()` (script canvas-confetti déjà en CDN)
- **Hall of Fame** : conserve le `localStorage` dans `player.js` ou `owner.js` pour le record historique
- **roomCode** : générer avec des lettres majuscules sans ambiguïté (pas O/0, I/1) : `BCDFGHJKLMNPQRSTVWXYZ`
- **ownerToken** : stocké en `sessionStorage` côté owner pour survie au refresh
- **Pas de `game.js` côté client** : toute la logique est serveur. Le client est purement un renderer de `GAME_STATE`

---

### 8. Pour démarrer le projet

Ajoute dans `package.json` :
```json
"scripts": {
  "start": "node server.js",
  "dev": "node --watch server.js"
}
```

Le serveur écoute sur le port `3000` par défaut (configurable via `process.env.PORT`).

---

## Rappel de la structure finale attendue

```
TTMC_v3/
├── server.js
├── gameLogic.js          (optionnel, si tu extrais la logique de jeu)
├── package.json
├── CONTEXT.md
├── CURSOR_PROMPT.md
├── public/
│   ├── owner.html
│   ├── player.html
│   ├── display.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── database.js
│       ├── audio.js
│       ├── owner.js
│       ├── player.js
│       └── display.js
```

L'ancien `TTMC_V3.html` peut être gardé pour référence mais n'est plus le point d'entrée.
