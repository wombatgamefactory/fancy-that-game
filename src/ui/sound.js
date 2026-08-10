// ---------------------------------------------------------------------------
// THE SOUND WORLD (stage 8, plan section 13)
// ---------------------------------------------------------------------------
//
// FOUR CUES, NOUGHT BYTES, NOUGHT REQUESTS, AND NO AUDIO FILE. Every cue is
// synthesised from decaying sine partials at INHARMONIC ratios with a 4ms
// bandpassed noise burst in front of it, which is what a struck ceramic object
// is. THE TRANSIENT IS THE WHOLE TRICK: the same partials without it read as a
// synthesiser.
//
//   THE GATHER   the sweep, 200ms   one grain of small china per tile, at the
//                                   movement's own stagger, each grain detuned
//                                   and levelled so five tiles are five pieces
//   THE SETTLE   the placement,160  one damped contact - a plate on linen
//   THE PLATING  the claim,   240   two contacts, and the only ring in the game
//   THE COUNT    the score,  25/pt  a tone, not an object: nothing travels
//                                   during a count, so nothing is struck
//
// THE ONE RULE: A CUE BEGINS WHEN ITS MOVEMENT BEGINS AND IS INAUDIBLE BEFORE
// ITS MOVEMENT ENDS. Every decay is scaled by the movement's own live duration
// token, so it holds in the reduced-motion branch too, where the movements are
// 100 to 120ms rather than 160 to 240.
//
// WHY CUES FIRE AT THE START OF A MOVEMENT. On Android the buzz and the cue are
// THE SAME EVENT IN TWO CHANNELS and section 7.4 fires the buzz at the start;
// two channels 160ms apart read as two events rather than one. A cue is also
// confirmation of the player's own tap, and confirmation that arrives 160ms
// after the tap has stopped being confirmation.
//
// BOTS ARE SILENT, ENTIRELY. Not quieter, not one cue a turn. THE SILENCE IS
// INFORMATION: sound means it is your move, or it just was.
//
// NOTHING LOOPS, EVER. No ambience, no music, no reverb, ZERO SOURCE NODES AT
// REST. Nothing is scheduled that is not a response to an action the player took
// this instant.
// ---------------------------------------------------------------------------

import { timings, reduced } from './motion.js';

// ---------------------------------------------------------------------------
// 1. THE PREFERENCE
// ---------------------------------------------------------------------------
// One boolean, ON BY DEFAULT. It is a PREFERENCE rather than game state, so it
// lives in its own localStorage key: it is never part of the save blob, it is
// not discarded with it, and it survives a version bump. There is no volume
// slider - the system volume is the volume.
const KEY = 'ft-sound';
let cachedPref = null;

export function soundEnabled() {
  if (cachedPref === null) {
    let v = null;
    try { v = localStorage.getItem(KEY); } catch { /* privacy modes throw */ }
    cachedPref = (v !== 'off');            // absent means on
  }
  return cachedPref;
}

export function setSoundEnabled(on) {
  cachedPref = !!on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* nothing to do */ }
  if (!on && ctx) { try { ctx.suspend(); } catch { /* already gone */ } }
  if (on) ensure();                        // the unmute tap is itself a gesture
  document.documentElement.setAttribute('data-ft-sound', on ? 'on' : 'off');
}

// ---------------------------------------------------------------------------
// 2. THE ROOM
// ---------------------------------------------------------------------------
// One output chain for everything, which is the audio equivalent of the art
// direction's one light: a 7kHz low-pass (the house rule "nothing harsh", stated
// as a number) and a master gain.
//
// NO REVERB. A tea room is soft furnishings and a table in front of you; a tail
// would be a cathedral. Dry, close and small is the register, and it is free.
//
// NO COMPRESSOR EITHER, deliberately. The levels are bounded by design and
// Chrome's DynamicsCompressorNode carries about 6ms of lookahead latency. A cue
// that arrives 6ms late is a cue that is 6ms late.
let ctx = null;
let bus = null;
let noiseBuf = null;
const MASTER = 1.0;

function AC() { return window.AudioContext || window.webkitAudioContext; }

