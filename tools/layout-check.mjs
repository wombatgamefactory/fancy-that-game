// Fancy That! - responsive layout regression suite.
//
// Promoted out of the scratchpad on 4 August (../../Web UI/RESPONSIVE_PLAN_2026-08-04_v4.md
// section 9). This is no longer a measuring tape - it is the test that keeps the
// signed-off XL layout frozen while the breakpoints below it are built.
//
//   node tools/layout-check.mjs baseline   capture reference screenshots
//   node tools/layout-check.mjs check      run every criterion, diff vs baseline
//   node tools/layout-check.mjs measure    print the measurement table only
//
// Add --keep to leave the browser open, --width=N to restrict the sweep.
//
// SEVEN things about this harness are non-obvious, and each cost a round to
// rediscover the first time:
//
// 1. Playwright is installed GLOBALLY, not in this project. Hence createRequire
//    against the npm root rather than a bare import.
// 2. index.html loads src/ui/main.js as type="module", so file:// dies on CORS
//    with no useful error. Everything is served over a local HTTP server.
// 3. The engine calls Math.random() directly (game.js:636, 1042, tiles.js), so
//    an unseeded run deals a different game every time and no screenshot can be
//    compared with any other. installSeededRandom() replaces Math.random BEFORE
//    any module loads, which makes the whole game reproducible.
// 4. #phaseControls is empty and #workingArea1 is hidden unless it is a HUMAN's
//    turn in the right phase, so an all-bot game reports the phase bar as 0px.
//    Anything phase-dependent has to be measured inside a real human turn -
//    playHumanTurn() reaches one for real rather than faking it.
// 5. updatePlayerBoards clears and re-hides #workingArea1 on every render, so
//    tiles injected synthetically for measurement are wiped by the next bot move
//    a few hundred ms later and the measurement silently becomes 0.
// 6. The phone widths are measured at their REAL device height, not at the
//    1000px the desktop sweep uses. A phone is not a short desktop: page height
//    only means anything as a multiple of the screen it has to fit on, and the
//    fixed phase bar's share of the viewport is a much bigger fraction of 780px
//    than of 1000px. Every width from 768 up keeps height 1000 so that the
//    assertions signed off before 09/08/2026 measure exactly what they did then.
// 7. Below 1400 the phase bar is position: fixed, so its document coordinates
//    move with the scroll and are meaningless in a co-visibility span. It is
//    handled by SUBTRACTING its height from the available viewport instead:
//    a fixed bar is always visible, and it always covers that much of the page.

import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/Users/dean/AppData/Roaming/npm/node_modules/playwright/');
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(HERE, 'screenshots');
const BASELINE = path.join(SHOTS, 'baseline');
const CURRENT = path.join(SHOTS, 'current');
const DIFFS = path.join(SHOTS, 'diff');

// EPHEMERAL, not the fixed 8097 this used to hard-code. Two runs overlapping -
// which happens the moment anybody starts a second one before the first has
// finished, or re-runs after killing a run that left its server behind - made
// the second die on EADDRINUSE and, worse, made "kill whatever is on 8097" the
// obvious fix, which then killed a live run. Both cost a round on 09/08/2026.
// Port 0 lets the OS assign a free one, so runs cannot collide at all.
let PORT = 0;

const MODE = process.argv[2] || 'check';
const KEEP = process.argv.includes('--keep');

// The band boundaries, sampled on BOTH sides of each one, plus the two device
// widths that decide whether the S band is real.
//
// The XL/L boundary is 2181, not the 1800 in plan section 4: the frozen XL
// layout needs 2181px, so 1800-2180 could never fit it. 2400 checks that XL
// still has room to breathe above its own minimum, and 2181/2180 straddle the
// switch. 1800 is no longer a boundary and is dropped.
//
// 09/08/2026, wayfinder ticket 04: the three phone widths are appended rather
// than inserted, so the desktop sweep runs in exactly the order it always has
// and a phone width can never change what a desktop width measures. 390x844 is
// the iPhone 14/15/16 base, 430x932 the Pro Max, 360x780 the small-Android floor
// that every layout below has to survive.
const SWEEP_WIDTHS = [2400, 2181, 2180, 1920, 1700, 1400, 1399, 1366, 1280, 1150, 1149, 1024, 768, 430, 390, 360];

// Only the phones get a real device height; see note 6 in the header. Nothing at
// 768 and above may change, because its assertions were signed off at 1000.
const PHONE_HEIGHTS = { 430: 932, 390: 844, 360: 780 };
const heightFor = w => PHONE_HEIGHTS[w] ?? 1000;

// The widths that get the per-phase co-visibility walk and the per-phase tap
// audit. A fresh seeded game is started for each, so this list costs real time
// and is deliberately the phone band plus one tablet and two desktop controls.
const PHASE_WIDTHS = [430, 390, 360, 768, 1024, 1400];

