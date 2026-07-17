import { createGame, selectRecipe, sweep, takeBonusTile, skipBonus, refill, getValidSweeps, getValidRecipes } from './src/engine/game.js';
import * as fastBot from './src/bots/fastBot.js';

const playerConfigs = [
  { name: 'Bot 1', aiDifficulty: 'fast', isHuman: false },
  { name: 'Bot 2', aiDifficulty: 'fast', isHuman: false },
];

let gameState = createGame(playerConfigs);
let turns = 0;

console.log('Starting game...\n');

for (let turn = 0; turn < 20 && !gameState.gameOver; turn++) {
  const player = gameState.players[gameState.currentPlayerIndex];
  console.log(`\nTurn ${turn}: ${player.name} (phase: ${gameState.gamePhase})`);
  console.log(`  Active recipe: ${player.activeRecipe ? player.activeRecipe.card.name : 'none'}`);
  console.log(`  Cards claimed: ${player.claimedCards.length}`);

  if (gameState.gamePhase === 'selectRecipe') {
    const recipes = getValidRecipes(gameState);
    console.log(`  Available recipes: ${recipes.length}`);
    const cardId = fastBot.selectRecipe(gameState);
    console.log(`  Bot chose card: ${cardId}`);
    if (cardId) {
      gameState = selectRecipe(gameState, cardId);
      console.log(`  Selected: ${player.activeRecipe.card.name}`);
    }
  } else if (gameState.gamePhase === 'sweep') {
    const validSweeps = getValidSweeps(gameState);
    console.log(`  Valid sweeps: ${validSweeps.length}`);
    const decision = fastBot.decideSweep(gameState);
    if (decision) {
      console.log(`  Sweeping ingredient: ${decision.ingredient}`);
      gameState = sweep(gameState, decision.rowOrCol, decision.isRow, decision.ingredient);
      console.log(`  Swept ${gameState.pendingSweepTiles.length} tiles`);
      
      if (gameState.bonusTileAvailable) {
        console.log(`  Bonus tile available!`);
        gameState = skipBonus(gameState);
      }
    } else {
      console.log(`  No valid sweep!`);
    }
  } else if (gameState.gamePhase === 'refill') {
    gameState = refill(gameState);
  }
}

console.log(`\nGame over after ${turn} turns`);
console.log('Final scores:');
for (const p of gameState.players) {
  console.log(`  ${p.name}: ${p.claimedCards.length} cards claimed`);
}