// NOTHING IN THIS FILE MAY CALL Math.random, AND IT IS A REAL BUG RATHER THAN A
// nicety. The engine calls Math.random directly for its shuffle, its tasting
// menus and its flavour of the day, and the harness makes a run reproducible by
// replacing that one function before any module loads. The noise buffer is 12,000
// samples: building it on the global generator advances the seeded stream by
// 12,000 draws before createGame runs, so the game DEALT DIFFERENTLY the moment
// sound was switched on, and every screenshot in the suite moved with it.
// Measured: the tasting menus on the seeded 4-player opening came out as a
// different five.
//
// White noise needs no entropy, so it takes its own generator. The same rule
// governs the read offset in strike().
let noiseSeed = 0x9E3779B9;
function rnd() {
  noiseSeed ^= noiseSeed << 13; noiseSeed >>>= 0;
  noiseSeed ^= noiseSeed >>> 17;
  noiseSeed ^= noiseSeed << 5; noiseSeed >>>= 0;
  return noiseSeed / 4294967296;
}

function makeNoise(c) {
  const n = Math.floor(c.sampleRate * 0.25);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  return b;
}

function ensure() {
  if (ctx || !soundEnabled() || !AC()) return ctx;
  try {
    ctx = new (AC())({ latencyHint: 'interactive' });
  } catch { ctx = null; return null; }
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 7000;
  lp.Q.value = 0.707;
  bus = ctx.createGain();
  bus.gain.value = MASTER;
  bus.connect(lp);
  lp.connect(ctx.destination);
  noiseBuf = makeNoise(ctx);
  try { ctx.resume(); } catch { /* resumes on the next gesture */ }
  // THE UNLOCK IS A SILENT ONE-FRAME BUFFER played inside the gesture, so the
  // first cue of a session is never the one that has to unlock the context and
  // is never late.
  try {
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.start(0);
  } catch { /* the unlock is best effort */ }
  return ctx;
}

// AUTOPLAY POLICY, DESIGNED FOR RATHER THAN AROUND, and it follows the same
// deferral rule stage 1 applied to the three deferred modules: the graph is
// built on the FIRST GESTURE ANYWHERE IN THE DOCUMENT, which in the real flow is
// the landing page's Start button, long before any cue exists.
export function armAudioUnlock() {
  const go = () => {
    ensure();
    document.removeEventListener('pointerdown', go, true);
    document.removeEventListener('touchstart', go, true);
    document.removeEventListener('keydown', go, true);
  };
  document.addEventListener('pointerdown', go, true);
  document.addEventListener('touchstart', go, true);
  document.addEventListener('keydown', go, true);

  // A backgrounded tab must not hold an audio device open. Resuming costs 10 to
  // 40ms, which is why this is the only time the context is suspended while the
  // game is alive.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    try { (document.hidden || !soundEnabled()) ? ctx.suspend() : ctx.resume(); } catch { /* fine */ }
  });

  document.documentElement.setAttribute('data-ft-sound', soundEnabled() ? 'on' : 'off');
}

// ---------------------------------------------------------------------------
// 3. THE BODIES
// ---------------------------------------------------------------------------
// Modal synthesis. Each body is a list of [frequency, amplitude, decay] partials
// at inharmonic ratios - which is what separates a struck plate from a bell and
// a bell from a beep - plus one bandpassed noise transient standing in for the
// contact itself.
//
//   chip   a fondant tile against another. Small, hard, dry, gone.
//   plate  a plate set down on a linen cloth. Lower, and damped, because cloth
//          eats the top partials.
//   stand  china arriving on the tiered stand. The one body allowed to ring, and
//          the only reward sound there is.
//
// The frequencies are chosen for REGISTER and are not sampled off a recording.
const BODY = {
  chip: {
    gain: 0.075,
    partials: [[2450, 1.00, 0.075], [3640, 0.55, 0.055], [5090, 0.30, 0.040], [6830, 0.15, 0.026]],
    noise: { f: 4200, q: 1.2, amp: 0.50, decay: 0.004 },
  },
  plate: {
    gain: 0.100,
    partials: [[190, 0.35, 0.110], [620, 1.00, 0.150], [930, 0.50, 0.110], [1290, 0.28, 0.070], [1880, 0.12, 0.045]],
    noise: { f: 900, q: 0.8, amp: 0.35, decay: 0.006 },
  },
  stand: {
    gain: 0.095,
    partials: [[420, 0.20, 0.120], [1480, 1.00, 0.130], [2220, 0.60, 0.105], [3040, 0.38, 0.080], [4180, 0.20, 0.055], [5620, 0.10, 0.035]],
    noise: { f: 3000, q: 1.0, amp: 0.45, decay: 0.005 },
  },
};
const ATK = 0.0015;

