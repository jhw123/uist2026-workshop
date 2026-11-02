// Image helpers: every example image is normalised to a PNG data URL, so it can be
// cropped, stored, and sent to the model.

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export async function toPngDataUrl(src, maxSide = 1400) {
  const img = await loadImage(src);
  const w = img.naturalWidth || img.width || 800;
  const h = img.naturalHeight || img.height || 1600;
  const s = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { url: c.toDataURL("image/png"), width: c.width, height: c.height };
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** sel is in fractions of the image: {x, y, w, h} in 0..1 */
export async function cropDataUrl(src, sel) {
  const img = await loadImage(src);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const sx = Math.round(sel.x * W);
  const sy = Math.round(sel.y * H);
  const sw = Math.max(1, Math.round(sel.w * W));
  const sh = Math.max(1, Math.round(sel.h * H));
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c.toDataURL("image/png");
}
