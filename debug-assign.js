import { createGame, selectRecipe, sweep, getValidRecipes } from './src/engine/game.js';

const playerConfigs = [{ name: 'Bot 1', aiDifficulty: 'fast', isHuman: false }];
let gameState = createGame(playerConfigs);
const player = gameState.players[0];

// Select recipe
const recipes = getValidRecipes(gameState);
const selectedCard = recipes[0];
gameState = selectRecipe(gameState, selectedCard.id);

console.log('Selected recipe:', selectedCard.name);
console.log('Initial remaining:', player.activeRecipe.remaining);
console.log('Initial placed:', player.activeRecipe.placed);

// Sweep strawberry from row 0
gameState = sweep(gameState, 0, true, 'strawberry');

console.log('\nAfter sweep:');
console.log('  Phase:', gameState.gamePhase);
console.log('  Placed:', player.activeRecipe.placed);
console.log('  Remaining:', player.activeRecipe.remaining);
console.log('  Dropped tiles:', player.droppedTiles.length);
console.log('  Active recipe:', player.activeRecipe ? player.activeRecipe.card.name : 'none');
console.log('  Cards claimed:', player.claimedCards.length);
