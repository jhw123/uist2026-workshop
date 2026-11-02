// Composite video player: plays a variation's edit list (clips of the one source video)
// and overlays its B-rolls and text effects. Stands in for Remotion in the paper.

import { el, fmtTime, icon } from "./util.js";

const players = new Set();

export class Player {
  constructor(videoUrl, lay) {
    this.lay = lay;
    this.idx = 0;
    this.editTime = 0;
    this.playing = false;
    this.overlayKey = "";
    this.textKey = "";
    this.listeners = new Set();

    this.video = el("video", { preload: "metadata", playsinline: true });
    this.video.src = videoUrl;
    this.brollLayer = el("div", { class: "broll-layer" });
    this.textLayer = el("div", { class: "text-layer" });
    this.screen = el("div", { class: "screen", onclick: () => this.toggle() }, this.video, this.brollLayer, this.textLayer);

    this.playBtn = el("button", { class: "pbtn", title: "Play/Pause", onclick: () => this.toggle() }, icon("play", 18));
    this.muteBtn = el("button", { class: "pbtn", title: "Mute", onclick: () => this.toggleMute() }, icon("volume", 18));
    this.timeEl = el("span", { class: "ptime" }, "0:00 / 0:00");
    this.fill = el("div", { class: "pfill" });
    this.bar = el("div", { class: "pbar", onclick: (e) => this.onBarClick(e) }, this.fill);
    const fsBtn = el("button", { class: "pbtn", title: "Fullscreen", onclick: () => this.fullscreen() }, icon("fullscreen", 18));
    this.controls = el("div", { class: "pcontrols" }, this.playBtn, this.muteBtn, this.timeEl, el("span", { class: "flex1" }), fsBtn);

    this.el = el("div", { class: "player" }, this.screen, this.controls, this.bar);
    this.video.addEventListener("loadedmetadata", () => this.seek(this.editTime));
    this.video.addEventListener("pause", () => {
      if (this.playing && !this.video.ended) this.setPlaying(false);
    });
    players.add(this);
    this.updateUI();
  }

  onChange(fn) {
    this.listeners.add(fn);
  }

  setLayout(lay) {
    this.lay = lay;
    if (this.editTime > lay.duration) this.editTime = 0;
    if (!this.playing) this.seek(this.editTime);
    this.updateUI();
  }

  get duration() {
    return this.lay.duration;
  }

  clipFor(et) {
    const clips = this.lay.clips;
    for (let k = 0; k < clips.length; k++) if (et < clips[k].editEnd || k === clips.length - 1) return k;
    return 0;
  }

  seek(et) {
    const clips = this.lay.clips;
    if (!clips.length) return;
    et = Math.max(0, Math.min(et, this.duration - 0.05));
    this.idx = this.clipFor(et);
    const c = clips[this.idx];
    this.editTime = et;
    const src = c.srcStart + (et - c.editStart);
    if (this.video.readyState >= 1) this.video.currentTime = src;
    this.updateUI();
  }