// ---------------------------------------------------------------------------
// The page-height ratchet
//
// THE HEADLINE METRIC OF THE PHONE MAP. Page height is what the whole phone band
// effort is judged on, and until 09/08/2026 the harness had no line for it at
// all - it screenshotted a 3,134px page at 390 and reported nothing.
//
// These numbers are a RATCHET, not a target. The assertion is height <= budget,
// so a ticket may lower a number and must never raise one. Lowering the build
// without lowering the budget here is allowed and simply shows up as slack in
// the detail.
//
// The ticket's own stated baseline - 3,224 at 390, 2,916 at 430, 2,663 at 768 -
// was written before ticket 00 and is superseded by these.
//
// LOWERED ON 10/08/2026 BY STAGE 2, the first stage to move any of them. Stage 1
// lowered nothing because nothing fell. The set before stage 2 is on the right
// of each changed row below; every number here was measured on this harness in
// the same session, in both the open and the mid position.
//
// Where the falls come from, in two pieces:
//   - THE SEAT MARKER, worth -72 at 360, -48 at 390, -48 at 430 and -24 at 768.
//     "Player 2 (Bot)" wraps to a second line in a 96px header column; a 12px
//     person/bot icon does not. This reproduces plan section 8.7's forecast to
//     the pixel at all four widths.
//   - THE HOW TO PLAY BUTTON, worth a further -1 everywhere the band-1 title bar
//     drives the page. Its padding went 7px to 6px so that a 16px `book` icon in
//     place of a 15px emoji left the button smaller than it was rather than
//     larger. It is the only reason the M band moves at all.
// The L and XL bands do not move: at 1400 and above the page is as tall as its
// tallest COLUMN, and one pixel off the title bar disappears into that column's
// slack.
//
// LOWERED AGAIN ON 10/08/2026 BY STAGE 4, at EVERY width and in both positions -
// the first stage to move all sixteen. The painted layer was budgeted as a cost
// and came in as a refund, because the four things it deletes are all height:
//
//   - THE PANEL. A seat stops being a box, so 12px of padding a side and 1px of
//     border go with the tint and the shadow. At L, where the tallest column is
//     TWO SEATS STACKED, that is doubled.
//   - THE RULE UNDER A HEADING, and the 8px of padding that held the heading off
//     it. Worth 8 a seat, 16 a column at L, and it is the whole reason the mid
//     position at L came in at 1816 rather than 1832 - the only number in the
//     table that went the wrong way before it came off.
//   - THREE PANEL HEADINGS. "Tile Market" everywhere, "Patisserie goals" and
//     "Tasting menus" below the L band, and "End of Game Trigger - Full Board"
//     replaced by the figure it sat beside. The M band's -210 is mostly this.
//   - THE SECTION BORDERS, 2px a section over six sections.
//
// Against that, the cloth's ring is real padding on the vertical axis (2 x 10 to
// 2 x 14 per board area) and the seat rule is 10px per seat. Both are paid for
// several times over. The largest fall is at 360: 3330 to 3033.
//
// LOWERED AGAIN ON 10/08/2026 BY STAGE 5, AT THE FOUR L WIDTHS AND NOWHERE
// ELSE. The XL rows do not move and must not: XL is frozen, and stage 5's whole
// layer is capped at 2180 by a range query - proved by serving the build at 2400
// with the block stripped out and getting a byte-identical screenshot.
//
// Where the fall comes from: the L band stops being XL's two-and-two table and
// becomes three columns on one row - you, the table, and an opponent rail - so
// the 598 x 536 hole under the goal cards, which was a spanning grid item over
// two unequal rows, cannot form at all. The three rail cards also drop the full
// cake stand for the M band's one-line summary (decision 26), taking an opponent
// from 698px to 362.
//
//   open  1493 -> 1150   (-343, a quarter of the page)
//   mid   1816 -> 1515   (-301)
//
// The M and phone rows do not move either, because nothing in this stage
// reaches them: at 1399 and below the page measures exactly what it did.
//
// TARGET_SCREENS is what a phone layout should aim at rather than what it is:
// two screenfuls of scroll for a turn. Reported as a gap in the detail line, and
// deliberately NOT asserted, because failing every phone width on an aspiration
// would drown the regression signal this table exists to carry.
const TARGET_SCREENS = 2.0;
const PAGE_HEIGHT_BUDGET = {
  // The 4-player seeded OPENING position, human in seat 0, boards empty.
  open: {
    2400: 1387, 2181: 1387,                           // was 1453
    2180: 1150, 1920: 1150, 1700: 1150, 1400: 1150,   // was 1546, then 1493
    1399: 1407, 1366: 1407, 1280: 1407, 1150: 1407,   // was 1617
    1149: 2471, 1024: 2471, 768: 2471,                // was 2524
    430: 3014,  390: 3014,  360: 3033,                // was 3070 / 3085 / 3330
  },
  // MID-GAME, after one scripted human turn and the bots' replies. Taller than
  // the opening at every width except XL, because four boards now carry tiles
  // and the swept-tile trays and score breakdowns have grown with them. This is
  // the worst case a phone actually has to scroll, and it had no number at all
  // before 09/08/2026.
  mid: {
    2400: 1387, 2181: 1387,                           // was 1453
    2180: 1515, 1920: 1515, 1700: 1515, 1400: 1515,   // was 1830, then 1816
    1399: 1589, 1366: 1589, 1280: 1589, 1150: 1589,   // was 1800
    1149: 2654, 1024: 2654, 768: 2654,                // was 2707
    430: 3379,  390: 3379,  360: 3398,                // was 3435 / 3450 / 3695
  },
};

// ---------------------------------------------------------------------------
// Static server
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.csv': 'text/csv', '.ico': 'image/x-icon', '.json': 'application/json',
};

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const full = path.join(ROOT, p);
    if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(r => server.listen(PORT, () => { PORT = server.address().port; r(server); }));
}

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

// mulberry32, seeded. Installed as an init script so it is in place before
// game.js is evaluated - the reward deck is shuffled at module scope in some
// paths and a late override would come too late.
const installSeededRandom = (page, seed = 0x5EED) => page.addInitScript((s) => {
  let a = s >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}, seed);

// index.html loads CookieYes, Google Analytics and Metricool. None of them has
// anything to do with the layout, all three are wall-clock dependent, and the
// CookieYes banner can inject a fixed-position bar over the page. Blocked.
// Google FONTS are deliberately NOT blocked: Fraunces and Inter decide text
// metrics, and blocking them would measure a layout the player never sees.
//
// wombatgamefactory.com IS NO LONGER BLOCKED (defect 12, stage 2). It was in
// this list because index.html's four favicon links pointed at that host, so
// every run made four cross-origin round trips that had nothing to do with the
// layout - and blocking them meant the harness had never measured the favicon
// requests a player actually makes. The icons are local now (images/icons/), the
// block has stopped being load-bearing, and removing it makes the harness
// exercise the same request set the shipped page does.
const blockThirdParty = page => page.route('**/*', route => {
  const url = route.request().url();
  const blocked = /cookieyes|googletagmanager|google-analytics|metricool/.test(url);
  return blocked ? route.abort() : route.continue();
});

// The sweep buttons carry a "breathing" keyframe animation while a sweep is
// awaited (.ft-btn--sweep.is-awaiting, style.css:477), and card hover/claim
// glows animate too. Left running, every screenshot catches them at a different
// point in their cycle and no two runs can ever be compared. Killing animation
// is what makes the freeze check meaningful.
//
// NOT done via the reducedMotion context flag: the stylesheet's
// prefers-reduced-motion branch substitutes a DIFFERENT static appearance
// (style.css:496), so that would freeze the page into a state no player sees.
const freezeAnimations = page => page.addStyleTag({ content: `
  *, *::before, *::after {
    animation-play-state: paused !important;
    animation-delay: -1ms !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition: none !important;
    caret-color: transparent !important;
  }
` });

// ---------------------------------------------------------------------------
// Driving a game
// ---------------------------------------------------------------------------

// humanSeat0 = true leaves player 1 as the Human (the default), which is what
// every phase-dependent measurement needs. false makes it an all-bot demo.
async function startGame(page, { players = 4, humanSeat0 = true, difficulty = 'basic' } = {}) {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // The app never navigates, so one style tag in <head> outlives every re-render.
  await freezeAnimations(page);
  await page.selectOption('#playerCount', String(players));
  if (!humanSeat0) {
    await page.click('[data-player="0"][data-type="ai"]');
    await page.click(`[data-player="0"][data-difficulty="${difficulty}"]`);
  }
  for (let i = 1; i < players; i++) {
    await page.click(`[data-player="${i}"][data-difficulty="${difficulty}"]`);
  }
  await page.click('#startButton');
  await page.waitForSelector('.ft-game', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
}

const phaseOf = page => page.evaluate(() => window._gameUI?.gameState?.gamePhase ?? null);
const seatOf = page => page.evaluate(() => window._gameUI?.gameState?.currentPlayerIndex ?? null);

// Wait for the game to come back round to the human. This is what makes a
// mid-game screenshot deterministic in CONTENT: the bots' decisions are a pure
// function of a seeded state, so the position when control returns is always the
// same, even though the wall-clock time it takes to get there is not.
async function waitForHumanTurn(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const gs = window._gameUI?.gameState;
    return gs && gs.currentPlayerIndex === 0 && gs.players[0].isHuman;
  }, null, { timeout });
  await page.waitForTimeout(250);
}

