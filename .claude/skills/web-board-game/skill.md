---
name: web-board-game
description: Build browser-playable board games using pure JavaScript, GitHub Pages, and analytics. No build step, no dependencies, no frameworks.
---

# Web Board Game Template

Build browser-playable board games following the pattern established by **Fancy That!** — a zero-dependency, pure JavaScript approach deployable directly to GitHub Pages.

## Quick Facts

- **Stack**: Pure ES modules + HTML5 + CSS3 (no dependencies, no build step)
- **Deployment**: GitHub Pages (free static hosting)
- **Analytics**: Google Analytics 4 + optional Metricool tracking
- **Local dev**: `npx http-server -p 8080`
- **Testing**: Headless Node.js simulations + browser play
- **Architecture**: Pure engine (no DOM) + UI layer + AI bots

---

## Architecture Pattern

### Separation of Concerns

```
src/
├── engine/
│   ├── game.js            — Pure game logic (no DOM, fully testable)
│   ├── rules.js           — Card/tile definitions, constants
│   └── statsCollector.js  — Game metrics (optional)
├── ui/
│   ├── main.js            — Game flow & player input handling
│   └── board.js           — DOM rendering (all visual code)
├── bots/
│   ├── randomBot.js       — Random move selection (baseline)
│   ├── basicBot.js        — Heuristic-based AI
│   └── mctsBot.js         — MCTS with configurable depth (optional)
└── index.html + style.css
```

### The Core Rule

**Game engine and bots must be 100% pure:**
- No DOM references (`document`, `getElementById`, etc.)
- No side effects (all game changes flow through one `gameState` object)
- Fully serializable state (enables undo, snapshots, replay)

**Only `ui/board.js` touches the DOM.**

This separation allows you to:
- Test game logic without a browser
- Run headless AI tournaments for balance testing
- Implement undo/redo trivially
- Port the game to desktop or mobile later

---

## Project Setup

### 1. Create Repository

```bash
# GitHub
git init
git remote add origin https://github.com/YOUR_ORG/YOUR_GAME.git
git branch -M main
git push -u origin main

# Enable GitHub Pages in repo settings:
# Settings > Pages > Source = "Deploy from a branch" > main
# Your game will be at: https://YOUR_ORG.github.io/YOUR_GAME/
```

### 2. Minimal package.json

```json
{
  "name": "your-game",
  "version": "1.0.0",
  "description": "A board game for 2–4 players",
  "type": "module",
  "scripts": {
    "dev": "npx http-server -p 8080 -c-1"
  }
}
```

No dependencies required. ES modules work natively in modern browsers.

### 3. Entry Point (index.html)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Game — Play Online | Your Studio</title>
  <meta name="description" content="Play Your Game online — a [description] for 2–4 players.">
  
  <!-- Open Graph (social sharing) -->
  <meta property="og:title" content="Your Game — Play Online">
  <meta property="og:description" content="Description for social media">
  <meta property="og:image" content="https://yourstudio.com/images/og-image.jpg">
  <meta property="og:url" content="https://yourstudio.github.io/your-game/">
  
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-YOUR_GA_ID"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-YOUR_GA_ID');
  </script>
  
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="src/ui/main.js"></script>
</body>
</html>
```

---

## Game Engine Pattern

### State Shape

```javascript
// src/engine/game.js
export function createGame(playerConfigs, statsCollector = null) {
  return {
    players: [
      {
        id: 0,
        name: 'Alice',
        isHuman: true,
        board: [ /* game-specific board state */ ],
        score: 0,
      },
      // ...
    ],
    currentPlayerIndex: 0,
    gamePhase: 'setup',
    gameOver: false,
    market: [ /* shared game state */ ],
    // ... any other game-wide state
  };
}
```

**Key properties:**
- **`players`** — Array of player objects (one source of truth)
- **`currentPlayerIndex`** — Turn order without fragile player references
- **`gamePhase`** — State machine: 'setup' → 'sweep' → 'place' → 'claim' → 'refill'
- **`gameOver`** — Boolean flag (checked after every action)
- Everything else **game-specific**

### Action Functions

All game actions are pure functions that mutate `gameState`:

```javascript
export function sweep(gameState, rowOrCol, isRow, declaration) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  // Validate action
  if (!isValidSweep(gameState, rowOrCol, isRow)) {
    throw new Error('Invalid sweep');
  }
  // Mutate game state
  const tiles = extractTiles(gameState.market, rowOrCol, isRow, declaration);
  currentPlayer.pendingTiles = tiles;
  gameState.gamePhase = 'place';
}

