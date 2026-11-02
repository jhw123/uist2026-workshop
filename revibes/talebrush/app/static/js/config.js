// Constants shared by the TaleBrush front end.

// The sketch is stored per sentence slot, with this many samples across each slot.
export const SAMPLES_PER_SLOT = 32;

// The editor starts with this many bullet points (Figure 1 shows eight).
export const DEFAULT_BULLETS = 8;

// Surprise used for a sentence when the surprise panel is off or not sketched there.
export const DEFAULT_SURPRISE = 0.5;

// Regenerate a sentence when its recognized fortune differs from the sketch by more than this (paper: 0.2).
export const DEFAULT_THRESHOLD = 0.2;

// Wait this long after the last keystroke before asking for fortune recognition.
export const RECOGNITION_DELAY_MS = 900;

// A slot counts as sketched when the line covers half of it, or passes its center (where its dot sits).
export const SLOT_COVERAGE = 0.5;

// Sketching speed sets the envelope width (Section 3 and 4.2.2): fast strokes are wide (loose),
// slow strokes are thin (tight). Widths are half-widths in fortune units (canvas height = 1).
export const ENVELOPE = {
  minHalfWidth: 0.03,
  maxHalfWidth: 0.15,
  slowSpeed: 0.12, // pointer speed in px per ms at or below which the line is thinnest
  fastSpeed: 1.4, // pointer speed in px per ms at or above which the line is widest
  tightBelow: 0.09, // a slot whose mean half-width is below this gets up to 2 regenerations, else 1
};

export const ERASER_RADIUS = 14;

export const STORAGE_KEY = "talebrush-revibe-v1";
export const HISTORY_LIMIT = 60;

// Fortune bands, from good (top) to bad (bottom). The canvas background and the editor's
// sentence highlights use the same scale, as in Figures 1 and 8.
export const BANDS = [
  { from: 0.8, to: 1.0, canvas: "#fcf3d9", text: "#f8e6ad" },
  { from: 0.6, to: 0.8, canvas: "#fdf8ea", text: "#fbf0cf" },
  { from: 0.4, to: 0.6, canvas: "#ffffff", text: "transparent" },
  { from: 0.2, to: 0.4, canvas: "#f3f3f3", text: "#ebebeb" },
  { from: 0.0, to: 0.2, canvas: "#e8e8e8", text: "#dcdcdc" },
];

export function bandOf(fortune) {
  return BANDS.find((b) => fortune >= b.from) || BANDS[BANDS.length - 1];
}

export function halfWidthForSpeed(speed) {
  const { minHalfWidth, maxHalfWidth, slowSpeed, fastSpeed } = ENVELOPE;
  let t = (speed - slowSpeed) / (fastSpeed - slowSpeed);
  t = Math.min(1, Math.max(0, t));
  t = t * t * (3 - 2 * t); // smoothstep
  return minHalfWidth + (maxHalfWidth - minHalfWidth) * t;
}
