// HOW DECISIVE IS EACH SCORING COMPONENT? The calibration ladder.
//
// "Significant but not game-breaking" needs a benchmark from THIS game rather
// than a guess. For each scoring component, this counts the share of games in
// which the winner would be a different player without it (for components the
// game already has) or with it (for the candidate board lanes). Same games, same
// measure, so the ladder is directly comparable.
//
// The reference rung is the TASTING MENU at its settled 5 VP - a module dosed
// deliberately, measured as on spec, and accepted. Whatever it reads is the
// number a new lane should be judged against.
import { createGame, sweep, takeBonusTile, declineBonusTile, takeExtraTile, place, claim, skipClaim, skipSpend, moveTile, removePlate, reserveCard, refill, calculateFinalScores, TASTING_MENU_VP, STAND_ROW_VALUES } from './src/engine/game.js';
import { INGREDIENTS, REWARD_CARDS } from './src/engine/tiles.js';
import { createStatsCollector } from './src/engine/statsCollector.js';
import * as basicBot from './src/bots/basicBot.js';
const GAMES = Number(process.argv[2] || 800);

function featureCount(board, ing) { let n = 0; for (const c of board) if (c && c.type !== 'blocked' && c.ingredient === ing) n++; return n; }

function runGame(pc) {
  const strategy = basicBot;
  let gs = createGame(Array.from({ length: pc }, (_, i) => ({ name: `P${i + 1}` })), createStatsCollector());
  let steps = 0;
  while (!gs.gameOver && steps < 6000) {
    if (gs.gamePhase === 'sweep') {
      if (gs.bonusTileAvailable) { const b = strategy.decideBonusTile(gs); gs = (b != null && gs.market[b]) ? takeBonusTile(gs, b) : declineBonusTile(gs); }
      else { const d = strategy.decideSweep(gs); if (d) gs = sweep(gs, d.rowOrCol, d.isRow, d.declaration, d.declarationType); else gs.gamePhase = 'place'; }
    }
    else if (gs.gamePhase === 'place') { const e = strategy.decideExtraTile(gs); if (e != null) gs = takeExtraTile(gs, e); gs = place(gs, strategy.decidePlacements(gs)); }
    else if (gs.gamePhase === 'spend') { const m = strategy.decideMove(gs); if (m) gs = moveTile(gs, m.fromIndex, m.toIndex); const rp = strategy.decideRemovePlate(gs); if (rp != null) gs = removePlate(gs, rp); const rc = strategy.decideReserve(gs); if (rc != null) gs = reserveCard(gs, rc); gs = skipSpend(gs); }
    else if (gs.gamePhase === 'claim') { const c = strategy.decideClaim(gs); if (c) { try { gs = claim(gs, c.cardId, c.removedBoardIndex, c.destination); } catch (e) { gs = skipClaim(gs); } } else gs = skipClaim(gs); }
    else if (gs.gamePhase === 'refill') gs = refill(gs);
    steps++;
  }
  calculateFinalScores(gs);
  return gs;
}

for (const pc of [2, 3, 4]) {
  const flip = { menus: 0, crumb: 0, maj5: 0, maj8: 0, combo5: 0, combo3: 0, count: 0 };
  const dose = { menus: 0, maj5: 0, combo5: 0, combo3: 0, count: 0 };
  for (let g = 0; g < GAMES; g++) {
    const gs = runGame(pc);
    const feature = INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
    const counts = gs.players.map(p => featureCount(p.board, feature));
    const top = Math.max(...counts);
    const maj = (v) => counts.map(c => c === top ? v : 0);
    const base = gs.players.map(p => p.score);
    const menusVP = gs.players.map(p => p.tastingMenus.length * TASTING_MENU_VP);
    const crumbVP = gs.players.map(p => p.crumbTray.length);
    const winnerOf = (arr) => { let b = -1e9, w = -1; arr.forEach((v, i) => { if (v > b) { b = v; w = i; } }); return w; };
    const actual = winnerOf(base);
    const add = (deltas) => winnerOf(base.map((v, i) => v + deltas[i])) !== actual;
    const sub = (deltas) => winnerOf(base.map((v, i) => v - deltas[i])) !== actual;
    if (sub(menusVP)) flip.menus++;
    if (sub(crumbVP)) flip.crumb++;
    if (add(maj(5))) flip.maj5++;
    if (add(maj(8))) flip.maj8++;
    if (add(counts)) flip.count++;
    if (add(counts.map((c, i) => c + maj(5)[i]))) flip.combo5++;
    if (add(counts.map((c, i) => c + maj(3)[i]))) flip.combo3++;
    const mean = (a) => a.reduce((x, y) => x + y, 0) / pc;
    dose.menus += mean(menusVP); dose.maj5 += mean(maj(5)); dose.count += mean(counts);
    dose.combo5 += mean(counts.map((c, i) => c + maj(5)[i]));
    dose.combo3 += mean(counts.map((c, i) => c + maj(3)[i]));
  }
  const p = (v) => (100 * v / GAMES).toFixed(1).padStart(5) + '%';
  const d = (v) => (v / GAMES).toFixed(2).padStart(5);
  console.log(`===== ${pc} PLAYERS, ${GAMES} games =====`);
  console.log(`  ALREADY IN THE GAME`);
  console.log(`    Tasting Menus @5 VP     dose ${d(dose.menus)}   decides ${p(flip.menus)}   <- the benchmark`);
  console.log(`    Crumb tray @1 VP        dose     -   decides ${p(flip.crumb)}`);
  console.log(`  CANDIDATES`);
  console.log(`    count only, 1/tile      dose ${d(dose.count)}   decides ${p(flip.count)}`);
  console.log(`    majority only @5        dose ${d(dose.maj5)}   decides ${p(flip.maj5)}`);
  console.log(`    majority only @8        dose     -   decides ${p(flip.maj8)}`);
  console.log(`    COMBO 1/tile + 3        dose ${d(dose.combo3)}   decides ${p(flip.combo3)}`);
  console.log(`    COMBO 1/tile + 5        dose ${d(dose.combo5)}   decides ${p(flip.combo5)}`);
  console.log('');
}
