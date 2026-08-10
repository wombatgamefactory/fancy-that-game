// ---------------------------------------------------------------------------
// THE MOTION VOCABULARY (stage 8, plan section 7)
// ---------------------------------------------------------------------------
//
// FOUR MOVEMENTS, THREE EASING CURVES, AND A NAME COUNT THAT NEVER EXCEEDS FIVE
// against ticket 03's budget of twelve mid-turn and twenty-five at a boundary.
//
//   THE GATHER  a sweep: each swept tile, market cell to tray   VIEW TRANSITION
//   THE SETTLE  a placement: tray to plate, or plate to plate   FLIP, 0 names
//   THE PLATING a claim: the tile flies, the card dissolves     VIEW TRANSITION
//   THE COUNT   the score, 25ms a point                         rAF, 0 names
//
// Every duration, stagger and curve is a token in style.css section 7, declared
// by stage 3 and read back out here, so the reduced-motion branch is ONE media
// query rather than a second set of numbers in JavaScript.
//
// WHY THE MECHANISMS FALL WHERE THEY DO. The settle is FLIP because it is the
// most finger-heavy movement in the game - up to five in a row with the finger
// still on the glass - and hit testing is redirected to the document element for
// the whole of a view transition. It is also the only one of the four with no
// exit: both ends are live nodes, which is the one case where FLIP is strictly
// cheaper.
//
// NO VIEW TRANSITION EVER RUNS ON AN OPPONENT'S TURN. A bot fires six to ten
// renders and a second startViewTransition silently truncates the first, so the
// whole of a bot turn is FLIP - which also means the mid-turn name budget is
// only ever spent by the human, one movement at a time, and can never be
// contended for.
//
// NOTHING IS EVER STARTED BY A RE-RENDER. updateGameDisplay is not wrapped, not
// patched and not observed. Every movement is started by the action that caused
// it, at one of the six sites in main.js plus commitPlacement in board.js.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 0. TOKENS, READ BACK OUT OF THE STYLESHEET
// ---------------------------------------------------------------------------
// One source for the numbers. The fallbacks are the full-motion values, so a
// stylesheet that failed to load gives the vocabulary rather than nothing.
function tok(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  } catch { return fallback; }
}

export function timings() {
  return {
    gather: tok('--ft-dur-gather', 200),
    settle: tok('--ft-dur-settle', 160),
    plate: tok('--ft-dur-plate', 240),
    dissolve: tok('--ft-dur-dissolve', 180),
    stagger: tok('--ft-stagger', 20),
    bar: tok('--ft-dur-bar', 180),
    sheetIn: tok('--ft-dur-sheet-in', 220),
    sheetOut: tok('--ft-dur-sheet-out', 160),
    countMin: tok('--ft-dur-count-min', 300),
    countMax: tok('--ft-dur-count-max', 700),
    countStep: tok('--ft-count-per-point', 25),
  };
}

const EASE_TRAVEL = 'cubic-bezier(.2, 0, 0, 1)';
const EASE_ENTER = 'cubic-bezier(.05, .7, .1, 1)';
const EASE_EXIT = 'cubic-bezier(.4, 0, 1, 1)';

// FOUR STEPS AND NO MORE. A sweep takes at most five tiles, so four steps at
// 20ms is 80ms of tail on a 200ms travel: 280ms, inside ticket 03's 300ms
// ceiling for one movement.
const STAGGER_STEPS = 4;

// Ticket 03, measured. Above 25 named elements a transition costs more than
// 100ms of frozen, unclickable page on a mid-range phone.
const BUDGET_MIDTURN = 12;
const BUDGET_BOUNDARY = 25;

export function reduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// ---------------------------------------------------------------------------
// 1. IDENTITY
// ---------------------------------------------------------------------------
// A tile is a value object WITH DUPLICATES - generateTileTypes makes
// {colour, ingredient} and createTileBag pushes five shallow copies of each - so
// a name derived from the data collides, and a duplicate name drops the WHOLE
// transition. Reference identity survives every engine hand-off, so a WeakMap
// keyed on the object is enough and it needs no engine change.
//
// It does NOT survive a JSON round trip, which is why the first render after an
// undo or a resume is plain: every tile is a new object and every name would
// change at once.
const tileIds = new WeakMap();
let nextTileId = 0;
export function tileName(tile) {
  if (!tile || typeof tile !== 'object') return null;
  let id = tileIds.get(tile);
  if (id === undefined) { id = ++nextTileId; tileIds.set(tile, id); }
  return `ft-t-${id}`;
}