// Five grains from one body would machine-gun. Each grain is detuned and
// levelled slightly, so a five-tile sweep is five pieces of china rather than
// one piece struck five times.
const DETUNE = [0.000, 0.043, -0.031, 0.062, -0.018];
const NOMINAL = { gather: 200, settle: 160, plate: 240 };
const STAGGER_STEPS = 4;

function strike(c, dest, when, name, opts = {}) {
  const b = BODY[name];
  const k = opts.scale === undefined ? 1 : opts.scale;
  const g0 = b.gain * (opts.level === undefined ? 1 : opts.level);
  const det = opts.detune || 0;

  for (const [pf, pa, pd] of b.partials) {
    const f = pf * (1 + det);
    const d = pd * k;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, when);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(pa * g0, when + ATK);
    g.gain.exponentialRampToValueAtTime(0.0001, when + ATK + d);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + ATK + d + 0.02);
  }

  const nd = b.noise.decay * k;
  const src = c.createBufferSource();
  src.buffer = noiseBuf || makeNoise(c);
  src.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = b.noise.f * (1 + det);
  bp.Q.value = b.noise.q;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.0001, when);
  ng.gain.exponentialRampToValueAtTime(b.noise.amp * g0 * 2.2, when + 0.0002);
  ng.gain.exponentialRampToValueAtTime(0.0001, when + nd);
  src.connect(bp);
  bp.connect(ng);
  ng.connect(dest);
  src.start(when, rnd() * 0.2);
  src.stop(when + nd + 0.02);
}

// THE COUNT IS A TONE, NOT AN OBJECT: nothing travels during a count, so nothing
// is struck. Two sines and a whisper of the octave, a soft 45ms attack so there
// is no contact at all, and a glide up one whole tone across the count - because
// a score going up should go up. It ends when the number does.
function toneCue(c, dest, when, ms) {
  const d = ms / 1000;
  const gain = 0.050;
  const f0 = 523.25;
  const glide = 1.122;
  const atk = 0.045;
  const hold = d * 0.55;
  for (const [ratio, amp] of [[1.0, 1.00], [1.5, 0.34], [2.0, 0.10]]) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0 * ratio, when);
    osc.frequency.linearRampToValueAtTime(f0 * ratio * glide, when + d);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(amp * gain, when + atk);
    g.gain.setValueAtTime(amp * gain, when + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + d);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + d + 0.02);
  }
}

// ---------------------------------------------------------------------------
// 4. THE FOUR CUES
// ---------------------------------------------------------------------------
// Each one is scored to its movement and scaled by that movement's own live
// duration token, so the reduced-motion branch needs no second set of numbers.
function build(c, dest, cue, opts = {}, t = timings()) {
  const when = opts.when === undefined ? c.currentTime + 0.005 : opts.when;

  if (cue === 'gather') {
    // ONE GRAIN PER TILE at the movement's own stagger, capped at four steps
    // exactly as the movement caps it. Five tiles 20ms apart is not five sounds,
    // it is one rattle with five things in it - which is what a handful of china
    // being gathered is - and the count is still in there for an ear that wants
    // it. THE SCOOP IS WHERE THE SOUND IS: the gather is the one cue whose
    // contact is at the start of the movement, because a sweep is a hand closing
    // on the tiles and the tray they land in is felt, not heard.
    const n = Math.max(1, Math.min(5, opts.n || 1));
    const k = t.gather / NOMINAL.gather;
    for (let i = 0; i < n; i++) {
      strike(c, dest, when + Math.min(i, STAGGER_STEPS) * (t.stagger / 1000), 'chip', {
        scale: k, level: 1 - i * 0.06, detune: DETUNE[i % DETUNE.length],
      });
    }
    return;
  }

  if (cue === 'settle') {
    // ONE contact. This is the cue that stands in for the `10` buzz.
    strike(c, dest, when, 'plate', { scale: t.settle / NOMINAL.settle });
    return;
  }

  if (cue === 'plating') {
    // TWO contacts, and the second is the only ring in the game. The two-part
    // shape is not ornament: it is the whole reason an iPhone player can tell a
    // claim from a placement without looking, which is the distinction
    // `[10, 60, 18]` carries on Android. The tick is the card leaving; the ring
    // is the tile arriving on the stand.
    const kp = t.plate / NOMINAL.plate;
    strike(c, dest, when, 'chip', { scale: kp, level: 0.55, detune: -0.02 });
    strike(c, dest, when + 0.090 * kp, 'stand', { scale: kp });
    return;
  }

  if (cue === 'count') {
    // The length is the tween's own length, so the tone and the number stop
    // together. It is the claimed card's receipt.
    let ms = Math.max(120, Math.min(700, opts.ms || 400));
    if (reduced()) ms = Math.min(350, ms);
    toneCue(c, dest, when, ms);
  }
}