export function place(gameState, placements) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  // Validate placements
  // Mutate board
  for (const placement of placements) {
    currentPlayer.board[placement.index] = placement.tile;
  }
  gameState.gamePhase = 'claim';
}
```

**Patterns:**
- No return values (mutations only)
- Throw errors for invalid moves (let caller handle)
- Always check `gameState.gameOver` after each action
- State is always valid after a function returns

### Undo/Snapshot System

```javascript
// src/ui/main.js
function pushUndoSnapshot() {
  undoStack.push(JSON.parse(JSON.stringify(gameState)));
}

function undoAction() {
  if (undoStack.length === 0) return;
  gameState = undoStack.pop();
  updateDisplay();
}
```

Because game state is pure data (no circular references), `JSON.stringify` gives you free undo. No fancy time-travel libraries needed.

---

## UI Layer

### main.js — Game Flow

```javascript
// src/ui/main.js
import { createGame, sweep, place, claim, /* ... */ } from '../engine/game.js';
import { renderSetupScreen, updateGameDisplay, renderEndScreen } from './board.js';

let gameState = null;
let undoStack = [];

function onGameStart(playerConfigs) {
  gameState = createGame(playerConfigs);
  renderGameScreen(document.getElementById('app'), gameState, onPlayerAction);
  updateDisplay();
  
  if (allPlayersAreAI) {
    autoPlayGame();
  }
}

function onPlayerAction(action) {
  // Human player clicked something
  pushUndoSnapshot();
  try {
    // Call engine function (will mutate gameState)
    if (action.type === 'sweep') {
      sweep(gameState, action.rowOrCol, action.isRow, action.declaration);
    } else if (action.type === 'place') {
      place(gameState, action.placements);
    }
    updateDisplay();
    checkAutoAdvance();
  } catch (e) {
    alert(e.message);
  }
}

async function autoPlayGame() {
  while (!gameState.gameOver) {
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (currentPlayer.isHuman) break;
    
    const decision = await bot.makeDecision(gameState, currentPlayer.aiDifficulty);
    applyDecision(gameState, decision); // Calls engine functions
    updateDisplay();
    await new Promise(r => setTimeout(r, 500)); // Visual pause
  }
}

function updateDisplay() {
  updateGameDisplay(gameState);
}
```

**Key patterns:**
- All player input goes through numbered action handlers
- Every action is: snapshot → engine call → display update
- AI runs in async loop with pauses for visual feedback
- Game state is the single source of truth

### board.js — Rendering

```javascript
// src/ui/board.js
export function renderSetupScreen(container, onGameStart) {
  // Render player count selector, name inputs, AI difficulty picker
  // Call onGameStart(playerConfigs) when user clicks "Start"
}

export function updateGameDisplay(gameState) {
  // Render: market board, player panels, current phase instructions
  // Enable/disable buttons based on gameState.gamePhase
  // Highlight claimable cards, playable tiles, etc.
}

export function renderEndScreen(container, gameState, onRematch) {
  // Show final scores, ingredient breakdown, stats
}
```

**Render principles:**
- Never mutate game state during render
- Read from `gameState.*` to decide what to show
- Use `gameState.gamePhase` to control visibility of UI elements
- Event listeners call back to `main.js`, which mutates state and asks for re-render

---

## Styling with Design Tokens

### CSS Custom Properties (Variables)

```css
/* style.css (top) */
:root {
  /* Theme colors */
  --color-cream: #FBF5EC;
  --color-card: #FFFFFF;
  --color-accent: #C17B5C;
  --color-accent-hover: #A0624A;
  --color-text-primary: #3D2B1F;
  --color-text-secondary: #7A6050;
  --color-success: #5A8A5C;
  --color-danger: #C0392B;
  
  /* Game-specific tile colors */
  --tile-red: #E63946;
  --tile-blue: #457B9D;
  --tile-yellow: #F1FAEE;
  
  /* Sizing system (scale) */
  --tile-size: 60px;
  --tile-gap: 2px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 20px;
  
  /* Effects */
  --shadow-card: 0 2px 8px rgba(61, 43, 31, 0.12);
  --shadow-card-hover: 0 4px 12px rgba(61, 43, 31, 0.16);
}
```

**Benefits:**
- Theme-switching: swap `:root` variables for dark mode, seasonal themes, etc.
- Consistency: spacing, colors, shadows defined once
- Maintenance: change `--tile-size` globally (not 47 places)
- Responsive: update variables in media queries

### Component Naming (BEM)

```css
/* .GAME-COMPONENT__ELEMENT--MODIFIER */
.hm-tile { }                    /* Harry's Marbles tile */
.hm-tile__icon { }              /* Icon inside tile */
.hm-tile--empty { }             /* Modifier: empty state */
.hm-tile--removable { }         /* Modifier: can be removed */