// ---------------------------------------------------------------------------
// 2. THE DYNAMIC STYLESHEET
// ---------------------------------------------------------------------------
// A view transition is selected by NAME and the names are minted at run time, so
// the per-movement timings and the stagger delays have to be written per
// movement. It is also the only honest way to express a stagger: one
// animation-delay per name.
let dynSheetEl = null;
function dynSheet() {
  if (dynSheetEl && dynSheetEl.isConnected) return dynSheetEl;
  dynSheetEl = document.createElement('style');
  dynSheetEl.id = 'ft-motion-dyn';
  document.head.appendChild(dynSheetEl);
  return dynSheetEl;
}

const DYN_HEAD = [
  '@keyframes ft-vt-dissolve{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(.94)}}',
  '@keyframes ft-vt-bar-out{to{opacity:0;transform:translateX(-8px)}}',
  '@keyframes ft-vt-bar-in{from{opacity:0;transform:translateX(8px)}}',
  '@keyframes ft-vt-sheet-in{from{transform:translateY(100%)}}',
  '@keyframes ft-vt-sheet-out{to{transform:translateY(100%)}}',
  '@keyframes ft-vt-fade-out{to{opacity:0}}',
  '@keyframes ft-vt-fade-in{from{opacity:0}}',
  // The root snapshot is the tax on using the API at all - 16 to 24ms even with
  // nothing named. Keep its cross-fade short so it is never what the player is
  // waiting on. It is also what carries the tea flush: 58 elements cross-fading
  // as ONE gesture for zero names (section 7.6, item 4).
  '::view-transition-group(root){animation-duration:160ms}',
].join('\n');

// A travelling thing that looks the SAME at both ends is a pure move: kill the
// image pair's blending and its cross-fade and only the group transform is
// left. That is also what keeps the movement on transform alone, since the
// group's own default morphs width and height (section 7.6, item 8).
function ruleTravel(name, d, delay) {
  return `::view-transition-group(${name}){animation-duration:${d}ms;`
    + `animation-timing-function:${EASE_TRAVEL};animation-delay:${delay}ms}\n`
    + `::view-transition-image-pair(${name}){isolation:auto}\n`
    + `::view-transition-old(${name}),::view-transition-new(${name})`
    + '{animation:none;mix-blend-mode:normal;display:block}';
}

// THE REDUCED SUBSTITUTE IS THE SAME TRANSITION WITH THE TRAVEL REMOVED, not
// silence. The group jumps to its new position and the two snapshots cross-fade
// there, at the reduced duration, KEEPING THE STAGGER - five things arriving one
// after another is a count, and a count is information rather than movement.
function ruleTravelReduced(name, d, delay) {
  return `::view-transition-group(${name}){animation:none}\n`
    + `::view-transition-old(${name}){animation:ft-vt-fade-out ${d}ms linear ${delay}ms both}\n`
    + `::view-transition-new(${name}){animation:ft-vt-fade-in ${d}ms linear ${delay}ms both}`;
}

// The claimed card leaves for good - claimed cards are counted, never drawn
// again - so it dissolves where it stands rather than flying at a number.
function ruleDissolve(name, d) {
  return `::view-transition-group(${name}){animation-duration:${d}ms}\n`
    + `::view-transition-old(${name}){animation:ft-vt-dissolve ${d}ms ${EASE_EXIT} both;`
    + 'transform-origin:50% 50%}';
}

function ruleBar(d, red) {
  if (red) {
    return `::view-transition-group(ft-phase-bar){animation:none}\n`
      + `::view-transition-old(ft-phase-bar){animation:ft-vt-fade-out ${d}ms linear both}\n`
      + `::view-transition-new(ft-phase-bar){animation:ft-vt-fade-in ${d}ms linear both}`;
  }
  return `::view-transition-group(ft-phase-bar){animation-duration:${d}ms}\n`
    + `::view-transition-old(ft-phase-bar){animation:ft-vt-bar-out ${d}ms ${EASE_EXIT} both}\n`
    + `::view-transition-new(ft-phase-bar){animation:ft-vt-bar-in ${d}ms ${EASE_ENTER} both}`;
}