// A scripted human turn: sweep row 0, take the first colour offered, place every
// swept tile on the first legal cell, confirm, skip the claim. `mode` is 'drag'
// or 'tap' - the two input paths that must both end in the same commit.
//
// `onPhase` is called once at each phase the turn passes through, with the page
// parked in that phase. Added 09/08/2026 for the co-visibility and tap-target
// tables: those have to be measured IN a phase, and a second copy of this turn
// script would be a second thing to keep in step with the engine.
async function playHumanTurn(page, { mode = 'drag', stopAfterPlacement = false, onPhase = null } = {}) {
  const at = async (name) => { if (onPhase) await onPhase(name); };
  if (await phaseOf(page) !== 'sweep') return { reached: await phaseOf(page) };
  await at('sweep');

  const rowBtn = page.locator('.market-row-btn:not([disabled])').first();
  if (await rowBtn.count() === 0) return { reached: 'no-sweep-available' };
  // A short timeout, because at the widths where the layout is still broken a
  // player panel can sit ON TOP of the market and Playwright waits forever for
  // the button to stop being intercepted. That is a real finding, not a harness
  // fault, so it is reported rather than thrown - the containment and overflow
  // criteria are what name it properly.
  try {
    await rowBtn.click({ timeout: 5000 });
  } catch {
    return { reached: 'sweep-button-obstructed', placed: 0, expected: 0 };
  }

  // .ds-opt, not .sweep-option-btn. Stage 5 replaced the two ad-hoc .ft-modal
  // sweep dialogs with one anchored .ds-dialog whose options are the actual
  // tiles the sweep would take (plan section 6.3, decision 10), and the class
  // went with the markup.
  await page.waitForSelector('.ds-opt', { timeout: 5000 });
  await page.click('.ds-opt');
  await page.waitForFunction(() => window._gameUI?.gameState?.gamePhase === 'place', null, { timeout: 5000 });
  await page.waitForTimeout(300);

  const tileCount = await page.evaluate(() => window._gameUI.gameState.pendingSweepTiles.length);
  // Measured with the tiles still in the tray, which is the state the place
  // phase actually has to be playable in.
  await at('place');

  for (let n = 0; n < tileCount; n++) {
    // Always take the lowest-numbered unplaced swept tile and the lowest-numbered
    // free cell, so the resulting board is identical between runs and modes.
    const target = await page.evaluate(() => {
      const ui = window._gameUI;
      const gs = ui.gameState;
      const placed = new Set(Object.values(ui.placementMap || {}).map(Number));
      let tileIndex = -1;
      for (let i = 0; i < gs.pendingSweepTiles.length; i++) {
        if (ui.placementMap?.[i] === undefined) { tileIndex = i; break; }
      }
      const board = gs.players[0].board;
      let boardIndex = -1;
      for (let i = 0; i < board.length; i++) {
        const blocked = board[i] && typeof board[i] === 'object' && board[i].type === 'blocked';
        if (board[i] === null && !blocked && !placed.has(i)) { boardIndex = i; break; }
      }
      return { tileIndex, boardIndex };
    });
    if (target.tileIndex < 0 || target.boardIndex < 0) break;

    const src = page.locator(`.working-tile[data-tile-index="${target.tileIndex}"]`);
    const dst = page.locator(`.board-tile[data-player="0"][data-index="${target.boardIndex}"]`);
    if (await src.count() === 0 || await dst.count() === 0) break;

    try {
      if (mode === 'drag') {
        await src.dragTo(dst, { timeout: 5000 });
      } else {
        // The tap path does not exist until Phase B. Until then this branch is
        // expected to leave the tile unplaced, and the caller reports that as a
        // skipped test rather than a failure.
        await src.click({ timeout: 5000 });
        await dst.click({ timeout: 5000 });
      }
    } catch {
      break;   // obstructed by a mis-laid-out panel; the layout criteria say so
    }
    await page.waitForTimeout(120);
  }

  const placed = await page.evaluate(() => Object.keys(window._gameUI.placementMap || {}).length);
  if (stopAfterPlacement) return { reached: 'place', placed, expected: tileCount };

  // Each of the remaining steps is best-effort for the same reason as the sweep
  // button: a broken narrow layout can bury a control, and that has to surface
  // as a reported result rather than a 30-second hang.
  const step = async (sel) => {
    const el = page.locator(sel);
    if (await el.count() === 0) return false;
    try { await el.click({ timeout: 5000 }); } catch { return false; }
    await page.waitForTimeout(300);
    return true;
  };

  if (!await step('#placementDone:not([disabled])')) {
    return { reached: 'place', placed, expected: tileCount, stuck: true };
  }
  // Each measurement is taken BEFORE the click that leaves the phase, and is
  // gated on the engine's own gamePhase rather than on the button existing, so a
  // buried control reports as a missing phase rather than as a wrong reading.
  if (await phaseOf(page) === 'spend') await at('spend');
  await step('#movePhaseNext');
  if (await phaseOf(page) === 'claim') await at('claim');
  await step('#skipClaim');
  if (await phaseOf(page) === 'refill') await at('refill');
  await step('#confirmTurn');

  return { reached: 'done', placed, expected: tileCount };
}

// ---------------------------------------------------------------------------
// The criteria
// ---------------------------------------------------------------------------

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  const tag = pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL';
  console.log(`  [${tag}] ${name}${detail ? ` - ${detail}` : ''}`);
};

// Criterion 2 (plan section 9): the headline regression guard. The page must
// never be wider than the viewport. Currently fails everywhere below 2008px.
async function checkHorizontal(page, width) {
  const r = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    // Name the widest offender, so a failure points at a selector rather than
    // just a number. Only elements that actually stick out are considered.
    worst: (() => {
      let worst = null;
      for (const el of document.querySelectorAll('.ft-game *')) {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 0.5 && (!worst || r.right > worst.right)) {
          worst = { right: Math.round(r.right), sel: el.className || el.id || el.tagName };
        }
      }
      return worst;
    })(),
  }));
  const overflow = r.scrollWidth - r.inner;
  record(
    `horizontal @ ${width}`,
    overflow <= 0,
    overflow <= 0 ? 'no overflow' : `overflows by ${overflow}px${r.worst ? `, widest: ${r.worst.sel}` : ''}`,
  );
  return overflow;
}

// Criterion 4, new in v4: the board grid is a fixed-width child of a flex column
// that is allowed to shrink below it, so at narrow widths the tiles spill outside
// their own coloured panel. Assert containment at every width.
async function checkContainment(page, width) {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const grid of document.querySelectorAll('.ft-board-grid')) {
      const panel = grid.closest('.ft-panel');
      if (!panel) continue;
      const g = grid.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      if (p.width === 0) continue;             // a hidden seat
      const overhang = Math.max(g.right - p.right, p.left - g.left);
      if (overhang > 0.5) out.push({ id: panel.id, overhang: Math.round(overhang) });
    }
    return out;
  });
  record(
    `board inside its panel @ ${width}`,
    bad.length === 0,
    bad.length === 0 ? 'all contained' : bad.map(b => `${b.id} +${b.overhang}px`).join(', '),
  );
  return bad;
}

// The 44px floor (plan B3). Below 1400 the plan stops assuming a mouse, so the
// sweep buttons - the primary control of the whole turn - have to be reachable
// with a fingertip. At XL they are 34x60 and 60x26 and are MEANT to stay that
// way, so this asserts the floor below the band boundary and the freeze above
// it: getting either wrong is a regression, in opposite directions.
async function checkTouchTargets(page, width) {
  const FLOOR = 44;
  const touchBand = width <= 1399;
  const sizes = await page.evaluate(() => {
    const one = sel => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    };
    return { row: one('.market-row-btn'), col: one('.market-col-btn') };
  });
  if (!sizes.row || !sizes.col) return record(`touch targets @ ${width}`, null, 'no sweep buttons rendered');

  // The row button is the one that must be wide enough; the column button, tall.
  // The other axis of each is a full tile and never in question.
  const rowOK = touchBand ? sizes.row.w >= FLOOR : sizes.row.w < FLOOR;
  const colOK = touchBand ? sizes.col.h >= FLOOR : sizes.col.h < FLOOR;
  record(
    `touch targets @ ${width}`,
    rowOK && colOK,
    `row ${sizes.row.w}x${sizes.row.h}, col ${sizes.col.w}x${sizes.col.h}`
      + (touchBand ? ` (need >= ${FLOOR})` : ' (XL/L: unchanged by design)'),
  );
}

