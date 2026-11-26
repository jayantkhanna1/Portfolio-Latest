/*
 * Sound: a handful of soft, felt-mallet notes in one room. Synthesised, no audio files.
 * Anything can play one:  document.dispatchEvent(new CustomEvent("fx", { detail: { name: "tick" } }))
 * Names without an entry in FX are silent on purpose.
 * Browsers only allow audio after a click or key press, so nothing plays before that.
 */
const KEY = "jk-sound-3";
let ctx = null, out = null, room = null, on = true;
try { on = localStorage.getItem(KEY) !== "off"; } catch {}

// C major pentatonic across two octaves: any two notes sound good together.
const SCALE = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99, 880];
const note = (i) => SCALE[((Math.round(i) % SCALE.length) + SCALE.length) % SCALE.length];

function started() {
  if (ctx?.state === "running") document.dispatchEvent(new CustomEvent("soundstart"));
}
function unlock() {
  if (!on) return;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    ctx.onstatechange = started;
    out = ctx.createGain();
    out.gain.value = 0.9;
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 3400;
    out.connect(warm).connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
    // A short, dark room: decaying noise as an impulse response.
    const n = Math.floor(ctx.sampleRate * 1.9), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.22; d[i] = lp * Math.pow(1 - i / n, 3.2); }
    }
    room = ctx.createConvolver();
    room.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    room.connect(wet).connect(out);
  }
  if (ctx.state === "running") started();
  else ctx.resume().then(started, () => {});
}
// Different browsers count different events as permission, so listen for all of them.
for (const t of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) addEventListener(t, unlock, { capture: true, passive: true });
document.addEventListener("visibilitychange", () => { if (ctx) document.hidden ? ctx.suspend() : on && ctx.resume(); });

/* One mallet note: a sine body, a quiet overtone that dies first, a rounded attack. */
function mallet(freq, { at = 0, vol = 0.16, dur = 1.1, pan = 0 } = {}) {
  const t = ctx.currentTime + 0.005 + at, p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(out);
  p.connect(room);
  for (const [mult, level, len] of [[1, 1, 1], [2, 0.16, 0.5], [4, 0.05, 0.16]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * level, t + 0.008);
    g.gain.setTargetAtTime(0, t + 0.012, (dur * len) / 4.5);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + dur * len * 1.6);
  }
}
const run = (notes, gap, o) => notes.forEach((n, i) => mallet(note(n), { at: i * gap, pan: (i / notes.length - 0.5) * 0.6, ...o }));

const FX = {
  click: () => mallet(note(2), { vol: 0.13, dur: 0.5 }),
  tick: ({ n = 4 }) => mallet(note(n), { vol: 0.09, dur: 0.6, pan: ((n % 5) - 2) * 0.15 }),
  pluck: ({ n = 0 }) => mallet(note(n), { vol: 0.075, dur: 1, pan: ((n % 7) - 3) * 0.14 }),
  layer: ({ n = 0 }) => run([n, n + 2], 0.07, { vol: 0.13, dur: 1 }),
  shatter: () => run([9, 7, 8, 5, 6, 3], 0.045, { vol: 0.085, dur: 0.9 }),
  gather: () => run([0, 3, 5], 0.09, { vol: 0.1, dur: 1.5 }),
  open: () => run([2, 5], 0.08, { vol: 0.11, dur: 0.9 }),
  close: () => run([5, 2], 0.08, { vol: 0.1, dur: 0.8 }),
  success: () => run([0, 2, 3, 5, 7], 0.11, { vol: 0.14, dur: 1.8 }),
  error: () => run([1, 0], 0.14, { vol: 0.13, dur: 0.8 }),
};
const GAP = { pluck: 140, tick: 90, gather: 1600, shatter: 400, click: 120 };
const last = {};

document.addEventListener("fx", (e) => {
  const { name, ...rest } = e.detail;
  const now = performance.now();
  if (!on || !ctx || !FX[name] || now - (last[name] ?? -1e4) < (GAP[name] || 60)) return;
  last[name] = now;
  if (ctx.state === "running") FX[name](rest);
  // The very first gesture wakes the engine; play once it is awake rather than dropping the note.
  else if (navigator.userActivation?.hasBeenActive) ctx.resume().then(() => FX[name](rest), () => {});
});

export const soundRunning = () => ctx?.state === "running";
/* Peak level right now, for testing. */
let meter = null;
export function level() {
  if (!ctx) return 0;
  if (!meter) { meter = ctx.createAnalyser(); meter.fftSize = 2048; out.connect(meter); }
  const d = new Float32Array(2048);
  meter.getFloatTimeDomainData(d);
  return Math.max(...d.map(Math.abs));
}
export const soundOn = () => on;
export function setSound(next) {
  on = next;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  if (on) unlock();
  else ctx?.suspend();
}