function ruleSheet(dIn, dOut, red) {
  if (red) {
    return `::view-transition-group(ft-sheet){animation:none}\n`
      + `::view-transition-new(ft-sheet){animation:ft-vt-fade-in ${dIn}ms linear both}\n`
      + `::view-transition-old(ft-sheet){animation:ft-vt-fade-out ${dOut}ms linear both}`;
  }
  return `::view-transition-new(ft-sheet){animation:ft-vt-sheet-in ${dIn}ms ${EASE_ENTER} both}\n`
    + `::view-transition-old(ft-sheet){animation:ft-vt-sheet-out ${dOut}ms ${EASE_EXIT} both}`;
}

// ---------------------------------------------------------------------------
// 3. THE VIEW TRANSITION RUNNER
// ---------------------------------------------------------------------------
// One at a time, started by an action and never by a re-render, with the budget
// enforced rather than hoped for.
let running = false;
let tagged = [];
const idleQueue = [];

export function isRunning() { return running; }

// The save write, and anything else that must not sit on the animation's
// critical path, goes through here: it runs now if nothing is in flight and on
// `finished` if something is.
export function onIdle(fn) {
  if (!running) { fn(); return; }
  idleQueue.push(fn);
}
function drainIdle() {
  while (idleQueue.length) {
    const fn = idleQueue.shift();
    try { fn(); } catch { /* a deferred job never breaks a movement */ }
  }
}

export const motionStats = {
  movements: 0,
  freezes: [],
  maxNames: 0,
  maxNamesKind: '',
  budgetTrims: 0,
  flips: 0,
  haptics: 0,
  counts: 0,
  lines: [],
};

function nameEl(el, name) {
  if (!el || !name) return false;
  el.style.viewTransitionName = name;
  tagged.push(el);
  return true;
}

function clearNames() {
  for (const el of tagged) {
    try { el.style.viewTransitionName = ''; } catch { /* detached */ }
  }
  tagged = [];
}

/* plan = {
     kind:     'gather' | 'plate' | 'sheet'
     boundary: true for a turn boundary (budget 25 rather than 12)
     travel:   [{ name, old(), neu() }]   things that move
     dissolve: [{ name, old() }]          things that leave for good
     bar:      true                       include the phase bar
     scrollTo: () => Element              bring the destination on screen first
     mutate:   () => void                 THE ACTION. Always runs, transition or not.
     after:    () => void                 once the movement has finished
   } */
