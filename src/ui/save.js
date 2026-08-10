// ---------------------------------------------------------------------------
// SAVE AND RESUME (stage 8, plan section 10)
// ---------------------------------------------------------------------------
//
// NO ENGINE CHANGE. The shipped build already serialises the whole engine state
// from outside src/engine/: main.js's snapshotGameState is
// `const { statsCollector, ...rest } = gameState; JSON.parse(JSON.stringify(rest))`,
// restored by Object.assign, and that is the undo feature. Save and resume is
// that same function with a different destination.
//
// ONE WRITE PER TURN BOUNDARY, whoever's turn it is, plus one at setup. Every
// phase is refused, because confirmTurn clears the undo stack - so a mid-turn
// resume would be a turn the player cannot rewind inside. THE HALF-FINISHED TURN
// REWINDS FOR FREE: no mid-turn state is ever written, so there is nothing to
// reconstruct.
//
// ENGINE TRUTH IN FULL MINUS statsCollector, PLUS EXACTLY TEN NUMBERS OF UI
// STATE - five booleans for the lit thresholds and five integers for the delta
// ordinals. At a turn boundary every other piece of UI state is already at its
// default.
//
// A NOTE ON A CONFLICT, SETTLED IN THE PLAN'S FAVOUR AND DELIBERATELY. Stage 7's
// Resolution reads the acknowledged thresholds as session state that should stay
// out of the blob. The plan says the opposite and gives its reason: A RELOAD IS
// THE LARGEST INSTANCE OF LOOKING AWAY THAT EXISTS, which is precisely the case
// decision 32's persistent rail was built for, and a threshold that clears
// itself because the tab was reloaded is the transient the decision refused. The
// map's authority order settles it - a stage write-up does not overrule the plan
// - so the five booleans are persisted and stage 7's dissent is recorded rather
// than silently followed. What does stay out is which sheet was open: that is
// not news the player can miss.
//
// localStorage, ONE KEY, and it is a deliberate departure from the rotate card's
// sessionStorage, which dies with the tab - the exact event this exists to
// survive. The distinction is between a preference about this sitting and the
// player's own possession.
// ---------------------------------------------------------------------------

import * as GAME from '../engine/game.js';
import * as TILES from '../engine/tiles.js';
import * as MENUS from '../engine/tastingMenus.js';

const KEY = 'ft-save';

// Bumped BY HAND only when the envelope below changes shape. The engine is
// covered by `shape`, which nobody has to remember to bump.
const FORMAT = 1;

// ---------------------------------------------------------------------------
// THE FINGERPRINT
// ---------------------------------------------------------------------------
// A save must be refused when the engine that would load it is not the engine
// that wrote it. A hand-maintained version constant is the obvious mechanism and
// it is the wrong one, because it is bumped by remembering and nobody remembers
// on the day they change one line of game.js.
//
// So the stamp is DERIVED AT RUN TIME from the engine's own public surface and
// maintains itself. Two parts, hashed together:
//
//   1. the state shape - createGame's output walked four levels deep, key names
//      only, sorted;
//   2. the tuning constants - every non-function export of game.js, tiles.js and
//      tastingMenus.js, sorted by name and serialised, REWARD_CARDS and
//      TASTING_MENUS included.
//
// The second part is what makes the stamp honest about RULE changes as well as
// shape changes. It is deliberately eager: a discarded save costs one game in
// progress, and a resumed-under-changed-rules game costs an irreproducible bug
// report.
//
// A 32-bit FNV-1a, not SHA-256: crypto.subtle.digest is asynchronous and needs a
// secure context, and this is a "did the build change" checksum.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function shapeWalk(value, depth) {
  if (depth <= 0 || value === null || typeof value !== 'object') return '';
  if (Array.isArray(value)) return value.length ? `[${shapeWalk(value[0], depth - 1)}]` : '[]';
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${k}:${shapeWalk(value[k], depth - 1)}`).join(',')}}`;
}

let fingerprint = null;

