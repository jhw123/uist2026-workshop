// Simlish-style gibberish voices, synthesised with the Web Audio API (no samples, no service).
// Each syllable of the real line becomes a short buzzy "vowel": a sawtooth through two
// band-pass filters set to that vowel's formants, with a small noise burst for consonants.
// Pitch follows the mood: it rises on questions, jumps when insisting, falls when agreeing.

let ctx = null;
let master = null;
let muted = false;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const setMuted = (value) => {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.22;
};
export const isMuted = () => muted;

// First and second formants (Hz) of each vowel.
const FORMANTS = {
  a: [800, 1200],
  e: [500, 1900],
  i: [320, 2400],
  o: [500, 900],
  u: [350, 700],
  y: [320, 2200],
};

// Split a line into rough syllables: consonants + a vowel group.
export function syllables(line) {
  const words = String(line).toLowerCase().match(/[a-z']+|[?!.,]/g) || [];
  const out = [];
  for (const w of words) {
    if (/[?!.,]/.test(w)) {
      out.push({ pause: w === ',' ? 0.08 : 0.16, mark: w });
      continue;
    }
    const parts = w.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$)?/g) || [w];
    for (const p of parts) {
      const vowel = (p.match(/[aeiouy]/) || ['a'])[0];
      out.push({ vowel, consonant: /^[^aeiouy]/.test(p), stress: p.length > 3 });
    }
    out.push({ pause: 0.035 });
  }
  return out;
}

const MOOD = {
  insist: { lift: 1.25, wobble: 3, speed: 0.85, loud: 1.25 },
  question: { lift: 1.05, wobble: 2, speed: 1, loud: 1 },
  agree: { lift: 0.92, wobble: 1, speed: 1.05, loud: 0.9 },
  joke: { lift: 1.15, wobble: 4, speed: 0.9, loud: 1 },
  default: { lift: 1, wobble: 2, speed: 1, loud: 1 },
};

/**
 * Speak a line in gibberish. voice = { pitch (Hz), timbre: 'sawtooth' | 'square' | 'triangle' }.
 * Resolves when done. onSyllable(i, n) lets the caller animate a mouth.
 */
export function speak(line, voice, mood = 'default', onSyllable) {
  const ac = audio();
  const sylls = syllables(line);
  const m = MOOD[mood] || MOOD.default;
  const unit = 0.095 * m.speed;
  const total = sylls.reduce((t, s) => t + (s.pause ?? unit), 0);
  if (!ac || muted) {
    // Still pace the line, so the conversation reads at the same speed without sound.
    return paceOnly(sylls, unit, onSyllable).then(() => total);
  }
  let t = ac.currentTime + 0.03;
  const question = /\?\s*$/.test(line);
  const n = sylls.length;
  sylls.forEach((s, i) => {
    if (s.pause) {
      t += s.pause;
      return;
    }
    const progress = i / Math.max(1, n - 1);
    // Contour: a little arch, a rise at the end of questions, a drop at the end of statements.
    let f0 = voice.pitch * m.lift * (1 + 0.08 * Math.sin(progress * Math.PI));
    if (progress > 0.75) f0 *= question ? 1 + (progress - 0.75) * 1.6 : 1 - (progress - 0.75) * 0.5;
    f0 *= 2 ** (((Math.random() - 0.5) * m.wobble) / 12);
    if (s.stress) f0 *= 1.06;
    const dur = unit * (s.stress ? 1.25 : 1) * (0.85 + Math.random() * 0.3);
    blip(ac, t, dur, f0, FORMANTS[s.vowel] || FORMANTS.a, voice.timbre || 'sawtooth', m.loud, s.consonant);
    if (onSyllable) {
      const delay = (t - ac.currentTime) * 1000;
      setTimeout(() => onSyllable(i, n), Math.max(0, delay));
    }
    t += dur;
  });
  const ms = (t - ac.currentTime) * 1000 + 60;
  return new Promise((resolve) => setTimeout(() => resolve(total), ms));
}

function paceOnly(sylls, unit, onSyllable) {
  return new Promise((resolve) => {
    let i = 0;
    let wait = 0;
    for (const s of sylls) {
      const idx = i++;
      wait += s.pause ?? unit;
      if (!s.pause && onSyllable) setTimeout(() => onSyllable(idx, sylls.length), wait * 1000);
    }
    setTimeout(resolve, wait * 1000 + 60);
  });
}

function blip(ac, t, dur, f0, [f1, f2], timbre, loud, consonant) {
  const osc = ac.createOscillator();
  osc.type = timbre;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.linearRampToValueAtTime(f0 * (0.97 + Math.random() * 0.06), t + dur);

  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.5 * loud, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.25 * loud, t + dur * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const b1 = ac.createBiquadFilter();
  b1.type = 'bandpass';
  b1.frequency.value = f1;
  b1.Q.value = 6;
  const b2 = ac.createBiquadFilter();
  b2.type = 'bandpass';
  b2.frequency.value = f2;
  b2.Q.value = 8;
  const mix = ac.createGain();
  mix.gain.value = 2.2;

  osc.connect(b1);
  osc.connect(b2);
  b1.connect(env);
  b2.connect(env);
  env.connect(mix);
  mix.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);

  if (consonant) {
    // A tiny burst of filtered noise in front of the vowel.
    const len = Math.floor(ac.sampleRate * 0.025);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const g = ac.createGain();
    g.gain.value = 0.18 * loud;
    noise.connect(hp);
    hp.connect(g);
    g.connect(master);
    noise.start(Math.max(ac.currentTime, t - 0.015));
  }
}

/** A short rising "plumbob" chime when a character takes the floor or the debate starts. */
export function chime(up = true) {
  const ac = audio();
  if (!ac || muted) return;
  const t = ac.currentTime + 0.01;
  [0, 0.07, 0.14].forEach((dt, i) => {
    const o = ac.createOscillator();
    o.type = 'sine';
    const notes = up ? [660, 880, 1320] : [990, 740, 520];
    o.frequency.value = notes[i];
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.exponentialRampToValueAtTime(0.3, t + dt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.25);
    o.connect(g);
    g.connect(master);
    o.start(t + dt);
    o.stop(t + dt + 0.3);
  });
}

/** Unlock audio on a user gesture (browsers block sound until then). */
export const unlockAudio = () => audio();