// The action bar (plan 5.5). Below 1400 the phase controls are pinned to the
// bottom of the viewport, so Undo and Done stay reachable while you scroll down
// to the card row. Above 1400 they must stay in the flow, inside your own seat.
//
// Asserted against the VIEWPORT rather than by reading the computed position,
// because "is it actually on screen after scrolling to the bottom of the page"
// is the property that matters and the one that broke.
async function checkActionBar(page, width) {
  const pinned = width <= 1399;
  const r = await page.evaluate(async () => {
    const el = document.getElementById('phaseControls');
    const bar = el?.querySelector('.ft-phase-bar');
    if (!el || !bar) return null;
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const b = bar.getBoundingClientRect();
    const out = {
      position: getComputedStyle(el).position,
      bottom: Math.round(b.bottom),
      top: Math.round(b.top),
      viewport: window.innerHeight,
      zIndex: getComputedStyle(el).zIndex,
    };
    window.scrollTo(0, 0);
    return out;
  });
  if (!r) return record(`action bar @ ${width}`, null, 'no phase bar in this state');

  // Scrolled to the very bottom, the bar must be within the viewport if pinned.
  const onScreen = r.top >= 0 && r.bottom <= r.viewport + 1;
  const ok = pinned
    ? r.position === 'fixed' && onScreen && Number(r.zIndex) < 1000
    : r.position === 'static';
  record(
    `action bar @ ${width}`,
    ok,
    pinned
      ? `${r.position}, z ${r.zIndex}, bottom ${r.bottom} of ${r.viewport}`
      : `${r.position} (in flow above the M band, as designed)`,
  );
}

// Criterion 3: section 5.2's whole claim. At iPad portrait, in the place phase,
// the market grid AND the last row of your own board must both be on screen at
// once, because placement needs both. If this fails the deleted auto-scroll has
// to come back.
async function checkVertical(page) {
  const r = await page.evaluate(() => {
    const market = document.querySelector('#market');
    const cells = document.querySelectorAll('.board-tile[data-player="0"]');
    const last = cells[cells.length - 1];
    if (!market || !last) return null;
    const m = market.getBoundingClientRect();
    const l = last.getBoundingClientRect();
    return {
      marketBottom: Math.round(m.bottom), marketTop: Math.round(m.top),
      boardBottom: Math.round(l.bottom),
      viewport: window.innerHeight,
    };
  });
  if (!r) return record('market + own board co-visible @ 768x920', null, 'place phase not reached');
  const ok = r.marketTop >= 0 && r.boardBottom <= r.viewport;
  record(
    'market + own board co-visible @ 768x920',
    ok,
    `market top ${r.marketTop}, board bottom ${r.boardBottom}, viewport ${r.viewport}`,
  );
}

// Criterion 6, new 09/08/2026 (wayfinder ticket 04): PAGE HEIGHT. See the
// PAGE_HEIGHT_BUDGET comment - this is the number the phone map is scored on.
// Always printed, whether it passes or not, because the report matters as much
// as the assertion.
async function checkPageHeight(page, width, tag) {
  const r = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    viewport: window.innerHeight,
  }));
  const screens = r.height / r.viewport;
  const budget = PAGE_HEIGHT_BUDGET[tag]?.[width];
  const shape = `${r.height}px = ${screens.toFixed(2)} screens of ${r.viewport}`;
  if (budget === undefined) {
    record(`page height @ ${width} (${tag})`, null, `${shape} - no budget recorded yet`);
    return r.height;
  }
  const slack = budget - r.height;
  const target = Math.round(r.viewport * TARGET_SCREENS);
  const gap = r.height - target;
  record(
    `page height @ ${width} (${tag})`,
    r.height <= budget,
    `${shape}, budget ${budget}`
      + (slack >= 0 ? ` (${slack}px under)` : ` (${-slack}px OVER)`)
      + (gap > 0 ? `, ${gap}px above the ${TARGET_SCREENS}-screen target` : ''),
  );
  return r.height;
}

// Criterion 7, new 09/08/2026 (wayfinder ticket 04): the 44px floor applied to
// EVERYTHING a finger can hit, not just the two sweep buttons checkTouchTargets
// already guards. The map's first hard constraint is "44px minimum for anything
// a finger taps" and nothing was measuring it.
//
// The audit does not carry a selector list, because one would rot. It takes
// every visible element inside .ft-game that is either a native control or has a
// computed `cursor: pointer` - and this codebase is unusually well suited to
// that, because style.css deliberately withholds the pointer from a card that
// cannot be claimed (style.css:2181) rather than setting it unconditionally. So
// "the cursor says you may click it" is the same set as "you may click it".
//
// ONLY THE OUTERMOST tappable element counts. `cursor: pointer` inherits, so
// every span and img inside a button qualifies on its own and the first run of
// this audit reported `ft-btn-howto__icon 21x15` and `ft-btn-howto__label 71x15`
// inside a button that comfortably clears the floor. A finger cannot hit the
// label without hitting the button, so a descendant of a tappable element is
// never itself a tap target, and reporting one is noise that buries the real
// findings underneath it.
//
// Gated to the touch band. Above 1399 the XL layout is meant to have a 34x60
// sweep button and a mouse to hit it with, which checkTouchTargets asserts in
// the opposite direction.
async function checkTapTargets(page, width, tag) {
  const FLOOR = 44;
  if (width > 1399) return record(`tap targets @ ${width} (${tag})`, null, 'above the touch band, mouse assumed');

  const bad = await page.evaluate((floor) => {
    const groups = new Map();
    const root = document.querySelector('.ft-game');
    if (!root) return null;
    const tappable = (el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return false;
      if (el.disabled) return false;                   // a dead control is not a tap target
      const native = /^(BUTTON|SELECT|INPUT|TEXTAREA)$/.test(el.tagName)
        || (el.tagName === 'A' && el.hasAttribute('href'));
      return native || cs.cursor === 'pointer';
    };
    for (const el of root.querySelectorAll('*')) {
      if (!tappable(el)) continue;
      // Suppress descendants of anything already tappable.
      let anc = el.parentElement, nested = false;
      while (anc && anc !== root.parentElement) {
        if (tappable(anc)) { nested = true; break; }
        anc = anc.parentElement;
      }
      if (nested) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;       // collapsed or clipped away
      const smaller = Math.min(r.width, r.height);
      if (smaller >= floor - 0.5) continue;
      // Group by the shape of the element, not by the element, or a 5x5 board
      // reports twenty-five identical failures.
      const key = el.id
        || (el.className && String(el.className).split(/\s+/).filter(c => c && !/--(selected|active|legal|removable|ghost|hover)/.test(c)).slice(0, 2).join('.'))
        || el.tagName.toLowerCase();
      const prev = groups.get(key);
      const size = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (!prev) groups.set(key, { key, n: 1, min: smaller, size });
      else { prev.n++; if (smaller < prev.min) { prev.min = smaller; prev.size = size; } }
    }
    return [...groups.values()].sort((a, b) => a.min - b.min);
  }, FLOOR);

  if (bad === null) return record(`tap targets @ ${width} (${tag})`, null, 'no game screen rendered');
  record(
    `tap targets @ ${width} (${tag})`,
    bad.length === 0,
    bad.length === 0
      ? `every tappable element >= ${FLOOR}px on its smaller axis`
      : bad.map(b => `${b.key} ${b.size}${b.n > 1 ? ` x${b.n}` : ''}`).join(', '),
  );
  return bad;
}