export function shapeFingerprint() {
  if (fingerprint) return fingerprint;
  let shape = '';
  // THE THROWAWAY createGame CONSUMES Math.random - createTileBag shuffles, the
  // tasting menus are dealt and the flavour of the day is drawn - so under a
  // seeded harness it would silently deal a DIFFERENT game to the one the
  // screenshots were taken against. The generator is stubbed for the length of
  // the call and restored in a finally. The plan does not mention this and it is
  // the one trap in the fingerprint.
  const realRandom = Math.random;
  try {
    Math.random = () => 0.5;
    shape = shapeWalk(GAME.createGame([
      { name: 'A', isHuman: true, aiDifficulty: null },
      { name: 'B', isHuman: false, aiDifficulty: 'basic' },
    ]), 4);
  } catch { shape = 'shape-unavailable'; } finally {
    Math.random = realRandom;
  }

  const constants = [];
  for (const mod of [GAME, TILES, MENUS]) {
    for (const name of Object.keys(mod).sort()) {
      const v = mod[name];
      if (typeof v === 'function') continue;
      try { constants.push(`${name}=${JSON.stringify(v)}`); } catch { constants.push(`${name}=?`); }
    }
  }
  fingerprint = fnv1a(`${shape}|${constants.join('|')}`);
  return fingerprint;
}

// ---------------------------------------------------------------------------
// THE STORAGE LAYER
// ---------------------------------------------------------------------------
// Three rules, all of them about staying out of the way. Every access is
// wrapped, because localStorage throws on access in some privacy
// configurations; A FAILED WRITE REMOVES THE KEY, because half a save is worse
// than none on the write side as well as the read side; and nothing in the game
// ever reads the save to decide anything.
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to remove from */ }
}

export function writeSave(gameState, ui, { resumed = false } = {}) {
  if (!gameState || gameState.gameOver) return false;
  try {
    const { statsCollector, ...rest } = gameState;
    const envelope = {
      format: FORMAT,
      shape: shapeFingerprint(),
      savedAt: Date.now(),
      turn: gameState.stats ? gameState.stats.turnsPlayed : 0,
      resumed: !!resumed,
      state: JSON.parse(JSON.stringify(rest)),
      ui: {
        thresholds: { ...(ui && ui.thresholds) },
        ordinals: { ...(ui && ui.ordinals) },
      },
    };
    localStorage.setItem(KEY, JSON.stringify(envelope));
    return true;
  } catch {
    clearSave();
    return false;
  }
}

// A LOAD IS ALL OR NOTHING. There are exactly two outcomes of a page load: a
// resume card appears, or there is no save. Nothing in between is ever rendered.
export function readSave() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  let env;
  try { env = JSON.parse(raw); } catch { clearSave(); return null; }
  if (!env || env.format !== FORMAT || env.shape !== shapeFingerprint()) { clearSave(); return null; }
  if (!sane(env.state)) { clearSave(); return null; }
  if (!env.ui) env.ui = { thresholds: {}, ordinals: {} };
  return env;
}

// Cheap, and it runs after the fingerprint has matched. Any failure removes the
// key.
function sane(s) {
  if (!s || typeof s !== 'object') return false;
  if (!Array.isArray(s.players) || s.players.length !== s.playerCount) return false;
  if (![2, 3, 4].includes(s.playerCount)) return false;
  if (!(s.currentPlayerIndex >= 0 && s.currentPlayerIndex < s.players.length)) return false;
  if (!(s.startPlayerIndex >= 0 && s.startPlayerIndex < s.players.length)) return false;
  if (!Array.isArray(s.market) || s.market.length !== s.marketSize * s.marketSize) return false;
  if (s.players.some(p => !Array.isArray(p.board) || p.board.length !== 25)) return false;
  // A finished game must never present itself as resumable, whatever else is
  // true of it.
  if (s.gameOver !== false) return false;
  return true;
}

// What the resume card says, composed from the saved state so the card can never
// disagree with the game behind it. Dean's format, DD/MM/YYYY.
export function describeSave(env) {
  const s = env.state;
  const who = s.players[s.currentPlayerIndex];
  const name = (who && who.name ? who.name : `Player ${s.currentPlayerIndex + 1}`).replace(/\s*\(.*\)\s*$/, '');
  const d = new Date(env.savedAt);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return {
    position: `${s.playerCount} players, turn ${env.turn}, and it is ${name}'s turn.`,
    when: `Saved ${dd}/${mm}/${d.getFullYear()}`,
  };
}