  playFrom(et) {
    this.seek(et);
    this.play();
    this.el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  play() {
    if (!this.lay.clips.length) return;
    for (const p of players) if (p !== this) p.pause();
    if (this.editTime >= this.duration - 0.1) this.seek(0);
    const c = this.lay.clips[this.idx];
    const t = this.video.currentTime;
    if (t < c.srcStart - 0.25 || t > c.srcEnd + 0.25) this.video.currentTime = c.srcStart + (this.editTime - c.editStart);
    this.video.play().catch(() => {});
    this.setPlaying(true);
    const loop = () => {
      if (!this.playing) return;
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }

  pause() {
    if (!this.playing) return;
    this.video.pause();
    this.setPlaying(false);
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    this.muteBtn.replaceChildren(icon(this.video.muted ? "mute" : "volume", 18));
  }

  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else this.el.requestFullscreen?.();
  }

  setPlaying(p) {
    this.playing = p;
    this.playBtn.replaceChildren(icon(p ? "pause" : "play", 18));
    this.el.classList.toggle("playing", p);
    this.updateOverlays();
  }

  tick() {
    const clips = this.lay.clips;
    let c = clips[this.idx];
    const t = this.video.currentTime;
    if (t >= c.srcEnd - 0.04) {
      if (this.idx + 1 < clips.length) {
        this.idx++;
        c = clips[this.idx];
        this.video.currentTime = c.srcStart;
        this.editTime = c.editStart;
      } else {
        this.editTime = this.duration;
        this.pause();
      }
    } else {
      this.editTime = c.editStart + Math.max(0, t - c.srcStart);
    }
    this.updateUI();
  }

  onBarClick(e) {
    const r = this.bar.getBoundingClientRect();
    const et = ((e.clientX - r.left) / r.width) * this.duration;
    const was = this.playing;
    this.seek(et);
    if (was) this.play();
  }

  updateUI() {
    this.timeEl.textContent = `${fmtTime(this.editTime)} / ${fmtTime(this.duration)}`;
    this.fill.style.width = (this.duration ? (100 * this.editTime) / this.duration : 0) + "%";
    this.updateOverlays();
    for (const fn of this.listeners) fn(this.editTime);
  }

  updateOverlays() {
    const et = this.editTime;
    const b = this.lay.brolls.find((x) => et >= x.editStart && et < x.editEnd);
    const key = b ? b.seg + ":" + (b.mediaItem?.file || b.keyword) : "";
    if (key !== this.overlayKey) {
      this.overlayKey = key;
      this.brollLayer.replaceChildren();
      if (b) this.brollLayer.append(brollMedia(b, true));
    }
    const vid = this.brollLayer.querySelector("video");
    if (vid) this.playing ? vid.play().catch(() => {}) : vid.pause();

    const tx = this.lay.texts.filter((x) => et >= x.editStart && et < x.editEnd);
    const tkey = tx.map((x) => x.seg).join(",");
    if (tkey !== this.textKey) {
      this.textKey = tkey;
      this.textLayer.replaceChildren(...tx.map((x) => el("div", { class: `fx fx-${x.style || "title"}` }, el("span", {}, x.text))));
    }
  }

  destroy() {
    this.pause();
    players.delete(this);
    this.video.removeAttribute("src");
    this.video.load();
  }
}

export function pauseAll() {
  for (const p of players) p.pause();
}

// B-roll media element; a labelled card if the library had no match.
// Video B-rolls play only inside the player (autoplay). Thumbnails elsewhere use a still
// poster frame: live <video> elements inside clipped scroll areas do not scroll with
// the page in Chrome.
export function brollMedia(b, autoplay = false) {
  const m = b.mediaItem;
  if (!m) return el("div", { class: "broll-missing" }, el("div", {}, "No stock match"), el("b", {}, b.keyword));
  const src = "/materials/broll/" + m.file;
  if (m.type === "video") {
    if (autoplay) {
      const v = el("video", { src, muted: true, loop: true, playsinline: true, preload: "auto" });
      v.muted = true;
      return v;
    }
    const img = el("img", { alt: b.keyword, draggable: "false", "data-poster": src, class: "broll-poster" });
    posterFor(src).then((url) => {
      if (url) img.src = url;
    });
    return img;
  }
  return el("img", { src, alt: b.keyword, draggable: "false" });
}

const posters = new Map(); // video url -> Promise<dataURL|null>
function posterFor(src) {
  if (!posters.has(src)) {
    posters.set(src, new Promise((resolve) => {
      const v = document.createElement("video");
      v.muted = true;
      v.preload = "auto";
      v.src = src;
      const fail = () => resolve(null);
      v.addEventListener("error", fail, { once: true });
      v.addEventListener("loadeddata", () => {
        v.addEventListener("seeked", () => {
          const c = document.createElement("canvas");
          c.width = 160;
          c.height = Math.round((160 * v.videoHeight) / v.videoWidth) || 90;
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.7));
          v.removeAttribute("src");
          v.load();
        }, { once: true });
        v.currentTime = Math.min(1, (v.duration || 2) / 2);
      }, { once: true });
      setTimeout(fail, 8000);
    }));
  }
  return posters.get(src);
}
