import { createGame, selectRecipe, getValidRecipes } from './src/engine/game.js';

// Manually implement sweep with logging
function debugSweep(gameState, rowOrCol, isRow, ingredient) {
  console.log(`\nSweep called with: rowOrCol=${rowOrCol}, isRow=${isRow}, ingredient=${ingredient}`);
  
  const market = gameState.market;
  const marketSize = gameState.marketSize;
  
  // Get tiles
  const tiles = [];
  if (isRow) {
    for (let col = 0; col < marketSize; col++) {
      tiles.push(market[rowOrCol * marketSize + col]);
    }
  } else {
    for (let row = 0; row < marketSize; row++) {
      tiles.push(market[row * marketSize + rowOrCol]);
    }
  }
  
  console.log('Tiles in sweep:', tiles.map(t => t ? t.ingredient : 'null'));
  
  const sweptTiles = [];
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile) {
      console.log(`  [${i}]: null (skipped)`);
      continue;
    }
    
    console.log(`  [${i}]: ${tile.ingredient} ${tile.ingredient === ingredient ? '✓' : '✗'}`);
    
    if (tile.ingredient === ingredient) {
      sweptTiles.push(tile);
    }
  }
  
  console.log('Total swept:', sweptTiles.length);
  return sweptTiles;
}

const playerConfigs = [
  { name: 'Bot 1', aiDifficulty: 'fast', isHuman: false },
];

let gameState = createGame(playerConfigs);

// Select first recipe
const recipes = getValidRecipes(gameState);
gameState = selectRecipe(gameState, recipes[0].id);

// Try sweeping strawberry from row 0
debugSweep(gameState, 0, true, 'strawberry');

// Try sweeping chocolate from row 0
debugSweep(gameState, 0, true, 'chocolate');
