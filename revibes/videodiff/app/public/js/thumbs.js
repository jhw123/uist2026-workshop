// Extracts thumbnails from the source video in the browser (no ffmpeg needed).
// Frames are taken at a fixed interval; thumbAt(t) returns the nearest one.

export class ThumbStore {
  constructor() {
    this.frames = []; // { t, url }
    this.step = 2;
    this.listeners = new Set();
    this.done = false;
  }

  onUpdate(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  thumbAt(t) {
    if (!this.frames.length) return null;
    const k = Math.round(t / this.step);
    for (let d = 0; d < this.frames.length; d++) {
      const a = this.frames[k - d];
      if (a && a.url) return a.url;
      const b = this.frames[k + d];
      if (b && b.url) return b.url;
    }
    return null;
  }

  async extract(url, duration) {
    this.done = false;
    this.step = Math.max(1, duration / 150);
    const n = Math.ceil(duration / this.step);
    this.frames = Array.from({ length: n }, (_, k) => ({ t: k * this.step, url: null }));
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = url;
    await new Promise((res, rej) => {
      video.addEventListener("loadeddata", res, { once: true });
      video.addEventListener("error", () => rej(new Error("Could not load video for thumbnails")), { once: true });
    });
    const canvas = document.createElement("canvas");
    const w = 160;
    canvas.width = w;
    canvas.height = Math.round((w * video.videoHeight) / video.videoWidth) || 90;
    const ctx = canvas.getContext("2d");
    // Coarse pass first (every 4th frame) so timelines fill quickly, then the rest.
    const order = [];
    for (let k = 0; k < n; k += 4) order.push(k);
    for (let k = 0; k < n; k++) if (k % 4) order.push(k);
    let sinceEmit = 0;
    for (const k of order) {
      const t = Math.min(duration - 0.1, this.frames[k].t + this.step / 2);
      await new Promise((res) => {
        const done = () => res();
        video.addEventListener("seeked", done, { once: true });
        setTimeout(done, 1500);
        video.currentTime = t;
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      this.frames[k].url = canvas.toDataURL("image/jpeg", 0.6);
      if (++sinceEmit >= 12) {
        sinceEmit = 0;
        this.emit();
      }
    }
    this.done = true;
    video.removeAttribute("src");
    video.load();
    this.emit();
  }

  emit() {
    for (const fn of this.listeners) fn();
  }
}
