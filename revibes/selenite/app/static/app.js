/* Selenite revibe: reading interface. Plain JS, no build step. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const READ_MS = 2000;             // dwell-time threshold from the paper (2 seconds)
  const BATCH = 8;                  // paragraphs per annotation call
  const PARALLEL = 3;               // annotation calls in flight at once

  const state = {
    page: null, topic: null, samples: [], library: null,
    nav: {},                        // label name -> current paragraph pointer
    dwell: {},                      // paragraph index -> accumulated visible ms
    visibleSince: {},               // paragraph index -> timestamp
    read: new Set(), observer: null, tick: null, runToken: 0,
    recommendBusy: false, recommendedFor: null,
  };

  // ------------------------------------------------------------------ api
  async function api(method, path, body) {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    let data = {};
    try { data = await r.json(); } catch (e) { /* ignore */ }
    if (!r.ok) throw new Error(data.error || `${method} ${path} failed (${r.status})`);
    return data;
  }

  function toast(msg, isError = false, ms = 3500) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (isError ? ' error' : '');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), ms);
  }
  function setStage(text, busy = true) {
    const s = $('#stage'); s.textContent = text || ''; s.classList.toggle('busy', !!text && busy);
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ------------------------------------------------------------ bridge
  async function checkBridge() {
    const el = $('#bridge-status');
    try {
      const h = await api('GET', '/api/health');
      if (h.bridge && h.bridge.ok) { el.textContent = `bridge: ${h.bridge.backend} (${h.bridge.model})`; el.className = 'status ok'; }
      else { el.textContent = 'bridge: not running'; el.className = 'status bad'; el.title = 'Start it: python3 llm-bridge/bridge.py claude'; }
    } catch (e) { el.textContent = 'server: offline'; el.className = 'status bad'; }
  }

  // ------------------------------------------------------------ views
  function showHome() {
    stopTracking();
    $('#home').classList.remove('hidden'); $('#reader').classList.add('hidden');
    state.page = null; state.topic = null;
    history.replaceState(null, '', '/');
    loadLibrary();
  }
  function showReader() { $('#home').classList.add('hidden'); $('#reader').classList.remove('hidden'); }

  async function loadLibrary() {
    const lib = $('#library');
    let s;
    try { s = await api('GET', '/api/state'); } catch (e) { lib.innerHTML = `<p class="lib-empty">${esc(e.message)}</p>`; return; }
    state.samples = s.samples; renderSamplesMenu();
    const byTopic = {};
    s.pages.forEach(p => { (byTopic[p.topic_id || '_none'] ||= []).push(p); });
    let html = '';
    s.topics.sort((a, b) => b.created - a.created).forEach(t => {
      const pages = byTopic[t.id] || [];
      html += `<div class="lib-topic" data-topic="${t.id}"><h3>💡 ${esc(t.name)} <span class="spacer"></span>
        <button class="icon" data-act="rename-topic" title="Rename topic">✎</button>
        <button class="icon" data-act="delete-topic" title="Delete topic and its pages">🗑</button></h3>
        <div class="meta">${t.criteria.length} criteria · ${t.options.length} options · ${pages.length} page${pages.length === 1 ? '' : 's'}</div>`;
      pages.forEach(p => { html += libPage(p); });
      html += '</div>';
    });
    if (byTopic._none) {
      html += `<div class="lib-topic"><h3>Pages without a topic yet</h3>`;
      byTopic._none.forEach(p => { html += libPage(p); });
      html += '</div>';
    }
    if (!s.pages.length) {
      html += `<p class="lib-empty">Nothing read yet. Paste a web address above, paste an article's text, or open one of the sample pages.</p>`;
    }
    html += `<div class="lib-topic"><h3>Sample pages</h3><div class="meta">Bundled articles for trying Selenite without a network connection.</div>`;
    s.samples.forEach(sm => { html += `<div class="lib-page"><a data-sample="${sm.id}">${esc(sm.title)}</a><span class="meta">${esc(sm.note)}</span></div>`; });
    html += '</div>';
    lib.innerHTML = html;
    $$('[data-sample]', lib).forEach(a => a.onclick = () => openSample(a.dataset.sample));
    $$('[data-page]', lib).forEach(a => a.onclick = () => openExisting(a.dataset.page));
    $$('[data-act="delete-page"]', lib).forEach(b => b.onclick = async () => {
      if (!confirm('Delete this page from Selenite?')) return;
      await api('DELETE', `/api/pages/${b.closest('.lib-page').dataset.pid}`); loadLibrary();
    });
    $$('[data-act="rename-topic"]', lib).forEach(b => b.onclick = async () => {
      const tid = b.closest('.lib-topic').dataset.topic; const t = s.topics.find(x => x.id === tid);
      const name = prompt('Topic name:', t.name); if (!name) return;
      await api('PATCH', `/api/topics/${tid}`, { name }); loadLibrary();
    });
    $$('[data-act="delete-topic"]', lib).forEach(b => b.onclick = async () => {
      if (!confirm('Delete this topic, its criteria, options and all its pages?')) return;
      await api('DELETE', `/api/topics/${b.closest('.lib-topic').dataset.topic}`); loadLibrary();
    });
  }
  function libPage(p) {
    return `<div class="lib-page" data-pid="${p.id}"><a data-page="${p.id}">${esc(p.title)}</a>
      <span class="meta">${p.n_read}/${p.n_paragraphs} paragraphs read</span>
      <button class="icon" data-act="delete-page" title="Delete page">🗑</button></div>`;
  }
  function renderSamplesMenu() {
    const m = $('#samples-menu');
    m.innerHTML = state.samples.map(s => `<button class="item" data-sample="${s.id}">${esc(s.title)}<small>${esc(s.note)}</small></button>`).join('');
    $$('[data-sample]', m).forEach(b => b.onclick = () => { m.classList.add('hidden'); openSample(b.dataset.sample); });
  }

  // ------------------------------------------------------------ opening pages
  async function openUrl(url) {
    if (!url.trim()) return;
    try {
      setStage('Fetching the page…'); showReader(); renderArticleSkeleton(url);
      const r = await api('POST', '/api/pages', { url });
      await startPage(r.page, r.topic);
    } catch (e) { toast(e.message, true, 7000); setStage(''); showHome(); }
  }
  async function openSample(id) {
    try {
      const r = await api('POST', '/api/pages', { sample: id });
      showReader(); await startPage(r.page, r.topic);
    } catch (e) { toast(e.message, true, 7000); }
  }
  async function openText(title, text, url) {
    try {
      const r = await api('POST', '/api/pages', { title, text, url });
      showReader(); await startPage(r.page, r.topic);
    } catch (e) { toast(e.message, true, 7000); }
  }
  async function openExisting(pid) {
    try {
      const r = await api('GET', `/api/pages/${pid}`);
      showReader(); await startPage(r.page, r.topic);
    } catch (e) { toast(e.message, true); }
  }
  function renderArticleSkeleton(url) {
    $('#article-title').textContent = 'Loading…'; $('#article-url').textContent = url; $('#article-url').href = url;
    $('#paragraphs').innerHTML = ''; $('#summary').classList.add('hidden');
    $('#topic-name').textContent = '…'; $('#options-list').innerHTML = ''; $('#criteria-list').innerHTML = '';
  }

  /** Load a page into the reader and run whatever analysis stages are still missing. */
  async function startPage(page, topic) {
    const token = ++state.runToken;
    state.page = page; state.topic = topic; state.nav = {};
    state.read = new Set(page.read || []); state.dwell = {}; state.visibleSince = {};
    state.recommendedFor = null;
    history.replaceState(null, '', `/?page=${page.id}`);
    renderArticle(); renderSidebar(); startTracking();
    const pid = page.id;
    try {
      // 1. topic (D.1) + clustering
      if (!page.topic_id) {
        setStage('Recognizing the topic of this page…');
        const r = await api('POST', `/api/pages/${pid}/topic`, {});
        if (token !== state.runToken) return;
        state.page = r.page; state.topic = r.topic; renderSidebar();
      }
      // 2. criteria (D.3) and options (D.2) in parallel
      const jobs = [];
      if (!state.topic.criteria.length) {
        jobs.push((async () => {
          setStage('Retrieving commonly considered criteria…');
          const t = await api('POST', `/api/topics/${state.topic.id}/criteria/generate`, {});
          if (token !== state.runToken) return; state.topic = t; renderSidebar();
        })());
      }
      if (!state.page.options_verdict) {
        jobs.push((async () => {
          const r = await api('POST', `/api/pages/${pid}/options`, {});
          if (token !== state.runToken) return; state.page = r.page; state.topic = r.topic; renderSidebar();
        })());
      }
      if (jobs.length) { if (!$('#stage').textContent) setStage('Extracting the options on this page…'); await Promise.all(jobs); }
      if (token !== state.runToken) return;
      // 3. annotate paragraphs (NLI stand-in)
      const todo = state.page.paragraphs.filter(p => !p.annotated).map(p => p.index);
      await annotateIndices(todo, null, token);
      if (token !== state.runToken) return;
      setStage('');
    } catch (e) { if (token === state.runToken) { setStage(''); toast(e.message, true, 8000); } }
  }

  async function annotateIndices(indices, criteriaIds, token) {
    if (!indices.length) return;
    const batches = []; for (let i = 0; i < indices.length; i += BATCH) batches.push(indices.slice(i, i + BATCH));
    let done = 0, failed = 0;
    const label = criteriaIds ? 'Annotating paragraphs for the new criteria' : 'Annotating paragraphs';
    setStage(`${label} (0/${batches.length})…`);
    let next = 0;
    const worker = async () => {
      while (next < batches.length) {
        const b = batches[next++];
        try {
          const r = await api('POST', `/api/pages/${state.page.id}/annotate`, { indices: b, criteria_ids: criteriaIds || undefined });
          if (token !== state.runToken) return;
          r.paragraphs.forEach(p => { state.page.paragraphs[p.index] = p; renderParagraphAnnotations(p.index); });
          state.page.options = r.page_options; state.topic = r.topic;
        } catch (e) { failed++; console.warn(e); }
        done++; setStage(`${label} (${done}/${batches.length})…`); renderSidebar(); updateSummary();
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker));
    if (failed) toast(`${failed} annotation batch${failed > 1 ? 'es' : ''} failed; reopen the page to retry.`, true, 6000);
  }

  // ------------------------------------------------------------ article rendering
  function renderArticle() {
    const p = state.page;
    $('#article-title').textContent = p.title;
    const a = $('#article-url');
    if (p.url && /^https?:/.test(p.url)) { a.textContent = p.url; a.href = p.url; } else { a.textContent = p.url || ''; a.removeAttribute('href'); }
    $('#article-source').textContent = p.source === 'sample' ? '· sample page' : p.source === 'text' ? '· pasted text' : '';
    const host = $('#paragraphs');
    host.innerHTML = p.paragraphs.map(q => `<div class="para${state.read.has(q.index) ? ' read' : ''}" data-i="${q.index}">
        <div class="annot"></div>
        <button class="analyze" title="Zoom in: which phrases pertain to which criteria and sentiments">💡 Analyze</button>
        ${q.tag === 'h' ? `<h2>${esc(q.text)}</h2>` : `<p>${esc(q.text)}</p>`}
      </div>`).join('');
    $$('.para', host).forEach(el => {
      const i = +el.dataset.i;
      $('.analyze', el).onclick = (ev) => { ev.stopPropagation(); zoomIn(i); };
      renderParagraphAnnotations(i);
    });
    $('#article').scrollTop = 0;
    updateSummary();
  }

  function renderParagraphAnnotations(i) {
    const q = state.page.paragraphs[i];
    const el = $(`.para[data-i="${i}"]`); if (!el) return;
    const annot = $('.annot', el);
    if (!q.annotated) { annot.innerHTML = state.topic && state.topic.criteria.length ? '<span class="pending">analyzing…</span>' : ''; }
    else {
      const chips = [...q.criteria.map(c => chip(c.name, 'crit', c.score)), ...q.options.map(o => chip(o.name, 'opt', o.score))];
      annot.innerHTML = chips.join('') || '<span class="pending">no criteria recognized</span>';
      $$('.chip', annot).forEach(c => c.onclick = () => navigate(c.dataset.name, c.dataset.kind, 'here', i));
    }
    const body = $('p, h2', el);
    if (q.zoom && q.zoom.length) { body.innerHTML = renderZoom(q.text, q.zoom); if (!$('.zoom-legend', el)) el.insertAdjacentHTML('beforeend', legend()); }
    else if (q.zoom && !q.zoom.length) { if (!$('.zoom-legend', el)) el.insertAdjacentHTML('beforeend', '<div class="zoom-legend">Zoom in found no phrases for the criteria of this paragraph.</div>'); }
  }
  function chip(name, kind, score) {
    const weak = score !== undefined && score < 0.75;
    return `<span class="chip ${kind === 'opt' ? 'opt' : ''}${weak ? ' weak' : ''}" data-name="${esc(name)}" data-kind="${kind}" title="${kind === 'opt' ? 'option' : 'criterion'}${score !== undefined ? ' · score ' + score : ''} · click to jump to the next mention">${esc(name)}</span>`;
  }
  function legend() {
    return `<div class="zoom-legend"><span><span class="sw" style="background:var(--pos)"></span>positive</span><span><span class="sw" style="background:var(--neg)"></span>negative</span><span><span class="sw" style="background:var(--neu)"></span>neutral</span><span>· labels show the criterion and, where known, the option the phrase is about</span></div>`;
  }
  function renderZoom(text, phrases) {
    const sorted = [...phrases].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
    let out = '', pos = 0;
    for (const ph of sorted) {
      if (ph.start < pos) continue;             // skip overlaps
      out += esc(text.slice(pos, ph.start));
      const subj = ph.subject ? ` <span class="subj">· ${esc(ph.subject)}</span>` : '';
      out += `<span class="zoom ${ph.sentiment}" title="${esc(ph.criterion)} · ${ph.sentiment}${ph.subject ? ' · about ' + esc(ph.subject) : ''}"><span class="zlabel">${esc(ph.criterion)}${subj}</span>${esc(text.slice(ph.start, ph.end))}</span>`;
      pos = ph.end;
    }
    return out + esc(text.slice(pos));
  }

  async function zoomIn(i) {
    const el = $(`.para[data-i="${i}"] .analyze`);
    el.classList.add('busy'); el.textContent = 'Analyzing…';
    try {
      const r = await api('POST', `/api/pages/${state.page.id}/paragraphs/${i}/zoom`, { force: !!state.page.paragraphs[i].zoom });
      state.page.paragraphs[i] = r.paragraph; renderParagraphAnnotations(i);
    } catch (e) { toast(e.message, true, 6000); }
    el.classList.remove('busy'); el.textContent = '💡 Analyze';
  }

  // ------------------------------------------------------------ navigation by criterion
  function mentions(name, kind) {
    const key = kind === 'opt' ? 'options' : 'criteria';
    return state.page.paragraphs.filter(q => q[key].some(l => l.name === name)).map(q => q.index);
  }
  function navigate(name, kind, dir, fromIndex) {
    const list = mentions(name, kind);
    if (!list.length) { toast(`"${name}" is not mentioned on this page.`); return; }
    const k = kind + ':' + name;
    let idx;
    if (dir === 'here') { idx = list.indexOf(fromIndex); idx = (idx + 1) % list.length; }
    else { const cur = state.nav[k] ?? -1; idx = dir === 'next' ? (cur + 1) % list.length : (cur - 1 + list.length) % list.length; }
    state.nav[k] = idx;
    const el = $(`.para[data-i="${list[idx]}"]`);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $$('.para.flash').forEach(x => x.classList.remove('flash')); el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1600);
    const card = $(`.card[data-key="${CSS.escape(k)}"] .pos`); if (card) card.textContent = `${idx + 1}/${list.length}`;
  }

  // ------------------------------------------------------------ sidebar
  function renderSidebar() {
    const t = state.topic;
    $('#topic-name').textContent = t ? t.name : '…';
    renderList('options'); renderList('criteria');
    updateSummary();
  }
  function sortedItems(kind) {
    const t = state.topic; if (!t) return [];
    const items = kind === 'opt' ? t.options : t.criteria;
    return [...items.filter(x => x.pinned), ...items.filter(x => !x.pinned)];
  }
  function renderList(which) {
    const kind = which === 'options' ? 'opt' : 'crit';
    const host = $(`#${which}-list`);
    const items = sortedItems(kind);
    if (!state.topic) { host.innerHTML = ''; return; }
    if (!items.length) {
      host.innerHTML = `<span class="empty">${which === 'options' ? 'No options extracted yet.' : (state.topic.criteria_status === 'generating' ? 'Retrieving criteria…' : 'No criteria yet.')}</span>`; return;
    }
    const open = host._open || null;
    host.innerHTML = items.map(it => {
      const n = mentions(it.name, kind).length;
      const key = kind + ':' + it.name;
      if (open === it.id) return card(it, kind, n, key);
      return `<span class="chip ${kind === 'opt' ? 'opt' : ''}${n ? '' : ' absent'}${it.pinned ? ' pinned' : ''}" draggable="true" data-id="${it.id}" data-name="${esc(it.name)}" data-kind="${kind}" title="${n ? n + ' mention' + (n > 1 ? 's' : '') + ' on this page' : 'not on this page'} · click for details, drag to reorder">${esc(it.name)}${n ? `<span class="count">${n}</span>` : ''}</span>`;
    }).join('');
    $$('.chip', host).forEach(c => {
      c.onclick = () => { host._open = c.dataset.id; renderList(which); };
      c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); };
      c.ondragend = () => c.classList.remove('dragging');
      c.ondragover = (e) => { e.preventDefault(); const before = e.offsetX < c.offsetWidth / 2; c.classList.toggle('drop-before', before); c.classList.toggle('drop-after', !before); };
      c.ondragleave = () => c.classList.remove('drop-before', 'drop-after');
      c.ondrop = async (e) => {
        e.preventDefault(); const before = c.classList.contains('drop-before'); c.classList.remove('drop-before', 'drop-after');
        const src = e.dataTransfer.getData('text/plain'); if (!src || src === c.dataset.id) return;
        const list = (kind === 'opt' ? state.topic.options : state.topic.criteria).map(x => x.id).filter(x => x !== src);
        const at = list.indexOf(c.dataset.id) + (before ? 0 : 1); list.splice(at, 0, src);
        state.topic = await api('POST', `/api/topics/${state.topic.id}/${which}/reorder`, { ids: list }); renderList(which);
      };
    });
    const cardEl = $('.card', host);
    if (cardEl) bindCard(cardEl, which, kind, host);
  }
  function card(it, kind, n, key) {
    const list = mentions(it.name, kind); const cur = state.nav[key];
    const pos = list.length ? `${cur === undefined ? '–' : cur + 1}/${list.length}` : '';
    return `<div class="card ${kind === 'opt' ? 'opt-card' : ''}" data-key="${esc(key)}" data-id="${it.id}">
      <div class="head">
        <span class="name" contenteditable="true" spellcheck="false" title="Click to edit the name">${esc(it.name)}</span>
        <span class="mentions">${n ? n + ' mention' + (n > 1 ? 's' : '') : 'not on this page'}</span>
        <span class="nav"><button class="icon" data-act="prev" title="Previous mention" ${n ? '' : 'disabled'}>‹</button><span class="pos" style="font-size:11px;color:#6b7280">${pos}</span><button class="icon" data-act="next" title="Next mention" ${n ? '' : 'disabled'}>›</button></span>
        <span class="spacer"></span>
        <button class="icon" data-act="pin" title="${it.pinned ? 'Unpin' : 'Pin to top'}">${it.pinned ? '📌' : '⤒'}</button>
        <button class="icon" data-act="delete" title="Delete">⊗</button>
        <button class="icon" data-act="close" title="Collapse">×</button>
      </div>
      ${kind === 'crit' ? `<div class="desc${it.description ? '' : ' empty'}" contenteditable="true" title="Click to edit the description">${esc(it.description || 'Add a description…')}</div>` : ''}
    </div>`;
  }
  function bindCard(el, which, kind, host) {
    const id = el.dataset.id; const key = el.dataset.key; const [, name] = key.split(/:(.*)/);
    const patch = async (body) => { state.topic = await api('PATCH', `/api/topics/${state.topic.id}/${which}/${id}`, body); };
    $('[data-act="prev"]', el).onclick = () => navigate(name, kind, 'prev');
    $('[data-act="next"]', el).onclick = () => navigate(name, kind, 'next');
    $('[data-act="close"]', el).onclick = () => { host._open = null; renderList(which); };
    $('[data-act="pin"]', el).onclick = async () => { const it = (kind === 'opt' ? state.topic.options : state.topic.criteria).find(x => x.id === id); await patch({ pinned: !it.pinned }); renderList(which); };
    $('[data-act="delete"]', el).onclick = async () => {
      if (!confirm(`Delete "${name}"?`)) return;
      state.topic = await api('DELETE', `/api/topics/${state.topic.id}/${which}/${id}`);
      stripLabel(kind, name); host._open = null; renderSidebar(); state.page.paragraphs.forEach(q => renderParagraphAnnotations(q.index));
    };
    const nameEl = $('.name', el);
    const commitName = async () => {
      const v = nameEl.textContent.trim(); if (!v || v === name) { nameEl.textContent = name; return; }
      await patch({ name: v }); relabel(kind, name, v); host._open = id; renderSidebar(); state.page.paragraphs.forEach(q => renderParagraphAnnotations(q.index));
    };
    nameEl.onblur = commitName; nameEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); } };
    const descEl = $('.desc', el);
    if (descEl) {
      descEl.onfocus = () => { if (descEl.classList.contains('empty')) { descEl.textContent = ''; descEl.classList.remove('empty'); } };
      descEl.onblur = async () => { const v = descEl.textContent.trim(); await patch({ description: v }); if (!v) { descEl.textContent = 'Add a description…'; descEl.classList.add('empty'); } };
      descEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); descEl.blur(); } };
    }
  }
  function relabel(kind, oldName, newName) {
    const key = kind === 'opt' ? 'options' : 'criteria';
    state.page.paragraphs.forEach(q => { q[key].forEach(l => { if (l.name === oldName) l.name = newName; }); if (q.zoom && kind === 'crit') q.zoom.forEach(z => { if (z.criterion === oldName) z.criterion = newName; }); });
    if (kind === 'opt') state.page.options = state.page.options.map(o => o === oldName ? newName : o);
  }
  function stripLabel(kind, name) {
    const key = kind === 'opt' ? 'options' : 'criteria';
    state.page.paragraphs.forEach(q => { q[key] = q[key].filter(l => l.name !== name); if (q.zoom && kind === 'crit') q.zoom = q.zoom.filter(z => z.criterion !== name); });
    if (kind === 'opt') state.page.options = state.page.options.filter(o => o !== name);
  }

  // ---- criteria actions
  async function requestMoreCriteria() {
    if (!state.topic) return;
    const btn = $('#more-criteria'); btn.disabled = true; setStage('Requesting more criteria…');
    try {
      const r = await api('POST', `/api/topics/${state.topic.id}/criteria/more`, {});
      state.topic = r.topic; renderSidebar();
      if (r.added.length) { toast(`Added ${r.added.length} criteria: ${r.added.map(c => c.name).join(', ')}`); await annotateNewCriteria(r.added.map(c => c.id)); }
      else toast('The model had no new criteria to add.');
    } catch (e) { toast(e.message, true, 6000); }
    btn.disabled = false; setStage('');
  }
  async function addCriterion() {
    if (!state.topic) return;
    modal(`<h2>Add a criterion</h2><label>Name</label><input id="m-name" placeholder="e.g. Brake system"><label>Description (optional, helps the annotation)</label><input id="m-desc" placeholder="e.g. Having a reliable brake system that is easy to engage and disengage.">
      <div class="actions"><button class="ghost" data-close>Cancel</button><button class="primary" id="m-ok">Add</button></div>`, async (card) => {
      const name = $('#m-name', card).value.trim(); if (!name) return false;
      const r = await api('POST', `/api/topics/${state.topic.id}/criteria`, { name, description: $('#m-desc', card).value.trim() });
      state.topic = r.topic; renderSidebar();
      if (r.added.length) await annotateNewCriteria(r.added.map(c => c.id)); else toast('That criterion already exists.');
      return true;
    });
  }
  async function annotateNewCriteria(ids) {
    const token = state.runToken;
    await annotateIndices(state.page.paragraphs.map(q => q.index), ids, token);
    if (token === state.runToken) { setStage(''); renderSidebar(); }
  }
  async function addOption() {
    const name = prompt('Option name:'); if (!name || !name.trim()) return;
    state.topic = await api('POST', `/api/topics/${state.topic.id}/options`, { name: name.trim(), page_id: state.page.id });
    if (!state.page.options.includes(name.trim())) state.page.options.push(name.trim());
    renderSidebar();
  }

  // ---- topic menu
  function topicMenu(anchor) {
    const items = [
      { label: 'Rename topic', act: async () => { const n = prompt('Topic name:', state.topic.name); if (!n) return; state.topic = await api('PATCH', `/api/topics/${state.topic.id}`, { name: n }); renderSidebar(); } },
      { label: 'Move this page to another topic…', sub: 'Reassign the page; it will be re-annotated with that topic\'s criteria', act: movePage },
      { label: 'Start a new topic for this page…', act: async () => { const n = prompt('New topic name:', state.page.recognized_topic || ''); if (!n) return; await reassign({ new_topic: n }); } },
      { label: 'Recognize the topic again', sub: 'Ask the model again (may cluster into an existing topic)', act: () => reassign({}) },
      { sep: true },
      { label: 'Re-extract options from this page', act: async () => { setStage('Extracting the options on this page…'); try { const r = await api('POST', `/api/pages/${state.page.id}/options`, {}); state.page = r.page; state.topic = r.topic; renderSidebar(); } catch (e) { toast(e.message, true); } setStage(''); } },
      { label: 'Regenerate criteria for this topic', sub: 'Replaces the model-generated criteria (keeps the ones you added)', danger: true, act: async () => { if (!confirm('Replace the generated criteria and re-annotate the page?')) return; await regenerate(); } },
      { label: 'Re-annotate all paragraphs', act: async () => { state.page.paragraphs.forEach(q => { q.annotated = false; q.criteria = []; q.options = []; }); state.page.paragraphs.forEach(q => renderParagraphAnnotations(q.index)); await annotateIndices(state.page.paragraphs.map(q => q.index), null, state.runToken); setStage(''); renderSidebar(); } },
      { sep: true },
      { label: 'Delete this topic and its pages', danger: true, act: async () => { if (!confirm('Delete this topic, its criteria, options and pages?')) return; await api('DELETE', `/api/topics/${state.topic.id}`); showHome(); } },
    ];
    popover(anchor, items);
  }
  async function reassign(body) {
    setStage('Recognizing the topic of this page…');
    try { const r = await api('POST', `/api/pages/${state.page.id}/topic`, body); await startPage(r.page, r.topic); }
    catch (e) { toast(e.message, true, 6000); setStage(''); }
  }
  async function movePage() {
    const s = await api('GET', '/api/state');
    const others = s.topics.filter(t => t.id !== state.topic.id);
    if (!others.length) { toast('There is no other topic yet.'); return; }
    modal(`<h2>Move this page to another topic</h2><label>Topic</label><select id="m-topic">${others.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <div class="actions"><button class="ghost" data-close>Cancel</button><button class="primary" id="m-ok">Move</button></div>`, async (card) => { await reassign({ topic_id: $('#m-topic', card).value }); return true; });
  }
  async function regenerate() {
    setStage('Retrieving commonly considered criteria…');
    try {
      state.topic = await api('POST', `/api/topics/${state.topic.id}/criteria/generate`, { force: true });
      state.page.paragraphs.forEach(q => { q.annotated = false; q.criteria = []; q.zoom = null; });
      renderArticle(); renderSidebar();
      await annotateIndices(state.page.paragraphs.map(q => q.index), null, state.runToken); setStage(''); renderSidebar();
    } catch (e) { toast(e.message, true); setStage(''); }
  }
  function optionsMenu(anchor) {
    popover(anchor, [
      { label: 'Add an option…', act: addOption },
      { label: 'Re-extract options from this page', act: async () => { setStage('Extracting the options on this page…'); try { const r = await api('POST', `/api/pages/${state.page.id}/options`, {}); state.page = r.page; state.topic = r.topic; renderSidebar(); } catch (e) { toast(e.message, true); } setStage(''); } },
    ]);
  }
  function criteriaMenu(anchor) {
    popover(anchor, [
      { label: 'Add a criterion…', act: addCriterion },
      { label: 'Request more criteria', act: requestMoreCriteria },
      { label: 'Regenerate criteria for this topic', danger: true, act: regenerate },
    ]);
  }

  // ------------------------------------------------------------ dwell-time tracking + summary block
  function startTracking() {
    stopTracking();
    const paras = $$('.para');
    state.observer = new IntersectionObserver((entries) => {
      const now = performance.now();
      entries.forEach(en => {
        const i = +en.target.dataset.i;
        if (en.isIntersecting) state.visibleSince[i] = now;
        else if (state.visibleSince[i] !== undefined) { state.dwell[i] = (state.dwell[i] || 0) + (now - state.visibleSince[i]); delete state.visibleSince[i]; }
      });
    }, { root: $('#article'), threshold: 0.6 });
    paras.forEach(p => state.observer.observe(p));
    const sumObs = new IntersectionObserver((entries) => { if (entries.some(e => e.isIntersecting)) onSummaryVisible(); }, { root: $('#article'), threshold: 0.2 });
    sumObs.observe($('#summary')); state.sumObs = sumObs;
    state.tick = setInterval(() => {
      const now = performance.now(); let changed = false;
      Object.keys(state.visibleSince).forEach(i => {
        const total = (state.dwell[i] || 0) + (now - state.visibleSince[i]);
        if (total >= READ_MS && !state.read.has(+i)) { state.read.add(+i); changed = true; const el = $(`.para[data-i="${i}"]`); if (el) el.classList.add('read'); }
      });
      if (changed) { updateSummary(); persistReading(); }
    }, 500);
  }
  function stopTracking() {
    if (state.observer) state.observer.disconnect(); if (state.sumObs) state.sumObs.disconnect();
    clearInterval(state.tick); state.observer = state.sumObs = state.tick = null;
  }
  let persistT;
  function persistReading() { clearTimeout(persistT); persistT = setTimeout(() => api('POST', `/api/pages/${state.page.id}/reading`, { read: [...state.read] }).catch(() => {}), 800); }

  function summarySets() {
    const looked = new Set(), onPage = new Set();
    state.page.paragraphs.forEach(q => { q.criteria.forEach(c => { onPage.add(c.name); if (state.read.has(q.index)) looked.add(c.name); }); });
    const ignored = [...onPage].filter(n => !looked.has(n));
    const order = state.topic ? state.topic.criteria.map(c => c.name) : [];
    const byOrder = (a, b) => order.indexOf(a) - order.indexOf(b);
    return { looked: [...looked].sort(byOrder), ignored: ignored.sort(byOrder) };
  }
  function updateSummary() {
    const box = $('#summary'); if (!state.page || !state.topic) return;
    const anyAnnotated = state.page.paragraphs.some(q => q.annotated);
    if (!anyAnnotated) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const { looked, ignored } = summarySets();
    const recs = state.page.recommendations || [];
    const chips = (names, cls = '') => names.length ? names.map(n => `<span class="chip ${cls}" data-name="${esc(n)}">${esc(n)}</span>`).join('') : '<span class="none">none yet</span>';
    const q = (c) => `https://www.google.com/search?q=${encodeURIComponent(`${state.topic.name} ${c}`)}`;
    box.innerHTML = `<div class="row"><i>Criteria that you looked at:</i><div class="chips">${chips(looked)}</div></div>
      <div class="row"><i>Criteria that you ignored:</i><div class="chips">${chips(ignored)}</div></div>
      <div class="row"><i>You might be interested in further searching for “${esc(state.topic.name)}” based on:</i>
        <div class="chips">${recs.length ? recs.map(n => `<a class="chip rec" href="${q(n)}" target="_blank" rel="noopener" title="Search the web for this">${esc(n)}</a>`).join('') : `<span class="none">${state.recommendBusy ? 'thinking…' : 'scroll to the end of the page, or press Suggest'}</span>`}</div></div>
      <div class="foot"><span>Looked at = paragraphs you spent at least 2 seconds on. Suggestions are criteria not discussed in any page of this topic, chosen for relevance to what you read and diversity.</span><span class="spacer"></span><button class="ghost" id="rec-btn" ${state.recommendBusy ? 'disabled' : ''}>${state.recommendBusy ? 'Suggesting…' : 'Suggest'}</button></div>`;
    $$('.row .chip:not(.rec)', box).forEach(c => c.onclick = () => navigate(c.dataset.name, 'crit', 'next'));
    $('#rec-btn', box).onclick = () => recommend(true);
  }
  function onSummaryVisible() {
    if (!state.page || !state.topic) return;
    const key = state.page.id + ':' + state.read.size;
    if (state.recommendedFor === key || state.recommendBusy) return;
    if (!state.page.paragraphs.every(q => q.annotated)) return;
    if (!(state.page.recommendations || []).length || state.recommendedFor === null) recommend(false);
  }
  async function recommend(force) {
    if (state.recommendBusy) return;
    const key = state.page.id + ':' + state.read.size;
    if (!force && state.recommendedFor === key) return;
    state.recommendBusy = true; updateSummary();
    try {
      const { looked, ignored } = summarySets();
      const r = await api('POST', `/api/pages/${state.page.id}/recommend`, { cared: looked, skipped: ignored });
      state.page.recommendations = r.recommended; state.recommendedFor = key;
      if (!r.recommended.length) toast('Every criterion of this topic has already appeared in a page you read.');
    } catch (e) { toast(e.message, true, 6000); }
    state.recommendBusy = false; updateSummary();
  }

  // ------------------------------------------------------------ modal + popover
  function modal(html, onOk) {
    const m = $('#modal'), card = $('#modal-card');
    card.innerHTML = html; m.classList.remove('hidden');
    const close = () => m.classList.add('hidden');
    $$('[data-close]', card).forEach(b => b.onclick = close);
    const ok = $('#m-ok', card);
    if (ok) ok.onclick = async () => { ok.disabled = true; try { if (await onOk(card) !== false) close(); } catch (e) { toast(e.message, true, 6000); } ok.disabled = false; };
    m.onclick = (e) => { if (e.target === m) close(); };
    const first = $('input, textarea, select', card); if (first) first.focus();
  }
  function popover(anchor, items) {
    const p = $('#popover');
    p.innerHTML = items.map(it => it.sep ? '<div class="sep"></div>' : `<button class="item${it.danger ? ' danger' : ''}">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`).join('');
    const btns = $$('.item', p); let k = 0;
    items.forEach(it => { if (it.sep) return; btns[k++].onclick = () => { p.classList.add('hidden'); it.act(); }; });
    const r = anchor.getBoundingClientRect();
    p.style.top = (r.bottom + 4) + 'px'; p.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; p.style.left = 'auto';
    p.classList.remove('hidden');
    setTimeout(() => document.addEventListener('click', function h(e) { if (!p.contains(e.target)) { p.classList.add('hidden'); document.removeEventListener('click', h); } }), 0);
  }

  // ------------------------------------------------------------ wiring
  $('#brand').onclick = showHome;
  $('#open-form').onsubmit = (e) => { e.preventDefault(); const v = $('#url-input').value; $('#url-input').value = ''; openUrl(v); };
  $('#paste-btn').onclick = () => modal(`<h2>Paste an article</h2><label>Title</label><input id="m-title" placeholder="Article title"><label>Source address (optional)</label><input id="m-url" placeholder="https://…"><label>Text or HTML</label><textarea id="m-text" placeholder="Paste the article's text here, with blank lines between paragraphs (or paste its HTML)."></textarea>
    <div class="actions"><button class="ghost" data-close>Cancel</button><button class="primary" id="m-ok">Read with Selenite</button></div>`,
    async (card) => { const text = $('#m-text', card).value; if (!text.trim()) return false; await openText($('#m-title', card).value.trim(), text, $('#m-url', card).value.trim()); return true; });
  $('#samples-btn').onclick = (e) => { e.stopPropagation(); const m = $('#samples-menu'); m.classList.toggle('hidden'); m.style.top = '36px'; m.style.left = '0'; };
  document.addEventListener('click', (e) => { if (!e.target.closest('.samples-wrap')) $('#samples-menu').classList.add('hidden'); });
  $('#sb-collapse').onclick = () => { $('#sidebar').classList.add('collapsed'); $('#sidebar-toggle').classList.remove('hidden'); };
  $('#sidebar-toggle').onclick = () => { $('#sidebar').classList.remove('collapsed'); $('#sidebar-toggle').classList.add('hidden'); };
  $('#topic-menu-btn').onclick = (e) => { e.stopPropagation(); if (state.topic) topicMenu(e.currentTarget); };
  $('#options-menu-btn').onclick = (e) => { e.stopPropagation(); if (state.topic) optionsMenu(e.currentTarget); };
  $('#criteria-menu-btn').onclick = (e) => { e.stopPropagation(); if (state.topic) criteriaMenu(e.currentTarget); };
  $('#topic-name').onclick = async () => { if (!state.topic) return; const n = prompt('Topic name:', state.topic.name); if (!n || n === state.topic.name) return; state.topic = await api('PATCH', `/api/topics/${state.topic.id}`, { name: n }); renderSidebar(); };
  $('#more-criteria').onclick = requestMoreCriteria;
  $('#add-criterion').onclick = addCriterion;

  checkBridge(); setInterval(checkBridge, 15000);
  const pid = new URLSearchParams(location.search).get('page');
  if (pid) openExisting(pid); else showHome();
})();
