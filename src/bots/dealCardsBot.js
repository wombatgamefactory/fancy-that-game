// A/B ARM for the 8 August rule change, to be run against basicBot in arena.js.
//
// THE QUESTION IT ANSWERS. basicBot prices the paid 2-card deal as a lottery and
// clears it against CUPCAKE_VALUE (2 VP), and probe-dealcards-2026-08-08
// measured that bar as UNREACHABLE: at a card-locked spend step the chance that
// at least one of the two dealt cards is immediately claimable is 8-9%, worth
// about 0.33 VP, and 2.0 VP is cleared on 0.0% of steps. So basicBot never buys
// it and the action is invisible in every report.
//
// That leaves the design question open rather than answered: an immediate unlock
// is not the only thing two cards buy. They stay on the row as future targets,
// they widen what the board can be built toward, and they are two cards an
// opponent might otherwise have taken. None of that is in the lottery model.
//
// This arm is the crude test of all of it at once: BUY WHENEVER LOCKED AND
// LEGAL, ignoring value entirely. If the deferred value is real, this beats
// basicBot despite spending a cupcake on a 8.4% immediate hit rate. If it loses,
// the spend is not worth its price at any threshold a bot could pick, and the
// rule needs changing rather than the bot.
//
// Everything else is basicBot, re-exported unchanged - the arms must differ in
// exactly one decision.
export {
  decideSweep, decideBonusTile, decidePlacements, decideClaim, decideDestination,
  decideMove, decideRemovePlate,
  rankSweeps, rankBonusTiles, refreshWouldRestockBoard,
} from './basicBot.js';

import { canDealCards, getPatternMatches, CARDS_PER_DEAL, REWARD_CARDS } from '../engine/game.js';

// The VP bar the lottery has to clear before this arm buys. 0 = buy whenever
// locked, which is the crude arm described above. Set FT_DEAL_BAR to run the
// SELECTIVE arm instead: basicBot's bar is 2.0 and never fires, 0 always fires,
// and the interesting question is whether anything in between wins. The
// distribution to pick from is in probe-dealcards-2026-08-08.js - at 3 players
// a bar of 0.5 fires on 12.4% of spend steps and 1.0 on 3.0%.
const BAR = parseFloat(process.env.FT_DEAL_BAR || '0');
const CLAIM_EXTRA = 2; // basicBot's banked-sacrifice constant

export function decideDealCards(gameState) {
  if (!canDealCards(gameState)) return false;
  const player = gameState.players[gameState.currentPlayerIndex];
  const cards = gameState.cardMarket;
  for (const card of cards) {
    if (getPatternMatches(player.board, card.pattern).length > 0) return false; // not locked
  }
  if (BAR <= 0) return true;

  let matching = 0, vp = 0;
  for (const card of REWARD_CARDS) {
    if (getPatternMatches(player.board, card.pattern).length === 0) continue;
    matching++;
    vp += (card.vp || 0);
  }
  if (matching === 0) return false;
  const p = matching / REWARD_CARDS.length;
  const pHit = 1 - Math.pow(1 - p, CARDS_PER_DEAL);
  return pHit * (vp / matching + CLAIM_EXTRA) >= BAR;
}
