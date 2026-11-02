// Image helpers: examples are kept as data URLs (downscaled) so they can be sent
// to the model, cropped on a canvas, and saved with the canvas.

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

function toDataUrl(img, sx, sy, sw, sh, maxSide, type = "image/jpeg") {
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return { url: c.toDataURL(type, 0.88), width: c.width, height: c.height };
}

// File, Blob or URL -> downscaled data URL
export async function normalizeImage(source, maxSide = 1400) {
  let src = source;
  if (source instanceof Blob) {
    src = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(source);
    });
  }
  const img = await loadImage(src);
  return toDataUrl(img, 0, 0, img.naturalWidth, img.naturalHeight, maxSide);
}

// rect in fractions (0..1) of the image
export async function cropImage(src, rect) {
  const img = await loadImage(src);
  const W = img.naturalWidth, H = img.naturalHeight;
  const sx = rect.x * W, sy = rect.y * H, sw = rect.w * W, sh = rect.h * H;
  const full = toDataUrl(img, sx, sy, sw, sh, 1024);
  const thumb = toDataUrl(img, sx, sy, sw, sh, 150, "image/png");
  return { url: full.url, thumb: thumb.url };
}