// Criterion 9, new 09/08/2026 (wayfinder ticket 04): THE OPPONENT STRIP IS A
// CLIFF, NOT A GRADIENT.
//
// Ticket 00 found this the hard way. .ft-opp-strip is `display: flex` with
// `flex-wrap: wrap` (style.css:3969) and every .ft-seat inside it carries
// `min-width: max-content` (style.css:695), so a seat is exactly as wide as its
// widest unbreakable content. Give an opponent chip 26px more text and the strip
// drops from two seats a row to one, which adds a WHOLE SEAT ROW: measured at
// +245px of page height at 430 for a "Crumbs n" label.
//
// So the number tickets 05 and 07 actually need is not the strip's height, it is
// its HEADROOM - how much wider one seat may get before the row breaks. This
// reports it and fails when it drops under 20px, because at that point the strip
// is one short word away from costing a quarter of a screen and nobody adding
// the word would see it coming.
const STRIP_HEADROOM_FLOOR = 20;
async function checkOpponentStrip(page, width) {
  const r = await page.evaluate(() => {
    const strip = document.querySelector('.ft-opp-strip');
    if (!strip) return { absent: true };
    const cs = getComputedStyle(strip);
    // At XL the strip is `display: contents` and its seats are placed by the
    // grid instead, so there is no row to break.
    if (cs.display === 'contents') return { inert: 'display: contents at XL, seats are grid-placed' };
    // FROM STAGE 5 THE L BAND MAKES THE STRIP A COLUMN, and this criterion does
    // not apply to one. It measures how much wider a seat may get before the ROW
    // breaks and a whole seat row appears; a `flex-direction: column` strip with
    // the default `nowrap` has one seat per line by construction, so there is no
    // reflow to be one short word away from. Reporting 0px of headroom there
    // would be reporting a cliff that does not exist. The vertical figure that
    // does matter at L - the rail must not outgrow the centre column - is a page
    // height, and the ratchet is what carries it.
    if (cs.flexDirection.startsWith('column') || cs.flexWrap === 'nowrap') {
      return { inert: `a ${cs.flexDirection} rail: one seat per line by construction, no row to break` };
    }
    const seats = [...strip.children].filter(el => el.getBoundingClientRect().width > 0);
    if (seats.length === 0) return { absent: true };
    const inner = strip.clientWidth
      - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    const gap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0;
    const rowGap = parseFloat(cs.rowGap) || parseFloat(cs.gap) || 0;
    const rects = seats.map(el => el.getBoundingClientRect());
    // Group into rows by top edge; the widest row's count is what fits.
    const rows = new Map();
    for (const b of rects) {
      const key = Math.round(b.top);
      rows.set(key, (rows.get(key) || 0) + 1);
    }
    const perRow = Math.max(...rows.values());
    const seatW = Math.max(...rects.map(b => b.width));
    const seatH = Math.max(...rects.map(b => b.height));
    // The widest a seat could be and still fit `perRow` of them on one line.
    const maxSeatW = (inner - (perRow - 1) * gap) / perRow;
    return {
      inner: Math.round(inner), gap: Math.round(gap),
      perRow, rows: rows.size, seats: seats.length,
      seatW: Math.round(seatW), seatH: Math.round(seatH),
      headroom: Math.round(maxSeatW - seatW),
      rowCost: Math.round(seatH + rowGap),
    };
  });

  const name = `opponent strip headroom @ ${width}`;
  if (r.absent) return record(name, null, 'no opponent strip rendered');
  if (r.inert) return record(name, null, `strip cannot reflow - ${r.inert}`);
  record(
    name,
    r.headroom >= STRIP_HEADROOM_FLOOR,
    `${r.seats} seats, ${r.perRow} per row over ${r.rows} row${r.rows === 1 ? '' : 's'};`
      + ` seat ${r.seatW}px of ${r.inner}px;`
      + ` ${r.headroom}px of width headroom before it reflows, and a reflow costs ${r.rowCost}px of page height`
      + (r.headroom >= STRIP_HEADROOM_FLOOR ? '' : ` (floor ${STRIP_HEADROOM_FLOOR}px)`),
  );
  return r;
}

// Criterion 8, new 09/08/2026 (wayfinder ticket 04): CO-VISIBILITY PER PHASE.
// checkVertical below made this claim once, for one phase, at one viewport. The
// phone band needs it as a table: for each phase of a human turn, are the things
// that phase needs actually on screen together.
//
// The sets are deliberately minimal - only what the phase cannot be played
// without. Sweep pairs the market with your own board because the row you take
// is chosen against the room you have; claim pairs the cards with your own board
// because a pattern is matched against it. Refill needs the Confirm button and
// nothing else, so it is the control that proves the measurement is not simply
// failing everything.
//
// It is EXPECTED to fail at phone widths today. That is the brief for ticket 05,
// not a defect for this ticket to clear.
const PHASE_NEEDS = {
  sweep:  { needs: ['#marketContainer', '#playerPanel1 .ft-board-grid'], why: 'the market and your own board' },
  place:  { needs: ['#workingArea1', '#playerPanel1 .ft-board-grid'], why: 'the swept tiles and your own board' },
  spend:  { needs: ['#cupcakeSupply1', '#playerPanel1 .ft-board-grid'], why: 'your cupcakes and your own board' },
  claim:  { needs: ['#cardMarket', '#playerPanel1 .ft-board-grid'], why: 'the goal cards and your own board' },
  refill: { needs: [], why: 'the Confirm button alone' },
};

async function checkCoVisible(page, width, phase) {
  const spec = PHASE_NEEDS[phase];
  if (!spec) return;
  const sels = [...spec.needs, '#phaseControls .ft-phase-bar'];

  const r = await page.evaluate((selectors) => {
    window.scrollTo(0, 0);
    const boxes = [];
    const missing = [];
    let fixed = 0;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const b = el?.getBoundingClientRect();
      if (!el || !b || b.height < 1) { missing.push(sel); continue; }
      // Walk up for a fixed ancestor: the phase bar itself is static, its
      // #phaseControls parent is what goes fixed below 1400.
      let node = el, isFixed = false;
      while (node && node !== document.documentElement) {
        if (getComputedStyle(node).position === 'fixed') { isFixed = true; break; }
        node = node.parentElement;
      }
      if (isFixed) { fixed += b.height; continue; }
      boxes.push({ sel, top: Math.round(b.top + window.scrollY), bottom: Math.round(b.bottom + window.scrollY) });
    }
    return { boxes, missing, fixed: Math.round(fixed), viewport: window.innerHeight };
  }, sels);

  const name = `co-visible @ ${width} (${phase}: ${spec.why})`;
  if (r.missing.length) return record(name, null, `not rendered: ${r.missing.join(', ')}`);
  if (r.boxes.length === 0) {
    // Everything this phase needs is in the fixed bar, so it is on screen by
    // construction. Refill is the only phase that reaches here.
    return record(name, r.fixed <= r.viewport, `fixed bar ${r.fixed}px of ${r.viewport} viewport`);
  }

  const top = Math.min(...r.boxes.map(b => b.top));
  const bottom = Math.max(...r.boxes.map(b => b.bottom));
  const span = bottom - top;
  const available = r.viewport - r.fixed;
  const topEl = r.boxes.find(b => b.top === top).sel;
  const bottomEl = r.boxes.find(b => b.bottom === bottom).sel;
  record(
    name,
    span <= available,
    `span ${span}px from ${topEl} to ${bottomEl}, available ${available}px`
      + ` (${r.viewport} viewport less ${r.fixed} fixed bar)`
      + (span <= available ? ` - ${available - span}px spare` : ` - SHORT BY ${span - available}px`),
  );
}

