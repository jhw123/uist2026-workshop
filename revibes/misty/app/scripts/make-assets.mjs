// Generates the placeholder assets the app ships with (they are committed, so you
// only need this to regenerate them). macOS: uses headless Google Chrome + sips.
//
//   node scripts/make-assets.mjs
//
// public/stock/   procedurally drawn "stock photos" (landscapeN.jpg, portraitN.jpg),
//                 the substitute for the paper's /stock/ photo folder
// public/samples/ example UI screenshots and a hand-drawn-style sketch to blend from
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TMP = mkdtempSync(join(tmpdir(), "misty-assets-"));
const TAILWIND = join(ROOT, "public/vendor/tailwind-play-3.4.17.js");

function shoot(html, w, h, out, { scale = 1, budget = 500 } = {}) {
  const file = join(TMP, `page-${Math.random().toString(36).slice(2)}.html`);
  writeFileSync(file, html);
  const png = join(TMP, "shot.png");
  const r = spawnSync(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
    `--force-device-scale-factor=${scale}`, `--window-size=${w},${h}`,
    `--virtual-time-budget=${budget}`, `--screenshot=${png}`, `file://${file}`,
  ], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  if (out.endsWith(".jpg")) spawnSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", png, "--out", out]);
  else copyFileSync(png, out);
  console.log("wrote", out);
}