.hm-board { }                   /* Player board */
.hm-board--active { }           /* Current player's board */

.hm-market { }                  /* Central market */
.hm-market__grid { }            /* Market grid container */
.hm-market__row { }             /* One row of market */
```

**Pattern:**
- Component name = `.GAME-ABBREV-COMPONENT`
- Child elements = `__child`
- Modifiers = `--modifier`
- No element selectors (easier to refactor HTML)

### Layout Grid

```css
/* Typical board game layout */
.hm-game {
  display: grid;
  grid-template-columns: 1fr 700px 1fr;  /* Left sidebar, board, right sidebar */
  gap: var(--spacing-lg);
  padding: var(--spacing-xl);
  max-width: 100%;
}

.hm-board-grid {
  display: grid;
  grid-template-columns: repeat(5, var(--tile-size));
  gap: var(--tile-gap);
  padding: var(--spacing-md);
  background: #FAFAFA;
}

.hm-tile {
  width: var(--tile-size);
  height: var(--tile-size);
  aspect-ratio: 1;
  border: 2px solid var(--color-border);
  cursor: grab;
  transition: all 0.15s ease;
}

.hm-tile:hover:not(.hm-tile--empty) {
  transform: scale(1.08);
  box-shadow: var(--shadow-card-hover);
  border-color: var(--color-accent);
}
```

---

## AI Bots

### Random Bot (Baseline)

```javascript
// src/bots/randomBot.js
export function decideSweep(gameState) {
  const validSweeps = getValidSweeps(gameState);
  return validSweeps[Math.floor(Math.random() * validSweeps.length)];
}

export function decidePlacements(gameState, player) {
  const validPlacements = getValidPlacements(player.board);
  // Shuffle and place randomly
  return shuffle(validPlacements).slice(0, player.pendingTiles.length);
}
```

### Heuristic Bot

```javascript
// src/bots/basicBot.js
export function decideSweep(gameState, difficulty) {
  const validSweeps = getValidSweeps(gameState);
  // Score each sweep by: tiles taken, ingredient types, etc.
  return validSweeps.reduce((best, sweep) => {
    const score = scoreMove(gameState, sweep);
    return score > best.score ? { move: sweep, score } : best;
  }).move;
}
```

### MCTS Bot (Optional, for Playtesting)

```javascript
// src/bots/mctsBot.js
export async function decideSweep(gameState, difficulty, progressCallback) {
  const iterations = difficulty === 'mcts-deep' ? 2000 : 500;
  const tree = new MCTSTree(gameState);
  
  for (let i = 0; i < iterations; i++) {
    tree.rollout();
    if (i % 100 === 0) progressCallback?.(i / iterations);
  }
  
  return tree.bestMove();
}
```

**Levels:**
- **Random** — baseline, fast
- **Basic** — greedy heuristics, instant
- **MCTS-Shallow** — 100 rollouts, ~100ms
- **MCTS-Deep** — 2000 rollouts, ~5s (good for playtesting)

---

## Analytics Integration

### Google Analytics 4

```html
<!-- index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-YOUR_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-YOUR_ID');
</script>
```

### Custom Events

```javascript
// src/ui/main.js
function onGameStart(playerConfigs) {
  gtag('event', 'game_start', {
    player_count: playerConfigs.length,
    ai_players: playerConfigs.filter(p => !p.isHuman).length,
    difficulties: playerConfigs.map(p => p.aiDifficulty).join(','),
  });
  
  gameState = createGame(playerConfigs);
  // ...
}