// ---------------------------------------------------------------------------
// Screenshot diffing
//
// No image dependency: the two PNGs are decoded by a throwaway browser page and
// compared on a canvas, which also writes out a diff image with changed pixels
// flagged. Identical renders produce identical bytes, so the fast path is a
// buffer compare and the canvas only runs when something has actually moved.
// ---------------------------------------------------------------------------

async function diffPNG(browser, aPath, bPath, outPath) {
  const a = fs.readFileSync(aPath);
  const b = fs.readFileSync(bPath);
  if (a.equals(b)) return { identical: true, changed: 0, total: 0 };

  const page = await browser.newPage();
  const result = await page.evaluate(async ([aB64, bB64]) => {
    const load = src => new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
    const [ia, ib] = await Promise.all([
      load('data:image/png;base64,' + aB64),
      load('data:image/png;base64,' + bB64),
    ]);
    if (ia.width !== ib.width || ia.height !== ib.height) {
      return { sizeMismatch: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
    }
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(ia, 0, 0);
    const da = ctx.getImageData(0, 0, c.width, c.height);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(ib, 0, 0);
    const db = ctx.getImageData(0, 0, c.width, c.height);

    const out = ctx.createImageData(c.width, c.height);
    let changed = 0;
    let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
    for (let i = 0; i < da.data.length; i += 4) {
      const diff = Math.abs(da.data[i] - db.data[i])
        + Math.abs(da.data[i + 1] - db.data[i + 1])
        + Math.abs(da.data[i + 2] - db.data[i + 2]);
      const px = (i / 4) % c.width;
      const py = Math.floor((i / 4) / c.width);
      if (diff > 12) {
        changed++;
        out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 0; out.data[i + 3] = 255;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      } else {
        // Changed pixels sit on a faded copy of the new render, so a diff image
        // is readable on its own rather than being red confetti on black.
        out.data[i] = 255 - (255 - db.data[i]) * 0.25;
        out.data[i + 1] = 255 - (255 - db.data[i + 1]) * 0.25;
        out.data[i + 2] = 255 - (255 - db.data[i + 2]) * 0.25;
        out.data[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    return {
      changed,
      total: c.width * c.height,
      box: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      png: c.toDataURL('image/png').split(',')[1],
    };
  }, [a.toString('base64'), b.toString('base64')]);
  await page.close();

  if (result.sizeMismatch) return { identical: false, sizeMismatch: result.sizeMismatch };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(result.png, 'base64'));
  return { identical: false, changed: result.changed, total: result.total, box: result.box };
}

// ---------------------------------------------------------------------------
// Measurement table (plan sections 1 and 3)
// ---------------------------------------------------------------------------

async function measure(page) {
  return page.evaluate(() => {
    const box = s => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    };
    const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return {
      tokens: {
        '--tile-size': tok('--tile-size'),
        '--tile-size-opp': tok('--tile-size-opp'),
        '--centre-width': tok('--centre-width'),
        '--card-height': tok('--card-height'),
        '--score-col-min': tok('--score-col-min'),
        '--stand-plate': tok('--stand-plate'),
        '--touch-target': tok('--touch-target'),
      },
      page: { scrollWidth: document.documentElement.scrollWidth, inner: window.innerWidth },
      '.ft-game': box('.ft-game'),
      '.ft-centre': box('.ft-centre'),
      '.ft-section--tiles': box('.ft-section--tiles'),
      '#marketContainer': box('#marketContainer'),
      '.ft-board-grid': box('.ft-board-grid'),
      '#playerPanel1': box('#playerPanel1'),
      '#playerPanel3': box('#playerPanel3'),
      '.ft-player-score': box('.ft-player-score'),
      '.ft-section--cards': box('.ft-section--cards'),
      '.ft-centre-head': box('.ft-centre-head'),
      // THE TWO REVEALED-CARD PANELS on the meters rail. Both were shipped
      // unmeasured - the responsive plan's heights predate the Tasting Menu and
      // the Flavour of the Day entirely - and both sit in the protected gap
      // between the market and your own board at the M and S bands, which is the
      // one adjacency criterion 3 exists to defend. They are the first thing to
      // look at when that criterion fails.
      '#tastingMenuPanel': box('#tastingMenuPanel'),
      '#flavourPanel': box('#flavourPanel'),
      '.ft-phase-bar': box('.ft-phase-bar'),
      '#workingArea1': box('#workingArea1'),
      '.ft-panel__header': box('#playerPanel1 .ft-panel__header'),
      '.market-row-btn': box('.market-row-btn'),
      '.market-col-btn': box('.market-col-btn'),
      '.card-market-sprite': box('.card-market-sprite'),
    };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const server = await serve();
// Deterministic text rasterisation. Without these, the same glyph renders with
// slightly different antialiasing between runs (edge pixels moving by ~10 grey
// levels), which shows up as a few hundred changed pixels in an otherwise
// identical screenshot and makes the freeze check cry wolf. LCD subpixel
// antialiasing and font hinting are the two culprits; the sRGB profile stops the
// display profile leaking into the capture.
const browser = await chromium.launch({
  args: [
    // --deterministic-mode was tried here too and is NOT usable: it wedges the
    // renderer and the setup screen never becomes interactive.
    '--disable-lcd-text',
    '--font-render-hinting=none',
    '--force-color-profile=srgb',
  ],
});
const outDir = MODE === 'baseline' ? BASELINE : CURRENT;
fs.mkdirSync(outDir, { recursive: true });

console.log(`\nFancy That! layout check - mode: ${MODE}\n`);

// --- The landing page -------------------------------------------------------
// It had NO coverage until 4 August, because every other block in this file
// screenshots the page only after #startButton has been clicked - so the setup
// screen was never captured at any width. Its two media queries were then
// retuned from 860/520 to 1150/768 with nothing checking the result.
//
// It is also the first thing anybody sees, and the only screen a player reaches
// before choosing to play at all.
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => console.log('  PAGE ERROR:', e.message));
  await blockThirdParty(page);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await freezeAnimations(page);

  console.log('\nLanding page:');
  for (const width of SWEEP_WIDTHS) {
    await page.setViewportSize({ width, height: heightFor(width) });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, `landing-${width}.png`), fullPage: true });
    if (MODE === 'baseline') continue;

    const r = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - window.innerWidth;
      // The setup card and the stat strip are the two things the retuned
      // breakpoints move, so name them if something sticks out.
      let worst = null;
      for (const el of document.querySelectorAll('.ft-landing *')) {
        const b = el.getBoundingClientRect();
        if (b.right > window.innerWidth + 0.5 && (!worst || b.right > worst.right)) {
          worst = { right: Math.round(b.right), sel: el.className || el.tagName };
        }
      }
      // Every control a player has to hit before the game starts.
      const small = [];
      for (const el of document.querySelectorAll('#startButton, .ft-setup__difficulty-group button, .ft-setup__player-type button, select')) {
        const b = el.getBoundingClientRect();
        if (b.height > 0 && b.height < 44) {
          small.push(`${el.id || el.className || el.tagName} ${Math.round(b.width)}x${Math.round(b.height)}`);
        }
      }
      return { overflow, worst, small, stats: document.querySelectorAll('.ft-stat').length };
    });

    record(`landing horizontal @ ${width}`, r.overflow <= 0,
      r.overflow <= 0 ? 'no overflow' : `overflows by ${r.overflow}px${r.worst ? `, widest: ${r.worst.sel}` : ''}`);

    // The 44px floor applies to the setup screen for the same reason it applies
    // to the game: below 1400 the plan stops assuming a mouse.
    if (width <= 1399) {
      record(`landing touch targets @ ${width}`, r.small.length === 0,
        r.small.length === 0 ? 'all controls >= 44px tall' : r.small.join(', '));
    }
  }
  if (!KEEP) await page.close();
}