export function runTransition(plan) {
  const t = timings();
  const budget = plan.boundary ? BUDGET_BOUNDARY : BUDGET_MIDTURN;

  // Every path that is not a live, idle view transition falls through to the
  // action itself. A movement is never the reason a turn does not happen.
  if (!document.startViewTransition || running) {
    plan.mutate();
    if (plan.after) plan.after();
    return;
  }

  // THE BUDGET IS ENFORCED HERE, IN PRIORITY ORDER: travel first, because a
  // thing that moves is the movement; then the one thing that leaves; then the
  // phase bar.
  let travel = plan.travel || [];
  const dissolve = plan.dissolve || [];
  const wanted = travel.length + dissolve.length + (plan.bar ? 1 : 0);
  if (wanted > budget) {
    const keep = budget - dissolve.length - (plan.bar ? 1 : 0);
    travel = travel.slice(0, Math.max(0, keep));
    motionStats.budgetTrims++;
  }
  const names = travel.length + dissolve.length + (plan.bar ? 1 : 0);
  if (names > motionStats.maxNames) {
    motionStats.maxNames = names;
    motionStats.maxNamesKind = plan.kind;
  }

  // MOTION AS WAYFINDING, NOT DECORATION. The canvas is more than one screen on
  // a phone, so a movement whose destination is off screen teaches nothing.
  // Scroll to it FIRST, instantly, so the scroll is never a second competing
  // motion, and only then move.
  if (plan.scrollTo) {
    try {
      const dest = plan.scrollTo();
      if (dest && dest.getBoundingClientRect) {
        const r = dest.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) {
          dest.scrollIntoView({ block: 'nearest', behavior: 'auto' });
        }
      }
    } catch { /* a scroll is never worth losing the action for */ }
  }

  const red = reduced();
  const d = plan.kind === 'plate' ? t.plate : plan.kind === 'sheet' ? t.sheetIn : t.gather;
  const css = [DYN_HEAD];
  const used = Object.create(null);

  travel.forEach((m, i) => {
    if (used[m.name]) return;         // a duplicate name drops the WHOLE transition
    used[m.name] = 1;
    const delay = Math.min(i, STAGGER_STEPS) * t.stagger;
    css.push(red ? ruleTravelReduced(m.name, d, delay) : ruleTravel(m.name, d, delay));
  });
  dissolve.forEach(m => {
    if (used[m.name]) return;
    used[m.name] = 1;
    css.push(ruleDissolve(m.name, t.dissolve));
  });
  if (plan.bar) css.push(ruleBar(t.bar, red));
  if (plan.kind === 'sheet') css.push(ruleSheet(t.sheetIn, t.sheetOut, red));
  dynSheet().textContent = css.join('\n');

  // Tag the OLD state. The names have to be on the live nodes before the
  // callback runs, because that is when the old snapshots are taken.
  clearNames();
  const applied = Object.create(null);
  const claim = (m) => {
    if (applied[m.name]) return;
    applied[m.name] = 1;              // claimed even with no OLD: a sheet arriving has only a NEW
    const el = m.old && m.old();
    if (el) nameEl(el, m.name);
  };
  travel.forEach(claim);
  dissolve.forEach(claim);
  if (plan.bar) nameEl(phaseBarEl(), 'ft-phase-bar');

  running = true;
  motionStats.movements++;
  const t0 = performance.now();
  let vt;
  try {
    vt = document.startViewTransition(() => {
      plan.mutate();
      // Tag the NEW state synchronously inside the callback. The engine's
      // mutation and board.js's render are both synchronous, so the new DOM
      // exists by here.
      const seen = Object.create(null);
      travel.forEach(m => {
        if (!applied[m.name] || seen[m.name]) return;
        seen[m.name] = 1;
        const el = m.neu && m.neu();
        if (el) nameEl(el, m.name);
      });
      if (plan.bar) nameEl(phaseBarEl(), 'ft-phase-bar');
    });
  } catch {
    running = false;
    clearNames();
    plan.mutate();
    if (plan.after) plan.after();
    drainIdle();
    return;
  }

  vt.ready.then(() => {
    motionStats.freezes.push({ kind: plan.kind, names, ms: Math.round((performance.now() - t0) * 10) / 10 });
  }).catch(() => {
    // A duplicate name rejects `ready` with InvalidStateError and drops the
    // transition. The callback still ran, so the state is correct and only the
    // animation is lost - but the names must never be left in the DOM.
    motionStats.freezes.push({ kind: plan.kind, names, ms: -1 });
  });

  vt.finished.finally(() => {
    running = false;
    clearNames();
    if (plan.after) { try { plan.after(); } catch { /* never breaks the turn */ } }
    drainIdle();
  });
}

// ---------------------------------------------------------------------------
// 4. THE FLIP RUNNER
// ---------------------------------------------------------------------------
// A clone, position: fixed, animated on transform and opacity only, removed on
// arrival. pointer-events: none, so it can never delay the next input.
export function flyClone(sourceRect, destRect, opts = {}) {
  const t = timings();
  const d = opts.duration || t.settle;
  const node = opts.node;
  if (!node || !sourceRect || !destRect) return null;
  node.classList.add('ft-flip');
  node.style.width = `${sourceRect.width}px`;
  node.style.height = `${sourceRect.height}px`;
  document.body.appendChild(node);
  motionStats.flips++;

  const s = destRect.width && sourceRect.width ? destRect.width / sourceRect.width : 1;
  const from = `translate(${sourceRect.left}px, ${sourceRect.top}px)`;
  const to = `translate(${destRect.left + (destRect.width - sourceRect.width) / 2}px, `
    + `${destRect.top + (destRect.height - sourceRect.height) / 2}px) scale(${s})`;

  // TRAVEL REMOVED, NOT SILENCE: under reduced motion the clone appears at the
  // destination and fades up, so the arrival still happens and a staggered set
  // still counts, but nothing crosses the screen.
  const frames = reduced()
    ? [{ transform: to, opacity: 0 }, { transform: to, opacity: 1 }]
    : [{ transform: from, opacity: 1 }, { transform: to, opacity: opts.fadeOut ? 0 : 1 }];

  let anim;
  try {
    anim = node.animate(frames, {
      duration: d,
      delay: opts.delay || 0,
      easing: reduced() ? 'linear' : EASE_TRAVEL,
      fill: 'both',
    });
  } catch { node.remove(); return null; }
  anim.finished.then(() => node.remove()).catch(() => node.remove());
  return anim;
}