function onGameEnd() {
  gtag('event', 'game_complete', {
    duration_minutes: Math.round((Date.now() - gameStartTime) / 60000),
    winner: gameState.players[gameState.currentPlayerIndex].name,
    rounds_played: gameState.turnCount,
  });
}
```

**Metrics to track:**
- Game starts (player count, AI difficulty)
- Game completions (duration, winner)
- Feature usage (undo clicks, rules views)
- Errors (invalid moves, crashes)

### Optional: Metricool Tracking

```html
<!-- For attribution/ad tracking -->
<script>
function loadScript(a){
  var b=document.getElementsByTagName("head")[0],
      c=document.createElement("script");
  c.type="text/javascript";
  c.src="https://tracker.metricool.com/resources/be.js";
  c.onload=a;
  b.appendChild(c);
}
loadScript(function(){
  beTracker.t({hash:"YOUR_METRICOOL_HASH"})
});
</script>
```

---

## Development Workflow

### Local Development

```bash
npm run dev
# Open http://localhost:8080
# Edit code, refresh browser (files auto-serve)
```

### Testing the Game

1. **Manual play** — Set up 2–4 players (mix human/AI)
2. **AI vs AI** — Run 4 AI players, watch for emergent strategies
3. **Headless testing** — Run simulations with Node.js
4. **Balance testing** — MCTS bots reveal weak strategies

### Deployment

```bash
git add -A
git commit -m "Add [feature] to [game]"
git push origin main
# GitHub Pages auto-deploys in ~30 seconds
# Check: https://YOUR_ORG.github.io/YOUR_GAME/
```

### Browser Testing Checklist

- [ ] Setup screen responsive (mobile, tablet, desktop)
- [ ] Tiles render correctly (colors, symbols, size)
- [ ] Game board is usable (click targets big enough)
- [ ] AI moves visible and understandable
- [ ] Undo works correctly
- [ ] Scoring calculation visible and correct
- [ ] Game ends gracefully (no console errors)
- [ ] Social share cards render (test on Twitter, Facebook)

---

## Performance Tips

### Rendering
- Re-render only what changed (update `innerHTML` selectively, not entire board)
- Use `requestAnimationFrame` for animations
- Lazy-load images (tiles, card art)

### Game Logic
- Cache valid move lists (recalculate only when board changes)
- Pre-compute scoring (don't wait until game end)
- Limit MCTS iterations for slower devices (detect via performance observer)

### Deployment
- Keep CSS <100KB (compress image data URIs)
- Tree-shake unused bot code (don't ship all 3 bots if you only use 1)
- Use HTTP/2 push for critical resources

---

## File Size Baseline (Fancy That!)

- **engine/game.js**: ~4KB
- **ui/board.js**: ~12KB
- **bots/mctsBot.js**: ~6KB
- **style.css**: ~40KB
- **index.html**: <2KB
- **Total (uncompressed)**: ~65KB
- **Total (gzipped)**: ~15KB

This is small enough to load in <100ms on 4G.

---

## Checklist for New Game

- [ ] Create GitHub repository
- [ ] Set up GitHub Pages deployment
- [ ] Create `src/engine/game.js` with pure game logic
- [ ] Create `src/ui/main.js` for game flow
- [ ] Create `src/ui/board.js` for rendering
- [ ] Create `src/bots/randomBot.js` (at minimum)
- [ ] Design `style.css` with CSS variables
- [ ] Add Google Analytics to `index.html`
- [ ] Write Open Graph / Twitter Card meta tags
- [ ] Test on 2–4 players (human + AI mixes)
- [ ] Verify undo/snapshot system works
- [ ] Deploy to GitHub Pages
- [ ] Share on social media

---

## Further Reading

- **CSS Variables**: https://developer.mozilla.org/en-US/docs/Web/CSS/--*
- **ES Modules**: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
- **GitHub Pages**: https://pages.github.com/
- **Google Analytics 4**: https://analytics.google.com/
- **MCTS**: https://en.wikipedia.org/wiki/Monte_Carlo_tree_search

