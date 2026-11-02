// Smooth curves through the story's fortune dots.
// Monotone cubic interpolation (the method of d3's curveMonotoneX): the curve passes
// through every dot and never overshoots above or below its neighbours.

const sign = (x) => (x < 0 ? -1 : 1);
const r1 = (v) => Math.round(v * 10) / 10;

/** One SVG path string per pair of consecutive points (so each piece can have its own colour). */
export function monotoneSegments(points) {
  const n = points.length;
  if (n < 2) return [];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const t = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const h0 = xs[i] - xs[i - 1];
    const h1 = xs[i + 1] - xs[i];
    const s0 = (ys[i] - ys[i - 1]) / h0;
    const s1 = (ys[i + 1] - ys[i]) / h1;
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    t[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  }
  if (n === 2) {
    t[0] = t[1] = (ys[1] - ys[0]) / (xs[1] - xs[0]);
  } else {
    t[0] = ((3 * (ys[1] - ys[0])) / (xs[1] - xs[0]) - t[1]) / 2;
    t[n - 1] = ((3 * (ys[n - 1] - ys[n - 2])) / (xs[n - 1] - xs[n - 2]) - t[n - 2]) / 2;
  }
  const segments = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3;
    segments.push(
      `M${r1(xs[i])},${r1(ys[i])}C${r1(xs[i] + dx)},${r1(ys[i] + dx * t[i])} ` +
        `${r1(xs[i + 1] - dx)},${r1(ys[i + 1] - dx * t[i + 1])} ${r1(xs[i + 1])},${r1(ys[i + 1])}`,
    );
  }
  return segments;
}