// A travelling tile is a LIFTED tile (ticket 09), so it carries the cast shadow
// for the flight and lands flat. That rule is inherited from the tile treatment,
// not invented here, and it lives in .ft-flip in style.css.
export function tileClone(tile, colourClass) {
  const el = document.createElement('div');
  el.className = `ft-tile ${colourClass || ''}`;
  if (tile && tile.ingredient) {
    const img = document.createElement('img');
    img.src = `images/symbol-${tile.ingredient}-v3.png`;
    img.className = 'ft-tile__icon';
    img.alt = '';
    el.appendChild(img);
  }
  return el;
}

// ---------------------------------------------------------------------------
// 5. DOM HANDLES
// ---------------------------------------------------------------------------
function ui() { return window._gameUI; }
function gs() { const u = ui(); return u && u.gameState; }
export function phaseBarEl() { return document.querySelector('#phaseControls .ft-phase-bar'); }
export function marketCell(i) { return document.querySelector(`#market .market-tile[data-index="${i}"]`); }
export function boardCell(p, i) { return document.querySelector(`.board-tile[data-player="${p}"][data-index="${i}"]`); }
export function cardEl(id) { return document.querySelector(`[data-card-id="${id}"]`); }

export function trayTileFor(gameState, tile) {
  const list = gameState.pendingSweepTiles || [];
  for (let k = 0; k < list.length; k++) {
    if (list[k] === tile) {
      return document.querySelector(`#workingArea1 .working-tile[data-tile-index="${k}"]`);
    }
  }
  return null;
}

// The stand is rendered top row first, so DOM order is the reverse of the
// engine's row index.
export function standPlate(gameState, playerIdx, rowIndex) {
  const root = document.getElementById(`playerScore${playerIdx + 1}`);
  if (!root) return null;
  const rows = root.querySelectorAll('.ft-stand__row');
  const standLen = gameState.players[playerIdx].stand.length;
  const row = rows[standLen - 1 - rowIndex];
  if (!row) return null;
  const filled = row.querySelectorAll('.ft-stand__plate--filled');
  return filled[filled.length - 1] || row;
}

// The engine's own matcher, six lines of it, so the names can be minted BEFORE
// the mutation. getTileIndex is (row * size) for a row and (col) for a column;
// the step is 1 along a row and `size` down a column.
export function predictSweep(gameState, rowOrCol, isRow, declaration, declarationType) {
  const n = gameState.marketSize;
  const base = isRow ? rowOrCol * n : rowOrCol;
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = base + (isRow ? i : i * n);
    const tile = gameState.market[idx];
    if (!tile) continue;
    const v = declarationType === 'colour' ? tile.colour : tile.ingredient;
    if (v === declaration) out.push(idx);
  }
  return out;
}

export function isHumanTurn(gameState) {
  const g = gameState || gs();
  if (!g) return false;
  const p = g.players[g.currentPlayerIndex];
  return !!(p && p.isHuman);
}

// ---------------------------------------------------------------------------
// 6. HAPTICS (plan section 7.4)
// ---------------------------------------------------------------------------
// TWO EVENTS. ANDROID ONLY. THE LIST DOES NOT GROW.
//
//   land   a tile settling on YOUR OWN board. One 10ms tick.
//   claim  a claim resolving. Two ticks - the only two-part pattern in the
//          build, so it cannot be mistaken for a landing.
//
// `navigator.vibrate` only, in a try, WITH NO FEATURE TEST: the spec permits
// `true` on a device that cannot vibrate and Firefox for Android returns true
// and does nothing, so there is no user-agent test anywhere in this file. iOS
// gets nothing and that is permanent - WebKit deleted its implementation in 2017
// and its standards position is `oppose` - which is why nothing in the
// vocabulary is legible through haptics alone.
//
// Suppressed under prefers-reduced-motion. There is no prefers-reduced-haptics
// and Media Queries 5 has no haptics feature at all, so this is A POLICY, taken
// deliberately rather than inherited from a signal the player sent.
const PATTERN = { land: 10, claim: [10, 60, 18] };
let lastBuzz = 0;

