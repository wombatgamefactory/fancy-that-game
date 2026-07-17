import { createGame, selectRecipe, sweep, getValidRecipes } from './src/engine/game.js';

const playerConfigs = [{ name: 'Bot 1', aiDifficulty: 'fast', isHuman: false }];
let gameState = createGame(playerConfigs);

// Select recipe
const recipes = getValidRecipes(gameState);
gameState = selectRecipe(gameState, recipes[0].id);

console.log('Attempting sweep...');
try {
  // The first valid sweep should be row 0, strawberry
  gameState = sweep(gameState, 0, true, 'strawberry');
  console.log('✓ Sweep succeeded');
  console.log('  Pending tiles:', gameState.pendingSweepTiles.length);
  console.log('  Game phase:', gameState.gamePhase);
} catch (e) {
  console.log('✗ Sweep threw error:', e.message);
}