// ---------------------------------------------------------------------------
// 5. THE GATE, WHICH LIVES IN motion.js
// ---------------------------------------------------------------------------
// There is no rate limit in this file, deliberately. The 120ms gate is
// motion.js's own haptic gate, SHARED RATHER THAN COPIED (plan section 13.5), so
// the two channels can never disagree about how many things happened: a call
// site takes the gate once and then fires both. The count is exempt from it - it
// is not a contact, it follows the plating by design, and it is the one cue
// allowed to overlap another.
export const soundStats = { gather: 0, settle: 0, plating: 0, count: 0, last: '', state: 'not started' };

export function playCue(cue, opts) {
  if (!soundEnabled()) return false;
  const c = ensure();
  if (!c) return false;
  if (c.state === 'suspended') { try { c.resume(); } catch { /* the next gesture will */ } }
  try { build(c, bus, cue, opts); } catch { return false; }
  soundStats[cue]++;
  soundStats.last = cue;
  soundStats.state = c.state;
  return true;
}

// ---------------------------------------------------------------------------
// 6. THE MEASUREMENT SURFACE
// ---------------------------------------------------------------------------
// Renders a cue into an OfflineAudioContext and reports peak, RMS and the
// -60 dBFS tail against 95 per cent of its movement. The one rule is checked
// rather than quoted, on the same principle as stage 6's sheet self test.
export function measureCue(cue, opts) {
  const t = timings();
  const movement = cue === 'count'
    ? (reduced() ? Math.min(350, (opts && opts.ms) || 400) : ((opts && opts.ms) || 400))
    : cue === 'gather' ? t.gather : cue === 'settle' ? t.settle : t.plate;
  const budget = cue === 'count' ? movement : movement * 0.95;
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OC) return Promise.resolve(null);
  const sr = 48000;
  const oc = new OC(1, Math.ceil(sr * 1.2), sr);
  const lp = oc.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 7000;
  lp.Q.value = 0.707;
  const g = oc.createGain();
  g.gain.value = MASTER;
  g.connect(lp);
  lp.connect(oc.destination);
  const saved = noiseBuf;
  noiseBuf = makeNoise(oc);
  build(oc, g, cue, { when: 0, ...(opts || {}) }, t);
  noiseBuf = saved;
  return oc.startRendering().then(buf => {
    const d = buf.getChannelData(0);
    let peak = 0; let sum = 0; let tail = 0;
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
      sum += d[i] * d[i];
      if (v > 0.001) tail = i;                       // -60 dBFS
    }
    const tailMs = tail / sr * 1000;
    return {
      cue,
      movement: Math.round(movement),
      budget: Math.round(budget),
      peak: 20 * Math.log10(peak || 1e-9),
      rms: 20 * Math.log10(Math.sqrt(sum / d.length) || 1e-9),
      tail: tailMs,
      pass: tailMs <= budget,
    };
  });
}

if (typeof window !== 'undefined') {
  window.__ftSound = {
    play: playCue,
    measure: measureCue,
    stats: soundStats,
    enabled: soundEnabled,
    setEnabled: setSoundEnabled,
    context: () => ctx,
    reset() {
      soundStats.gather = 0; soundStats.settle = 0; soundStats.plating = 0;
      soundStats.count = 0; soundStats.last = '';
    },
  };
}