// THE GATE IS SHARED WITH THE SOUND WORLD RATHER THAN COPIED (plan section
// 13.5), so the two channels can never disagree about how many things happened.
export function gatePassed() {
  const now = performance.now();
  if (now - lastBuzz < 120) return false;
  lastBuzz = now;
  return true;
}

export function haptic(kind) {
  if (reduced()) return;
  if (!isHumanTurn()) return;
  motionStats.haptics++;
  try {
    if (navigator.vibrate) navigator.vibrate(PATTERN[kind]);
  } catch { /* a buzz is never worth an exception */ }
}

// ---------------------------------------------------------------------------
// 7. THE COUNT (plan section 7.1, movement four)
// ---------------------------------------------------------------------------
// Neither mechanism: a number tweened on requestAnimationFrame.
//
// THE PROBLEM: updateStats rewrites the whole score panel on every render, so a
// count started against a node is interrupted within a frame or two.
//
// THE FIX: the displayed score is A UI-OWNED VALUE THAT CHASES THE ENGINE'S. One
// rAF loop holds `shown` per seat and re-asserts it into whatever node is
// currently there, so a re-render cannot interrupt a count - the count does not
// live in the DOM.
//
// ANY NUMBER BUT THE SCORE IS FORBIDDEN (section 7.6, item 6). One counting
// number on the screen, or the eye does not know which to follow.
const shown = {};
const tween = {};
let onCountStart = null;

// The sound world's fourth cue rides on this, so it is registered rather than
// imported: motion does not depend on sound, sound depends on motion.
export function setCountListener(fn) { onCountStart = fn; }

function totalNode(p) {
  const root = document.getElementById(`playerScore${p + 1}`);
  return root ? root.querySelector('.ft-score-total') : null;
}

