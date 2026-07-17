import { createGame, selectRecipe, getValidSweeps, getValidRecipes } from './src/engine/game.js';

const playerConfigs = [
  { name: 'Bot 1', aiDifficulty: 'fast', isHuman: false },
];

let gameState = createGame(playerConfigs);
const player = gameState.players[0];

// Select first recipe
const recipes = getValidRecipes(gameState);
const cardId = recipes[0].id;
gameState = selectRecipe(gameState, cardId);

// Check market structure
console.log('Market size:', gameState.marketSize);
console.log('Market length:', gameState.market.length);
console.log('First row of market:');
for (let i = 0; i < gameState.marketSize; i++) {
  const tile = gameState.market[i];
  console.log(`  [${i}]:`, tile);
}

// Now manually execute sweep logic
const rowOrCol = 0;
const isRow = true;
const ingredient = 'strawberry';
const tiles = [];
for (let col = 0; col < gameState.marketSize; col++) {
  tiles.push(gameState.market[rowOrCol * gameState.marketSize + col]);
}

console.log('\nTiles in row 0:', tiles.map(t => t ? t.ingredient : 'null'));

const matching = tiles.filter(t => t && t.ingredient === ingredient);
console.log('Matching strawberry tiles:', matching.length);