// ---------- stock photos ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function ridge(rand, w, h, base, rough, steps = 9) {
  let pts = [base, base];
  let amp = rough;
  for (let i = 0; i < steps; i++) {
    const next = [];
    for (let j = 0; j < pts.length - 1; j++) {
      next.push(pts[j], (pts[j] + pts[j + 1]) / 2 + (rand() - 0.5) * amp);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
    amp *= 0.55;
  }
  const dx = w / (pts.length - 1);
  return `M0 ${h} ` + pts.map((y, i) => `L${(i * dx).toFixed(1)} ${(y * h).toFixed(1)}`).join(" ") + ` L${w} ${h} Z`;
}
function pines(rand, w, h, base, color, n) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = rand() * w, th = (0.12 + rand() * 0.14) * h, tw = th * 0.32, y = base * h + rand() * 0.06 * h;
    d += `M${x} ${y - th} L${x - tw} ${y} L${x + tw} ${y} Z `;
  }
  return `<path d="${d}" fill="${color}"/>`;
}
const THEMES = [
  { name: "sunset lake", sky: ["#2b1d4e", "#c2477a", "#f7a35c"], sun: ["#ffe2a8", 0.62, 0.55], layers: ["#5b3a6b", "#3b2550", "#21152f"], water: "#40305e" },
  { name: "alpine day", sky: ["#3f87d9", "#8ec5f2", "#dcefff"], sun: null, layers: ["#c9d6e6", "#7d93ab", "#4f7a4a"], snow: true },
  { name: "misty forest", sky: ["#9fb7b0", "#c9d9d2", "#e6efe9"], sun: ["#f7f7ef", 0.3, 0.3], layers: ["#8aa69b", "#5f8174", "#2f4d40"], pines: true },
  { name: "canyon", sky: ["#5aa6d6", "#a9d4ee", "#f6dfc0"], sun: null, layers: ["#d9895b", "#b5583a", "#7d3424"] },
  { name: "night peaks", sky: ["#070b1f", "#16224a", "#33406e"], moon: true, layers: ["#2a3358", "#1b2240", "#0d1128"], stars: true },
  { name: "coast", sky: ["#4aa3df", "#9fd3f5", "#e9f6ff"], sun: ["#fff6d8", 0.8, 0.2], layers: ["#7aa28a", "#4d7a62"], water: "#2f7fb5", sand: "#e8d3a6" },
];
function scene(t, w, h, seed) {
  const r = rng(seed);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${t.sky[0]}"/><stop offset="0.6" stop-color="${t.sky[1]}"/><stop offset="1" stop-color="${t.sky[2]}"/></linearGradient>
  <filter id="soft"><feGaussianBlur stdDeviation="${w / 260}"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.10 0"/></filter>
  <radialGradient id="glow"><stop offset="0" stop-color="#fff" stop-opacity="0.8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs><rect width="${w}" height="${h}" fill="url(#sky)"/>`;
  if (t.stars) for (let i = 0; i < 140; i++) s += `<circle cx="${r() * w}" cy="${r() * h * 0.6}" r="${r() * 1.3 + 0.3}" fill="#fff" opacity="${0.4 + r() * 0.6}"/>`;
  if (t.sun) s += `<circle cx="${t.sun[1] * w}" cy="${t.sun[2] * h}" r="${Math.min(w, h) * 0.22}" fill="url(#glow)"/><circle cx="${t.sun[1] * w}" cy="${t.sun[2] * h}" r="${Math.min(w, h) * 0.07}" fill="${t.sun[0]}"/>`;
  if (t.moon) s += `<circle cx="${0.72 * w}" cy="${0.22 * h}" r="${Math.min(w, h) * 0.05}" fill="#f4f1de"/>`;
  const n = t.layers.length;
  const bottom = t.water ? 0.72 : 0.95;
  t.layers.forEach((c, i) => {
    const base = 0.42 + (i / n) * (bottom - 0.42) * 0.9;
    const filt = i === 0 ? ' filter="url(#soft)"' : "";
    s += `<path d="${ridge(r, w, h, base, 0.32 - i * 0.07)}" fill="${c}"${filt}/>`;
    if (t.snow && i === 0) s += `<path d="${ridge(r, w, h, base + 0.01, 0.3)}" fill="#ffffff" opacity="0.55" filter="url(#soft)"/>`;
    if (t.pines && i > 0) s += pines(r, w, h, base + 0.12, c, 40 + i * 25);
  });
  if (t.water) {
    s += `<rect y="${bottom * h}" width="${w}" height="${(1 - bottom) * h}" fill="${t.water}"/>`;
    for (let i = 0; i < 30; i++) s += `<rect x="${r() * w}" y="${(bottom + r() * (1 - bottom)) * h}" width="${20 + r() * 80}" height="1.5" fill="#fff" opacity="${0.1 + r() * 0.25}"/>`;
  }
  if (t.sand) s += `<path d="M0 ${h} L0 ${h * 0.9} Q${w * 0.5} ${h * 0.84} ${w} ${h * 0.93} L${w} ${h} Z" fill="${t.sand}"/>`;
  s += `<rect width="${w}" height="${h}" filter="url(#grain)"/></svg>`;
  return `<!doctype html><html><body style="margin:0">${s}</body></html>`;
}

mkdirSync(join(ROOT, "public/stock"), { recursive: true });
THEMES.forEach((t, i) => {
  shoot(scene(t, 900, 600, 11 + i * 7), 900, 600, join(ROOT, `public/stock/landscape${i}.jpg`));
  shoot(scene(t, 600, 900, 91 + i * 13), 600, 900, join(ROOT, `public/stock/portrait${i}.jpg`));
});

// ---------- example UIs ----------
const stock = (f) => `file://${join(ROOT, "public/stock", f)}`;
const page = (body, bg = "#fff") => `<!doctype html><html><head><meta charset="utf-8">
<script src="file://${TAILWIND}"></script>
<style>body{margin:0;font-family:-apple-system,system-ui,'Helvetica Neue',sans-serif;background:${bg}}</style></head>
<body><div style="width:390px;height:844px;overflow:hidden;position:relative">${body}</div></body></html>`;
const ico = (d, cls = "w-5 h-5") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const featured = page(`
<div class="pt-12 pb-3 text-center text-[15px] font-semibold text-gray-900 border-b border-gray-100">Products</div>
<div class="px-5 pt-5"><h2 class="text-[22px] font-bold text-gray-900">Featured</h2></div>
<div class="mx-5 mt-3 rounded-2xl overflow-hidden bg-[#f5f5f7] shadow-sm">
  <img src="${stock("landscape4.jpg")}" class="w-full h-52 object-cover"/>
  <div class="p-5">
    <p class="text-[11px] font-semibold text-orange-600 uppercase tracking-wide">Limited Time</p>
    <h3 class="mt-1 text-[21px] leading-tight font-bold text-gray-900">Save on laptops and tablets for university.</h3>
    <p class="mt-2 text-[13px] text-gray-500 leading-snug">Plus get wireless earbuds with a laptop, a stylus with a tablet, and 20% off accessories.</p>
  </div>
</div>
<div class="px-5 pt-7"><h2 class="text-[20px] font-bold text-gray-900">Ways to save</h2></div>
<div class="flex gap-3 px-5 mt-3">
  <div class="w-40 shrink-0 rounded-2xl bg-[#f5f5f7] p-4"><p class="text-[11px] font-semibold text-orange-600 uppercase">Trade in</p><p class="mt-1 text-[15px] font-semibold leading-snug text-gray-900">Get credit toward a new device.</p></div>
  <div class="w-40 shrink-0 rounded-2xl bg-[#f5f5f7] p-4"><p class="text-[11px] font-semibold text-orange-600 uppercase">Refurbished</p><p class="mt-1 text-[15px] font-semibold leading-snug text-gray-900">Like new, for less.</p></div>
</div>
<div class="absolute bottom-0 inset-x-0 h-20 bg-white/95 border-t border-gray-200 flex justify-around pt-2 text-[10px] text-gray-400">
  <div class="flex flex-col items-center gap-1">${ico('<rect x="3" y="3" width="18" height="18" rx="2"/>')}For You</div>
  <div class="flex flex-col items-center gap-1 text-blue-600">${ico('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/>')}Products</div>
  <div class="flex flex-col items-center gap-1">${ico('<circle cx="12" cy="12" r="10"/><path d="m16 8-6 2-2 6 6-2z"/>')}Explore</div>
  <div class="flex flex-col items-center gap-1">${ico('<circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/>')}Search</div>
  <div class="flex flex-col items-center gap-1">${ico('<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>')}Bag</div>
</div>`);

const cat = (name, color, d) => `<div class="flex items-center gap-3 px-4 py-3 border-b border-white/10">
  <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white" style="background:${color}">${ico(d, "w-4 h-4")}</div>
  <span class="flex-1 text-[16px] text-white">${name}</span>${ico('<path d="m9 18 6-6-6-6"/>', "w-4 h-4 text-gray-500")}</div>`;
const darkList = page(`
<div class="pt-14 px-4"><h1 class="text-[32px] font-bold text-white">Browse</h1>
<div class="mt-3 flex items-center gap-2 rounded-xl bg-[#1c1c1e] px-3 py-2 text-gray-400 text-[16px]">${ico('<circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/>', "w-4 h-4")}Search</div>
<h2 class="mt-6 mb-2 text-[20px] font-bold text-white">Health Categories</h2></div>
<div class="mx-4 rounded-2xl bg-[#1c1c1e] overflow-hidden">
${cat("Activity", "#ff6b2c", '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>')}
${cat("Body Measurements", "#a259ff", '<path d="M12 2v20M2 12h20"/>')}
${cat("Cycle Tracking", "#ff4f8b", '<circle cx="12" cy="12" r="9"/>')}
${cat("Hearing", "#3b82f6", '<path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/>')}
${cat("Heart", "#ef4444", '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 12 5a5.5 5.5 0 0 0-10 3.5c0 2.3 1.5 4 3 5.5l7 7z"/>')}
${cat("Mobility", "#f59e0b", '<circle cx="13" cy="4" r="2"/><path d="m8 22 4-10 4 4v6"/>')}
${cat("Nutrition", "#22c55e", '<path d="M12 21c-4 0-7-3-7-8 0-3 2-6 7-6s7 3 7 6c0 5-3 8-7 8z"/>')}
${cat("Sleep", "#14b8a6", '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>')}
</div>`, "#000");

const playlist = (title, region, a, b) => `<div class="w-36 shrink-0">
  <div class="w-36 h-36 rounded-xl p-3 flex flex-col justify-end text-white shadow-md" style="background:linear-gradient(135deg,${a},${b})">
  <p class="text-[11px] font-semibold opacity-80">Top 100</p><p class="text-[18px] font-bold leading-tight">${region}</p></div>
  <p class="mt-2 text-[13px] font-medium text-gray-900">${title}</p><p class="text-[12px] text-gray-500">Updated weekly</p></div>`;
const musicProfile = page(`
<div class="pt-14 flex flex-col items-center">
  <img src="${stock("portrait0.jpg")}" class="w-28 h-28 rounded-full object-cover shadow-lg"/>
  <h1 class="mt-4 text-[24px] font-bold text-gray-900">Misty</h1>
  <p class="text-[14px] text-gray-500">@misty.blends</p>
  <button class="mt-3 px-6 py-1.5 rounded-full bg-rose-500 text-white text-[14px] font-semibold">Edit</button>
</div>
<div class="flex justify-center gap-10 mt-5 text-center">
  <div><p class="text-[17px] font-bold text-gray-900">128</p><p class="text-[11px] text-gray-500 uppercase tracking-wide">Following</p></div>
  <div><p class="text-[17px] font-bold text-gray-900">2.4k</p><p class="text-[11px] text-gray-500 uppercase tracking-wide">Followers</p></div>
</div>
<div class="px-5 mt-7 flex items-baseline justify-between"><h2 class="text-[20px] font-bold text-gray-900">Playlists</h2><span class="text-[14px] text-rose-500">See all</span></div>
<div class="flex gap-4 px-5 mt-3 overflow-hidden">
${playlist("Top 100: Global", "Global", "#f43f5e", "#7c3aed")}
${playlist("Top 100: USA", "USA", "#0ea5e9", "#1e3a8a")}
${playlist("Top 100: Japan", "Japan", "#f97316", "#be123c")}
</div>
<div class="px-5 mt-7"><h2 class="text-[20px] font-bold text-gray-900">Recently played</h2>
<div class="mt-3 flex items-center gap-3"><img src="${stock("landscape0.jpg")}" class="w-12 h-12 rounded-md object-cover"/><div><p class="text-[15px] text-gray-900">Evening Lake</p><p class="text-[13px] text-gray-500">Ambient · 42 songs</p></div></div>
</div>`);

// hand-drawn wireframe: jittered double strokes and a handwriting font
function sketchSvg() {
  const r = rng(7);
  const j = (v) => v + (r() - 0.5) * 3;
  const line = (x1, y1, x2, y2) => {
    let d = "";
    for (let k = 0; k < 2; k++) {
      const mx = (x1 + x2) / 2 + (r() - 0.5) * 4, my = (y1 + y2) / 2 + (r() - 0.5) * 4;
      d += `M${j(x1)} ${j(y1)} Q${mx} ${my} ${j(x2)} ${j(y2)} `;
    }
    return `<path d="${d}" stroke="#2b2b2b" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  };
  const box = (x, y, w, h) => line(x, y, x + w, y) + line(x + w, y, x + w, y + h) + line(x + w, y + h, x, y + h) + line(x, y + h, x, y);
  const txt = (x, y, s, size = 22) => `<text x="${x}" y="${y}" font-family="Bradley Hand, Chalkboard, 'Comic Sans MS', cursive" font-size="${size}" fill="#2b2b2b">${s}</text>`;
  const squiggle = (x, y, w) => { let d = `M${x} ${y}`; for (let k = 0; k < w; k += 12) d += ` q6 ${(r() - 0.5) * 8} 12 0`; return `<path d="${d}" stroke="#555" stroke-width="2" fill="none"/>`; };
  let s = "";
  s += box(16, 20, 358, 804);
  s += line(36, 64, 62, 64) + line(36, 72, 62, 72) + line(36, 80, 62, 80) + txt(150, 82, "TITLE") + `<circle cx="346" cy="72" r="14" stroke="#2b2b2b" stroke-width="2.2" fill="none"/>`;
  s += box(36, 112, 318, 190) + line(36, 112, 354, 302) + line(354, 112, 36, 302);
  s += txt(40, 340, "Big heading here", 26) + squiggle(40, 362, 280) + squiggle(40, 384, 220);
  s += txt(40, 432, "cards →", 20);
  [[36, 448], [200, 448], [36, 604], [200, 604]].forEach(([x, y]) => {
    s += box(x, y, 152, 140) + box(x + 12, y + 12, 128, 70) + line(x + 12, y + 12, x + 140, y + 82) + squiggle(x + 14, y + 104, 100) + squiggle(x + 14, y + 124, 70);
  });
  s += box(60, 762, 270, 46) + txt(128, 793, "BOOK NOW", 22);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844">${s}</svg>`;
}
const sketch = `<!doctype html><html><body style="margin:0;background:#fbfaf5">${sketchSvg()}</body></html>`;

mkdirSync(join(ROOT, "public/samples"), { recursive: true });
shoot(featured, 390, 844, join(ROOT, "public/samples/featured-store.png"), { scale: 2, budget: 3000 });
shoot(darkList, 390, 844, join(ROOT, "public/samples/dark-health-list.png"), { scale: 2, budget: 3000 });
shoot(musicProfile, 390, 844, join(ROOT, "public/samples/music-profile.png"), { scale: 2, budget: 3000 });
shoot(sketch, 390, 844, join(ROOT, "public/samples/sketch-wireframe.png"), { scale: 2, budget: 800 });
rmSync(TMP, { recursive: true, force: true });
