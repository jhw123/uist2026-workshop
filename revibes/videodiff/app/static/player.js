// Composite video player: plays a version's edited video (its kept runs of the
// source, back to back) and overlays its B-rolls and text effects.
// Stands in for Remotion, which the paper used to render the edits.

import { fmt, escapeHtml } from './model.js';

let active = null;

export class CompositePlayer {
  constructor(model, videoUrl) {
    this.m = model;
    this.ed = 0;
    this.playing = false;
    this.el = document.createElement('div');
    this.el.className = 'player';
    this.el.innerHTML = `
      <div class="screen">
        <video preload="metadata" playsinline></video>
        <div class="broll-layer"></div>
        <div class="text-layer"></div>
        <div class="controls">
          <button class="pp" title="Play / pause">▶</button>
          <span class="time">0:00 / 0:00</span>
          <input class="seek" type="range" min="0" max="1" step="0.05" value="0">
          <button class="fs" title="Full screen">⛶</button>
        </div>
      </div>`;
    this.video = this.el.querySelector('video');
    this.video.src = videoUrl;
    this.brollLayer = this.el.querySelector('.broll-layer');
    this.textLayer = this.el.querySelector('.text-layer');
    this.ppBtn = this.el.querySelector('.pp');
    this.timeEl = this.el.querySelector('.time');
    this.seekEl = this.el.querySelector('.seek');
    this.ppBtn.onclick = e => { e.stopPropagation(); this.playing ? this.pause() : this.play(); };
    this.el.querySelector('.fs').onclick = e => {
      e.stopPropagation();
      const sc = this.el.querySelector('.screen');
      document.fullscreenElement ? document.exitFullscreen() : sc.requestFullscreen?.();
    };
    this.seekEl.oninput = () => this.seekEd(parseFloat(this.seekEl.value));
    this.el.querySelector('video').onclick = () => (this.playing ? this.pause() : this.play());
    this.video.addEventListener('loadedmetadata', () => { if (!this.playing) this.seekEd(this.ed); });
    this.video.addEventListener('ended', () => this.pause());
    this._brollKey = null;
    this._textKey = null;
  }

  setVersion(v) {
    this.v = v;
    this.keep = v.keep;
    this.total = this.m.editedDuration(this.keep);
    this.seekEl.max = String(Math.max(0.1, this.total));
    if (this.ed > this.total) this.ed = 0;
    this.seekEd(this.ed);
  }

  play() {
    if (!this.keep || !this.keep.length) return;
    if (active && active !== this) active.pause();
    active = this;
    if (this.ed >= this.total - 0.1) this.ed = 0;
    this.video.currentTime = this.m.edToSrc(this.keep, this.ed);
    this.playing = true;
    this.ppBtn.textContent = '❚❚';
    this.el.classList.add('is-playing');
    this.video.play().catch(() => {});
    const tick = () => {
      if (!this.playing) return;
      this.step();
      this._raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    this.video.pause();
    cancelAnimationFrame(this._raf);
    this.ppBtn.textContent = '▶';
    this.el.classList.remove('is-playing');
    this.el.querySelectorAll('.broll-layer video').forEach(v => v.pause());
  }

  // keep the source video inside the kept runs while playing
  step() {
    const runs = this.m.runs(this.keep);
    const t = this.video.currentTime;
    let r = runs.find(r => t >= r.s - 0.2 && t < r.e - 0.04);
    if (!r) {
      const next = runs.find(r => r.s > t - 0.04);
      if (!next) { this.ed = this.total; this.pause(); this.render(); return; }
      if (Math.abs(this.video.currentTime - next.s) > 0.05) this.video.currentTime = next.s;
      r = next;
    }
    this.ed = r.ed + Math.max(0, this.video.currentTime - r.s);
    this.render();
  }

  seekEd(et) {
    this.ed = Math.max(0, Math.min(et, this.total || 0));
    if (this.keep && this.keep.length && this.video.readyState >= 1) {
      this.video.currentTime = this.m.edToSrc(this.keep, this.ed);
    }
    this.render();
  }

  playFromEd(et) { this.seekEd(et); this.play(); }

  playFromSrc(t) { this.playFromEd(this.m.srcToEdNext(this.keep, t)); }

  render() {
    this.timeEl.textContent = `${fmt(this.ed)} / ${fmt(this.total)}`;
    if (document.activeElement !== this.seekEl) this.seekEl.value = String(this.ed);
    const src = this.keep && this.keep.length ? this.m.edToSrc(this.keep, this.ed) : 0;
    this.renderBroll(src);
    this.renderText(src);
  }

  renderBroll(src) {
    const b = (this.v?.brolls || []).find(b => {
      const sp = this.m.sentenceSpan(b.sentence);
      return src >= sp.s && src < sp.e;
    });
    const key = b ? `${b.sentence}|${b.media?.file || b.keyword}` : null;
    if (key !== this._brollKey) {
      this._brollKey = key;
      this.brollLayer.innerHTML = '';
      if (b) {
        if (b.media && b.media.type === 'video') {
          const v = document.createElement('video');
          v.src = `/media/broll/${b.media.file}`; v.muted = true; v.loop = true; v.playsInline = true;
          this.brollLayer.appendChild(v);
        } else if (b.media) {
          const img = document.createElement('img');
          img.src = `/media/broll/${b.media.file}`;
          this.brollLayer.appendChild(img);
        } else {
          this.brollLayer.innerHTML = `<div class="broll-missing">No stock result for “${escapeHtml(b.keyword)}”</div>`;
        }
      }
    }
    const bv = this.brollLayer.querySelector('video');
    if (bv) { if (this.playing && bv.paused) bv.play().catch(() => {}); if (!this.playing && !bv.paused) bv.pause(); }
  }

  renderText(src) {
    const t = (this.v?.texts || []).find(t => {
      const sp = this.m.sentenceSpan(t.sentence);
      const s = this.m.phraseStart(t.sentence, t.text);
      return src >= s && src < Math.max(sp.e, s + 1.8);
    });
    const key = t ? `${t.sentence}|${t.text}|${t.style}` : null;
    if (key === this._textKey) return;
    this._textKey = key;
    this.textLayer.innerHTML = t ? `<div class="fx fx-${t.style}"><span>${escapeHtml(t.text)}</span></div>` : '';
  }
}
