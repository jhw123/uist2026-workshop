// Image helpers: every example image becomes a PNG data URL (SVGs and
// uploads alike), so it can be cropped and sent to the model.
const MAX = 1024;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

export async function toPngDataUrl(src) {
  const img = await loadImage(src);
  const w0 = img.naturalWidth || 600;
  const h0 = img.naturalHeight || 1000;
  const s = Math.min(1, MAX / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * s);
  c.height = Math.round(h0 * s);
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

// rect is in fractions of the image (0..1)
export async function cropDataUrl(src, rect) {
  const img = await loadImage(src);
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(rect.w * W));
  c.height = Math.max(1, Math.round(rect.h * H));
  c.getContext("2d").drawImage(img, rect.x * W, rect.y * H, rect.w * W, rect.h * H, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}
