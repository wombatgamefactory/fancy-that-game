// TEMPORARY experiment bot (step 6 calibration). Delete when done.
// Delegates everything to tuneBot except decideOrderTea, which is swapped for
// whatever policy the current experiment is testing.
import { canOrderTea, getVisibleCupcakeSymbols } from '../engine/game.js';
export { decideSweep, decideBonusTile, decidePlacements, decideClaim, decideMove, decideTeaReserve, decideDestination, rankSweeps, rankBonusTiles } from './tuneBot.js';

const MODE = process.env.EXP_TEA || 'always';

export function decideOrderTea(gameState) {
  if (!canOrderTea(gameState)) return false;
  const pot = getVisibleCupcakeSymbols(gameState);
  if (MODE === 'always') return true;
  if (MODE === 'pot3') return pot >= 3;
  if (MODE === 'pot4') return pot >= 4;
  return true;
}