// --- The sweep: one seeded game, screenshotted at every width ---------------
// Reusing ONE game across the whole sweep rather than restarting per width is
// deliberate: it isolates the layout from the deal, so a difference between two
// widths is always the layout and never a different hand of cards.
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => console.log('  PAGE ERROR:', e.message));
  await installSeededRandom(page);
  await blockThirdParty(page);
  await startGame(page, { players: 4, humanSeat0: true });

  // Opening position, human to act, boards empty. Fully deterministic.
  console.log('Sweep: opening position');
  for (const width of SWEEP_WIDTHS) {
    await page.setViewportSize({ width, height: heightFor(width) });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, `open-${width}.png`), fullPage: true });
    if (MODE !== 'baseline') {
      await checkHorizontal(page, width);
      await checkContainment(page, width);
      await checkTouchTargets(page, width);
      await checkActionBar(page, width);
      await checkPageHeight(page, width, 'open');
      await checkTapTargets(page, width, 'sweep');
      await checkOpponentStrip(page, width);
    }
  }

  // Mid-game: play a scripted turn and let the bots reply. The position when
  // control returns is deterministic because the seed is.
  await page.setViewportSize({ width: 1920, height: 1200 });
  const turn = await playHumanTurn(page, { mode: 'drag' });
  // `expected` is 0 when the turn never started, so placed === expected would
  // report a blocked control as a pass. A turn only counts if it actually swept.
  record('drag path places every swept tile',
    turn.expected > 0 && turn.placed === turn.expected,
    `${turn.placed}/${turn.expected} placed, reached ${turn.reached}`);
  await waitForHumanTurn(page).catch(() => {});

  console.log('Sweep: mid-game position');
  for (const width of SWEEP_WIDTHS) {
    await page.setViewportSize({ width, height: heightFor(width) });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(outDir, `mid-${width}.png`), fullPage: true });
    // The mid-game page is the taller one - four boards carrying tiles, not four
    // empty grids - so it is the worst case the phone band has to survive, and
    // it had no number of any kind before 09/08/2026.
    if (MODE !== 'baseline') await checkPageHeight(page, width, 'mid');
  }

  if (MODE === 'measure' || MODE === 'check') {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await page.waitForTimeout(200);
    console.log('\nMeasurements @ 1920:');
    console.log(JSON.stringify(await measure(page), null, 2));
  }
  if (!KEEP) await page.close();
}

// --- The place phase at iPad portrait: criteria 3 and the phase-bar figures --
{
  const page = await browser.newPage({ viewport: { width: 768, height: 920 } });
  page.on('dialog', d => d.accept());
  await installSeededRandom(page);
  await blockThirdParty(page);
  await startGame(page, { players: 4, humanSeat0: true });
  await playHumanTurn(page, { mode: 'drag', stopAfterPlacement: true });
  await page.screenshot({ path: path.join(outDir, 'place-768x920.png'), fullPage: true });
  if (MODE !== 'baseline') {
    await checkVertical(page);
    await checkHorizontal(page, '768 (place)');
  }
  if (!KEEP) await page.close();
}

// --- The per-phase co-visibility and tap-target tables ----------------------
// New 09/08/2026 (wayfinder ticket 04). A fresh seeded game per width, walked
// through a whole human turn, measuring at every phase it passes through.
//
// hasTouch is set at 1024 and below, because these two criteria are both about
// a finger: it makes (hover: none) and (pointer: coarse) match, which is what
// the build branches its placement copy on. It does NOT move the layout - the
// stylesheet's only (hover: none) block is hover suppression (style.css:3684) -
// so this cannot quietly explain away a co-visibility number.
//
// TURN 1 IS NOT ENOUGH, and this is the trap that made the first version of this
// block report four phases instead of five. main.js's checkAutoAdvance calls
// autoSkipEmptyClaim, so the claim phase never renders on a turn where nothing
// on the player's board matches a card - and on turn 1 the board holds two tiles
// and nothing ever matches. A probe walked the seeded game turn by turn: the
// claim phase first renders on TURN 2, with three tiles down and two claimable
// cards. So the walk plays up to MAX_TURNS turns and stops the moment every
// phase has been measured once, rather than assuming one turn shows them all.
//
// EXPECTED TO FAIL at the phone widths. That is the brief for ticket 05.
if (MODE === 'check') {
  const MAX_TURNS = 4;
  const ALL_PHASES = Object.keys(PHASE_NEEDS);
  console.log('\nPer-phase co-visibility and tap targets:');
  for (const width of PHASE_WIDTHS) {
    const height = heightFor(width);
    const touch = width <= 1024;
    console.log(`\n  ${width}x${height}${touch ? ' (touch)' : ''}:`);
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch });
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => console.log('  PAGE ERROR:', e.message));
    await installSeededRandom(page);
    await blockThirdParty(page);
    await startGame(page, { players: 4, humanSeat0: true });

    const seen = new Set();
    const onPhase = async (phase) => {
      if (seen.has(phase)) return;      // measure each phase once, on its first sighting
      seen.add(phase);
      await checkCoVisible(page, width, phase);
      // The sweep phase's tap audit is already taken across every width in the
      // opening-position loop above, and refill has nothing but the bar.
      if (phase !== 'sweep' && phase !== 'refill') await checkTapTargets(page, width, phase);
    };

    let turn = { reached: 'not started', placed: 0, expected: 0 };
    let turns = 0;
    for (let t = 1; t <= MAX_TURNS && seen.size < ALL_PHASES.length; t++) {
      if (t > 1) {
        // Back round through three bots, then to the top of a fresh human turn.
        const ok = await waitForHumanTurn(page).then(() => true).catch(() => false);
        if (!ok) break;
        const swept = await page.waitForFunction(
          () => window._gameUI?.gameState?.gamePhase === 'sweep', null, { timeout: 10000},
        ).then(() => true).catch(() => false);
        if (!swept) break;
      }
      turns = t;
      turn = await playHumanTurn(page, { mode: touch ? 'tap' : 'drag', onPhase });
      if (turn.reached !== 'done') break;
    }

    record(`the turn completes @ ${width}`, turn.reached === 'done',
      `reached ${turn.reached} on turn ${turns}, ${turn.placed}/${turn.expected} placed,`
      + ` phases measured: ${[...seen].join(' ') || 'none'}`);
    for (const phase of ALL_PHASES) {
      if (!seen.has(phase)) {
        record(`co-visible @ ${width} (${phase})`, null, `phase never rendered in ${turns} turns`);
      }
    }
    if (!KEEP) await page.close();
  }
}

// --- The tap path. Phase B; expected to be unimplemented before then. -------
// Run at 1920, NOT at a tablet width: this tests the input MODE, and running it
// at a width whose layout has not been built yet would confuse "tap-to-place is
// missing" with "the control was covered by a mis-placed panel".
{
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  page.on('dialog', d => d.accept());
  await installSeededRandom(page);
  await blockThirdParty(page);
  await startGame(page, { players: 4, humanSeat0: true });
  const turn = await playHumanTurn(page, { mode: 'tap', stopAfterPlacement: true });
  const done = turn.placed === turn.expected;
  record('tap path places every swept tile', done ? true : null,
    done ? `${turn.placed}/${turn.expected}` : `${turn.placed}/${turn.expected} - tap-to-place lands in Phase B1`);
  if (!KEEP) await page.close();
}