export function readTotal(p) {
  const el = totalNode(p);
  if (!el) return null;
  const m = (el.getAttribute('data-ft-true') || el.textContent || '').match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

const easeOutCubic = x => 1 - (1 - x) ** 3;

function tickCount(now) {
  const g = gs();
  if (!g) return;
  const t = timings();
  for (let p = 0; p < g.players.length; p++) {
    const el = totalNode(p);
    if (!el) continue;

    // A node with no stamp is a node the render has just made, so its text is
    // the truth. Stamp it before overwriting, once.
    let truth;
    if (!el.hasAttribute('data-ft-true')) {
      const m = (el.textContent || '').match(/-?\d+/);
      truth = m ? parseInt(m[0], 10) : 0;
      el.setAttribute('data-ft-true', String(truth));
    } else {
      truth = parseInt(el.getAttribute('data-ft-true'), 10);
    }

    if (shown[p] === undefined) shown[p] = truth;

    if (!tween[p] && shown[p] !== truth) {
      const delta = Math.abs(truth - shown[p]);
      // 25ms a point, floored so one point is still catchable and capped so
      // nothing is ever still counting when the next thing happens. It blocks
      // nothing: it writes one text node.
      let dms = Math.min(t.countMax, Math.max(t.countMin, t.countMin + t.countStep * delta));
      if (reduced()) dms = Math.min(tok('--ft-dur-count-max', 350), dms);
      tween[p] = { from: shown[p], to: truth, t0: now, dur: dms };
      motionStats.counts++;
      if (onCountStart) {
        try { onCountStart(p, truth - shown[p], dms); } catch { /* never breaks the count */ }
      }
    }

    if (tween[p]) {
      const tw = tween[p];
      if (tw.to !== truth) tw.to = truth;          // a second claim while counting
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      shown[p] = Math.round(tw.from + (tw.to - tw.from) * easeOutCubic(k));
      if (k >= 1) { shown[p] = tw.to; tween[p] = null; }
    }

    // Rewrite only the leading number, so the cupcakes span survives.
    const want = String(shown[p]);
    const first = el.firstChild;
    if (first && first.nodeType === 3) {
      const next = first.nodeValue.replace(/-?\d+/, want);
      if (next !== first.nodeValue) first.nodeValue = next;
    }

    // THE YOU CHIP'S TICK BECOMES THE COUNT (stage 7 handed this over). Stage 7
    // gave the chip a wash like the other four; the score is one of the four
    // movements and the chip is where the score is now read, so the two would
    // have been two announcements of one event. The rail is seat 0's by
    // construction - railReadings reads players[0] - so this is the one mirror.
    if (p === 0) {
      const chipFig = document.querySelector('.pm-chip[data-pm-chip="stand"] .pm-chip__fig');
      if (chipFig && chipFig.textContent !== want) chipFig.textContent = want;
    }
  }
}

export function countShown(p) { return shown[p]; }

// A resume, an undo and a new game all replace every object in the game, so the
// count starts again from the truth rather than counting from a stale seat.
export function resetCount() {
  for (const k of Object.keys(shown)) delete shown[k];
  for (const k of Object.keys(tween)) delete tween[k];
}

// ---------------------------------------------------------------------------
// 8. THE PULSE CAP (plan section 7.2)
// ---------------------------------------------------------------------------
// ONE PULSE PER MEANING, and where several elements share a meaning THE BREATH
// MOVES TO THE SMALLEST CONTAINER THAT HOLDS THEM ALL. The ring itself stays on
// every member, because the ring is what carries the meaning under desaturation
// and the count of rings must never depend on the pulse; only the breath moves.
//
// This is the single largest measured win in the vocabulary: the shipped build
// ran 35 infinite animations with the paid extra tile armed, and this makes it
// one.
//
// Two groups can share a container, so the decision is taken PER CONTAINER after
// every group has been counted - otherwise the second group's `else` undoes the
// first.
export function capRings() {
  const groups = [
    { members: document.querySelectorAll('.ft-tile--buyable'), container: document.getElementById('market') },
    { members: document.querySelectorAll('.ft-card--claimable'), container: document.getElementById('cardMarket') },
  ];
  const want = new Map();
  for (const grp of groups) {
    if (!grp.container) continue;
    if (!want.has(grp.container)) want.set(grp.container, false);
    if (grp.members.length > 1) {
      want.set(grp.container, true);
      grp.members.forEach(el => el.classList.add('ft-ring--quiet'));
    }
  }
  for (const [container, on] of want) {
    container.classList.toggle('ft-ring-region', on);
  }
}

export function countInfinite() {
  let n = 0;
  try {
    for (const a of document.getAnimations()) {
      const timing = a.effect && a.effect.getComputedTiming && a.effect.getComputedTiming();
      if (timing && timing.iterations === Infinity) n++;
    }
  } catch { /* getAnimations is not everywhere */ }
  return n;
}

export function namesInDom() {
  return document.querySelectorAll('[style*="view-transition-name"]').length;
}

// ---------------------------------------------------------------------------
// 9. THE OPPONENT'S TURN, AND ITS ONE LINE OF LOG (plan section 7.5)
// ---------------------------------------------------------------------------
// The driver already pauses 500ms between bot actions and spends it on nothing,
// so every movement fits inside that pause and a bot turn is not one millisecond
// slower than it is today. BOTS DO NOT GET SLOWER MOTION: a followable turn is
// one where the actions are separated in time, and the pause already does that.
//
// THE MARKET IS ANIMATED - it is shared and full size, so what a bot TOOK is
// worth following. THEIR BOARD IS NOT: an opponent's tile is 14px on a phone and
// a 14px tile crossing the screen is not followable, so where they PUT it is not
// animated at all. A bot's claim is the row reflowing and their score counting
// up; no flight, because a flight that ends where the eye cannot land teaches
// nothing.
//
// AND ONE LINE OF LOG, BECAUSE MOTION CANNOT SAY WHICH. The single most
// important fact of an opponent's sweep is the declaration - pink, or lemon -
// and no flight carries it. It takes the phase bar's own instruction slot, which
// on an opponent's turn is addressed to a player who has nothing to do, so it
// costs NO HEIGHT; it persists until the next action replaces it rather than
// timing out; it never speaks on your own turn; and it is one line, never two.
let census = null;

function takeCensus(g) {
  if (!g || !g.players) return null;
  return {
    cur: g.currentPlayerIndex,
    market: g.market.map(t => (t ? 1 : 0)),
    cards: (g.cardMarket || []).map(c => c.id).join(','),
  };
}

export function watchOpponent(gameState) {
  const g = gameState;
  const now = takeCensus(g);
  if (!now) { census = null; return; }
  const last = census;
  census = now;
  if (!last) return;
  if (isHumanTurn(g)) return;

  // The gather, for a bot: what left the shared market, flying to the seat that
  // took it. Clones only - nothing named, nothing frozen.
  const gone = [];
  for (let i = 0; i < now.market.length; i++) {
    if (last.market[i] && !now.market[i]) gone.push(i);
  }
  if (gone.length && gone.length <= 6) {
    const seat = document.getElementById(`playerPanel${g.currentPlayerIndex + 1}`);
    const seatRect = seat && seat.getBoundingClientRect();
    if (seatRect && seatRect.width) {
      const t = timings();
      const target = {
        left: seatRect.left + seatRect.width / 2 - 22,
        top: seatRect.top + Math.min(24, seatRect.height / 2),
        width: 44, height: 44,
      };
      gone.forEach((idx, k) => {
        const cell = marketCell(idx);
        if (!cell) return;
        const cls = Array.from(cell.classList).find(c => c.startsWith('ft-colour-')) || '';
        flyClone(cell.getBoundingClientRect(), target, {
          node: tileClone(null, `ft-colour ${cls}`),
          duration: t.gather,
          delay: Math.min(k, STAGGER_STEPS) * t.stagger,
          fadeOut: true,
        });
      });
      noteLine(`${plainName(g, g.currentPlayerIndex)} swept ${gone.length} tile${gone.length === 1 ? '' : 's'}.`);
    }
  }

  if (last.cards && now.cards !== last.cards) {
    const before = last.cards.split(',').filter(Boolean);
    const after = new Set(now.cards.split(',').filter(Boolean));
    const lost = before.filter(id => !after.has(id));
    if (lost.length === 1) noteLine(`${plainName(g, g.currentPlayerIndex)} claimed a patisserie goal.`);
  }
}

function plainName(g, i) {
  const n = g.players[i] && g.players[i].name;
  return n ? n.replace(/\s*\(.*\)\s*$/, '') : `Player ${i + 1}`;
}

let logText = '';
export function noteLine(text) {
  if (!text || text === logText) return;
  logText = text;
  motionStats.lines.push(text);
  paintLine();
}

export function currentLine() { return logText; }

// Called at the end of every render, so the line survives the 38 call sites that
// rebuild the phase bar underneath it.
export function paintLine() {
  const bar = phaseBarEl();
  if (!bar) return;
  const slot = bar.querySelector('.ft-phase-bar__instruction');
  if (!slot) return;
  if (isHumanTurn()) return;                    // it never speaks on your own turn
  if (!logText) return;
  if (slot.dataset.ftLine === logText) return;
  slot.dataset.ftLine = logText;
  slot.textContent = logText;
  slot.classList.remove('ft-motion-log');
  void slot.offsetWidth;
  slot.classList.add('ft-motion-log');
}

export function clearLine() { logText = ''; }

// ---------------------------------------------------------------------------
// 10. THE LOOP
// ---------------------------------------------------------------------------
// The count is the only thing that needs a frame of its own; everything else is
// driven by the action that caused it.
let looping = false;
export function startMotion() {
  if (looping) return;
  looping = true;
  const frame = (now) => {
    try { tickCount(now); } catch { /* motion never breaks a render */ }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// The measurement surface. Read by tools/motion-probe.mjs; it costs nothing at
// rest and it is what makes the acceptance figures measured rather than claimed.
if (typeof window !== 'undefined') {
  window.__ftMotion = {
    stats: motionStats,
    budget: { midTurn: BUDGET_MIDTURN, boundary: BUDGET_BOUNDARY },
    timings,
    reduced,
    countInfinite,
    namesInDom,
    isRunning,
    capRings,
    reset() {
      motionStats.movements = 0;
      motionStats.freezes.length = 0;
      motionStats.maxNames = 0;
      motionStats.maxNamesKind = '';
      motionStats.budgetTrims = 0;
      motionStats.flips = 0;
      motionStats.haptics = 0;
      motionStats.counts = 0;
      motionStats.lines.length = 0;
    },
  };
}
