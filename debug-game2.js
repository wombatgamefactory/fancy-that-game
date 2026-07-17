import { createGame, selectRecipe, sweep, getValidSweeps, getValidRecipes } from './src/engine/game.js';
import * as fastBot from './src/bots/fastBot.js';

const playerConfigs = [
  { name: 'Bot 1', aiDifficulty: 'fast', isHuman: false },
];

let gameState = createGame(playerConfigs);
const player = gameState.players[0];

// Select first recipe
const recipes = getValidRecipes(gameState);
const cardId = recipes[0].id;
gameState = selectRecipe(gameState, cardId);

console.log('Selected recipe:', player.activeRecipe.card.name);
console.log('Needs:', player.activeRecipe.remaining);

// Get valid sweeps
const validSweeps = getValidSweeps(gameState);
console.log('\nValid sweeps:', validSweeps.length);
console.log('First 5:', validSweeps.slice(0, 5));

// Try a sweep
if (validSweeps.length > 0) {
  const firstSweep = validSweeps[0];
  console.log('\nTrying first sweep:', firstSweep);
  
  const rowTiles = firstSweep.isRow 
    ? gameState.market.slice(firstSweep.rowOrCol * gameState.marketSize, (firstSweep.rowOrCol + 1) * gameState.marketSize)
    : gameState.market.filter((_, idx) => Math.floor(idx / gameState.marketSize) === idx % gameState.marketSize && Math.floor(idx / gameState.marketSize) === firstSweep.rowOrCol);
  
  console.log('Row/col tiles:', rowTiles.map(t => t ? t.ingredient : 'null'));
  
  try {
    gameState = sweep(gameState, firstSweep.rowOrCol, firstSweep.isRow, firstSweep.ingredient);
    console.log('Swept:', gameState.pendingSweepTiles.length, 'tiles');
  } catch (e) {
    console.log('Sweep error:', e.message);
  }
}
