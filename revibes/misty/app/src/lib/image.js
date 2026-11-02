// Image helpers: read uploads, downscale, crop a region of an example image.

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Downscale so the longest side is at most `max` px (keeps model calls small).
export async function downscale(dataUrl, max = 1024) {
  const img = await loadImage(dataUrl);
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/jpeg', 0.88), width: c.width, height: c.height };
}

// rect is normalised: {x, y, w, h} in 0..1 of the image.
export function cropFromImage(img, rect) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(rect.w * W));
  c.height = Math.max(1, Math.round(rect.h * H));
  c.getContext('2d').drawImage(img, rect.x * W, rect.y * H, rect.w * W, rect.h * H, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