// --- The individual tap gestures --------------------------------------------
// "The turn completed" is not enough. Each of B1's gestures is a separate claim
// and each can break on its own - and one of them (tapping an occupied cell
// while holding a tile) was silently destructive when first written, which a
// whole-turn test cannot see because the turn still finishes.
//
// Needs a sweep that yields at least TWO tiles, so seeds are tried in turn until
// one does. Anything less cannot test holding one tile while another is placed.
if (MODE === 'check') {
  console.log('\nTap gestures (plan B1):');
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, hasTouch: true });
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => console.log('  PAGE ERROR:', e.message));
  await blockThirdParty(page);

  let tiles = 0;
  for (const seed of [0x5EED, 12345, 999, 4242, 777]) {
    await installSeededRandom(page, seed);
    await startGame(page, { players: 4, humanSeat0: true });
    const rowBtn = page.locator('.market-row-btn:not([disabled])').first();
    if (await rowBtn.count() === 0) continue;
    try { await rowBtn.click({ timeout: 5000 }); } catch { continue; }
    await page.waitForSelector('.ds-opt', { timeout: 5000 });
    await page.click('.ds-opt');
    await page.waitForFunction(() => window._gameUI?.gameState?.gamePhase === 'place', null, { timeout: 5000 });
    await page.waitForTimeout(300);
    tiles = await page.evaluate(() => window._gameUI.gameState.pendingSweepTiles.length);
    if (tiles >= 2) break;
  }

  // Every gesture is followed by a real re-render, which is deferred to a
  // requestAnimationFrame by design (see commitPlacement) - hence the settle.
  const settle = () => page.waitForTimeout(250);
  const ui = () => page.evaluate(() => ({
    sel: window._gameUI.selectedTileIndex,
    map: { ...(window._gameUI.placementMap || {}) },
  }));
  const tapTile = i => page.locator(`.working-tile[data-tile-index="${i}"]`).click().then(settle);
  const tapCell = i => page.locator(`.board-tile[data-player="0"][data-index="${i}"]`).click().then(settle);

  if (tiles < 2) {
    record('tap gestures', null, `no seed produced a 2+ tile sweep (got ${tiles})`);
  } else {
    const free = await page.evaluate(() => {
      const b = window._gameUI.gameState.players[0].board;
      const out = [];
      for (let i = 0; i < b.length && out.length < 2; i++) {
        const blocked = b[i] && typeof b[i] === 'object' && b[i].type === 'blocked';
        if (b[i] === null && !blocked) out.push(i);
      }
      return out;
    });

    await tapTile(0);
    let s = await ui();
    record('tapping a swept tile arms it', s.sel === 0, `selectedTileIndex = ${s.sel}`);
    record('the armed tile is marked', await page.locator('.working-tile--selected').count() === 1);
    const targets = await page.locator('.ft-tile--tap-target').count();
    record('legal destinations are marked while armed', targets > 0, `${targets} cells`);

    await tapTile(0);
    s = await ui();
    record('tapping it again disarms', s.sel === null, `selectedTileIndex = ${s.sel}`);
    record('destination marks withdraw with the selection',
      await page.locator('.ft-tile--tap-target').count() === 0);

    await tapTile(0);
    await tapCell(free[0]);
    s = await ui();
    record('tapping an empty cell places the armed tile', s.map['0'] === free[0], JSON.stringify(s.map));
    record('the selection is released after placing', s.sel === null);
    record('the placed cell renders as a ghost',
      await page.locator(`.board-tile[data-index="${free[0]}"].ft-tile--ghost`).count() === 1);

    await tapCell(free[0]);
    s = await ui();
    record('tapping a ghost takes the tile back', Object.keys(s.map).length === 0, JSON.stringify(s.map));
    record('the returned tile is back in the swept row',
      await page.locator('.working-tile[data-tile-index="0"]').count() === 1);

    // The destructive case. Hold tile 1, tap the cell tile 0 is already in:
    // nothing may move, and in particular the held tile must survive.
    await tapTile(0);
    await tapCell(free[0]);
    await tapTile(1);
    await tapCell(free[0]);
    s = await ui();
    record('an occupied cell refuses a held tile without un-placing',
      s.sel === 1 && s.map['0'] === free[0] && s.map['1'] === undefined,
      `selectedTileIndex = ${s.sel}, map = ${JSON.stringify(s.map)}`);

    await tapCell(free[1]);
    s = await ui();
    record('the still-held tile places normally afterwards',
      s.map['1'] === free[1] && s.sel === null, JSON.stringify(s.map));
  }
  if (!KEEP) await page.close();
}

// --- The freeze check -------------------------------------------------------
if (MODE === 'check' && fs.existsSync(BASELINE)) {
  console.log('\nFreeze check vs baseline:');
  const shots = fs.readdirSync(BASELINE).filter(f => f.endsWith('.png'));
  for (const f of shots) {
    const cur = path.join(CURRENT, f);
    if (!fs.existsSync(cur)) { record(`diff ${f}`, false, 'no current shot'); continue; }
    const d = await diffPNG(browser, path.join(BASELINE, f), cur, path.join(DIFFS, f));
    if (d.identical) { record(`diff ${f}`, true, 'byte-identical'); continue; }
    if (d.sizeMismatch) { record(`diff ${f}`, false, `size changed: ${d.sizeMismatch}`); continue; }
    const pct = (d.changed / d.total * 100).toFixed(3);
    const where = d.box ? ` at ${d.box.x},${d.box.y} ${d.box.w}x${d.box.h}` : '';
    // NOISE_FLOOR exists because glyph rasterisation is not perfectly repeatable
    // even with the deterministic font flags above. It is set two orders of
    // magnitude below the smallest real layout change: moving ONE 60px tile by a
    // pixel is ~240px, and the section-1 overflow bug showed up as 16,000+. The
    // count is printed whether it passes or fails, so drift under the floor is
    // still visible rather than silently swallowed.
    const NOISE_FLOOR = Math.round(d.total * 0.0001);
    const clean = d.changed <= NOISE_FLOOR;
    record(
      `diff ${f}`,
      clean,
      `${d.changed} px changed (${pct}%)${where}${clean && d.changed ? ` - under the ${NOISE_FLOOR}px noise floor` : ''}`,
    );
  }
} else if (MODE === 'check') {
  console.log('\nNo baseline captured yet - run `node tools/layout-check.mjs baseline` first.');
}

// --- Summary ----------------------------------------------------------------
const failed = results.filter(r => r.pass === false);
const skipped = results.filter(r => r.pass === null);
console.log(`\n${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
}
console.log(`\nScreenshots: ${outDir}`);

process.exitCode = failed.length ? 1 : 0;

// SHUTTING DOWN PROPERLY, which this did not do until 09/08/2026 (wayfinder
// ticket 17 hit it, ticket 04 fixed it). `server.close()` alone only stops the
// server ACCEPTING new connections - every keep-alive socket the browser left
// open stays open, so the event loop never empties and node never exits. The
// run appeared to finish, printed its summary, and then sat there holding the
// port; a stale `layout-check.mjs measure` process was found still squatting on
// 8097 hours later, and the next run died on EADDRINUSE. closeAllConnections()
// is what actually lets the process end.
//
// The unref'd timer is the belt to that pair of braces. If the loop is already
// empty node exits at once and the timer never fires; if anything else is still
// holding it open, the run ends anyway two seconds later instead of hanging.
// Two seconds is far longer than a flush of the summary needs.
if (!KEEP) {
  await browser.close();
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
  setTimeout(() => process.exit(process.exitCode), 2000).unref();
}
