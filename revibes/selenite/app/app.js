(() => {
  if (window.__selenite) { window.__selenite.toggle(); return; }
  const extension = Boolean(globalThis.chrome?.runtime?.id);
  const logic = globalThis.SeleniteLogic;
  const storage = {
    async get() { return extension ? (await chrome.storage.local.get('selenite')).selenite : JSON.parse(localStorage.getItem('selenite') || 'null'); },
    async set(value) { if (extension) await chrome.storage.local.set({selenite: value}); else localStorage.setItem('selenite', JSON.stringify(value)); }
  };
  const api = async (action, payload = {}) => {
    if (extension) {
      const reply = await chrome.runtime.sendMessage({type: 'selenite-api', action, payload});
      if (reply.error) throw new Error(reply.error);
      return reply.result;
    }
    const response = await fetch(`/api/${action}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)});
    const reply = await response.json();
    if (!response.ok) throw new Error(reply.error || 'Backend failed');
    return reply;
  };
  const element = (tag, text, className) => {
    const result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    if (className) result.className = className;
    return result;
  };
  const button = (text, handler, className = '') => {
    const result = element('button', text, className);
    result.type = 'button';
    result.addEventListener('click', handler);
    return result;
  };
  const uid = () => crypto.randomUUID();
  const host = element('div');
  host.id = 'selenite-root';
  const sidebarWidth = 'clamp(260px, 43vw, 390px)';
  host.style.cssText = `position:fixed;right:0;top:0;height:100vh;width:${sidebarWidth};z-index:2147483647;color-scheme:light;`;
  const shadow = host.attachShadow({mode: 'open'});
  const style = element('style');
  style.textContent = `
    :host{all:initial;color:#243237;font:14px/1.5 system-ui,sans-serif}*{box-sizing:border-box}[hidden]{display:none!important}
    aside{height:100%;background:#fafcfb;border-left:1px solid #dce5e1;box-shadow:-8px 0 32px #153e2310;display:flex;flex-direction:column}
    header{padding:20px 22px 12px;border-bottom:1px solid #dce5e1}h1{font:600 25px Georgia,serif;margin:0;color:#164e43}h2{font-size:13px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.08em;color:#5b716c}
    .brand{display:flex;align-items:center;justify-content:space-between}.eyebrow{font-size:10px;letter-spacing:.12em;color:#6d807b;text-transform:uppercase}
    main{overflow:auto;flex:1;padding:18px 22px}section{padding:0 0 22px;margin:0 0 20px;border-bottom:1px solid #e0e8e4}
    button,select,input{font:inherit}button{cursor:pointer;border:1px solid #ceddd6;background:white;color:#26574b;border-radius:6px;padding:5px 9px}button:hover{background:#edf6f1}button:disabled{opacity:.5;cursor:wait}
    .primary{background:#1b5d4d;color:white;border-color:#1b5d4d;padding:9px 12px}.primary:hover{background:#28745f}.toolbar{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
    .chip{background:#e4f1f8;border:0;color:#274c61;padding:3px 7px;margin:2px;border-radius:4px}.option{background:#fcebd9;color:#705434}.absent{opacity:.4}.selected{outline:2px solid #417966}
    .entry{padding:8px 0;border-bottom:1px solid #edf1ef}.entry-top{display:flex;align-items:center;gap:6px}.entry-top>.chip{flex:1;text-align:left}.count{font-size:11px;white-space:nowrap;color:#71837e}
    .description{font-size:12px;color:#60736c;padding:6px 3px}.tiny{font-size:11px;padding:2px 5px}.muted{font-size:12px;color:#73847e}.status{padding:12px 22px;background:#edf4ef;font-size:12px;white-space:pre-line}.error{background:#fff0e9;color:#963a24}.substitution{font-size:11px;color:#6d7f78;margin-top:10px}
    select{width:100%;padding:8px;border:1px solid #d5e0da;border-radius:6px;background:white;color:#26483d}.empty{padding:14px;border:1px dashed #c8d9cf;border-radius:8px;color:#657a70}.progress{background:#eff6f0;padding:14px;border-radius:8px}.group{margin:12px 0}.group-label{display:block;font-size:12px;font-style:italic;margin-bottom:5px}
    .disclosure{padding:0;border:0;background:transparent;text-align:left;color:#48685b;font-size:11px}footer{border-top:1px solid #dce5e1;padding:10px 22px;color:#74847d;font-size:11px}
  `;
  const aside = element('aside');
  const header = element('header');
  const brand = element('div', undefined, 'brand');
  const heading = element('div');
  heading.append(element('div', 'TABLE 5 / GROUP 2', 'eyebrow'), element('h1', 'Selenite'));
  brand.append(heading, button('Hide →', () => toggle()));
  header.append(brand, element('div', 'A clearer path through unfamiliar information.', 'muted'));
  const main = element('main');
  const status = element('div', 'Ready. Analyze this article to begin.', 'status');
  const footer = element('footer', 'Local workshop reconstruction · Paper-based · No account needed');
  aside.append(header, main, status, footer);
  shadow.append(style, aside);
  document.documentElement.append(host);
  const oldMargin = document.documentElement.style.marginRight;
  document.documentElement.style.marginRight = sidebarWidth;
  let hidden = false;
  function toggle() {
    hidden = !hidden;
    host.style.width = hidden ? '45px' : sidebarWidth;
    aside.hidden = hidden;
    document.documentElement.style.marginRight = hidden ? oldMargin : sidebarWidth;
    reopen.hidden = !hidden;
  }
  const reopen = button('←', toggle);
  reopen.hidden = true;
  shadow.append(reopen);
  window.__selenite = {toggle};
  const root = document.querySelector('article') || document.querySelector('main') || document.body;
  const paragraphs = [...root.querySelectorAll('p, li')].filter(node => {
    const rect = node.getBoundingClientRect();
    return !node.closest('nav,footer,header,aside,script,style,[data-selenite]') && !node.querySelector('p,li') &&
      node.textContent.trim().length >= 45 && rect.width > 0 && rect.height > 0;
  }).map((node, index) => ({id: `p${index}`, text: node.textContent.trim(), node}));
  const pageKey = location.href.split('#')[0];
  let database = {topics: []};
  let topic;
  let page;
  let busy = false;
  let stopBatch = false;
  let expanded = new Set();
  let saveTimer;
  let focusName;
  const badges = new Map();
  const navigation = new Map();
  const endHost = element('div');
  endHost.dataset.selenite = 'summary';
  const endShadow = endHost.attachShadow({mode: 'open'});
  const phraseStyle = element('style');
  phraseStyle.textContent = 'mark[data-selenite-mark]::before{content:attr(data-selenite-label);font:11px system-ui;color:#264638;border:1px solid currentColor;border-radius:3px;padding:1px 3px;margin-right:4px;background:white}';
  document.documentElement.append(phraseStyle);
  const save = () => storage.set(database);
  const deferredSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => save().catch(showError), 400); };
  const message = (text, error = false) => { status.textContent = text; status.className = error ? 'status error' : 'status'; };
  const showError = error => message(error.message || String(error), true);
  const task = async (label, action) => {
    if (busy) return;
    busy = true;
    message(label);
    render();
    renderEndSummary();
    try { await action(); await save(); message('Ready · Changes saved on this browser.'); }
    catch (error) { showError(error); }
    finally { busy = false; render(); renderEndSummary(); }
  };
  function section(title) { const result = element('section'); result.append(element('h2', title)); main.append(result); return result; }
  function control(text, handler, className) { const result = button(text, handler, className); result.disabled = busy; return result; }
  function matches(name) { return paragraphs.filter(paragraph => page?.labels[paragraph.id]?.criteria.includes(name)); }
  function navigate(name, direction) {
    const found = matches(name);
    if (!found.length) return;
    const index = logic.nextIndex(found.length, navigation.get(name), direction);
    navigation.set(name, index);
    focusName = name;
    found[index].node.scrollIntoView({behavior: 'smooth', block: 'center'});
    found[index].node.animate([{outline: '3px solid #a3c9bc'}, {outline: '3px solid transparent'}], {duration: 1600});
    render();
  }
  function editItem(item, collection) {
    const oldName = item.name;
    const name = prompt('Name', oldName)?.trim();
    if (!name) return;
    if (collection.some(other => other !== item && other.name.toLowerCase() === name.toLowerCase())) return message('That name already exists.', true);
    let description = item.description;
    if (description !== undefined) { description = prompt('Description', description); if (description === null) return; }
    item.name = name;
    if (description !== undefined) item.description = description;
    if (collection === topic.criteria) for (const currentPage of Object.values(topic.pages)) currentPage.stale = true;
    for (const currentPage of Object.values(topic.pages)) for (const label of Object.values(currentPage.labels)) {
      const field = collection === topic.criteria ? 'criteria' : 'options';
      label[field] = label[field].map(value => value === oldName ? name : value);
    }
    for (const currentPage of Object.values(topic.pages)) currentPage.details = {};
    topic.recommendations = [];
    save().catch(showError); annotate(); render();
  }
  function manage(item, collection) {
    const tools = element('div', undefined, 'toolbar');
    tools.append(control(item.pinned ? 'Unpin' : 'Pin', () => { item.pinned = !item.pinned; save().catch(showError); render(); }, 'tiny'),
      control('Edit', () => editItem(item, collection), 'tiny'),
      control('↑', () => move(-1), 'tiny'), control('↓', () => move(1), 'tiny'),
      control('Delete', () => {
        if (!confirm(`Delete ${item.name}?`)) return;
        collection.splice(collection.indexOf(item), 1);
        for (const currentPage of Object.values(topic.pages)) for (const label of Object.values(currentPage.labels)) {
          const field = collection === topic.criteria ? 'criteria' : 'options';
          label[field] = label[field].filter(name => name !== item.name);
        }
        topic.recommendations = [];
        for (const currentPage of Object.values(topic.pages)) currentPage.details = {};
        save().catch(showError); annotate(); render();
      }, 'tiny'));
    function move(offset) {
      if (collection === topic.criteria) topic.customOrder = true;
      const index = collection.indexOf(item);
      const next = index + offset;
      if (next >= 0 && next < collection.length) [collection[index], collection[next]] = [collection[next], collection[index]];
      save().catch(showError); render();
    }
    return tools;
  }
  function addItem(collection, criterion) {
    const name = prompt(criterion ? 'New criterion name' : 'New option name')?.trim();
    if (!name || collection.some(item => item.name.toLowerCase() === name.toLowerCase())) return;
    const description = criterion ? prompt('Criterion description', '') : undefined;
    if (description === null) return;
    collection.push({name, ...(criterion ? {description} : {})});
    if (criterion) for (const currentPage of Object.values(topic.pages)) currentPage.stale = true;
    save().catch(showError); render();
    message('Added. Reanalyze the page to classify it using your updated overview.');
  }
  function render() {
    const scrollTop = main.scrollTop;
    main.replaceChildren();
    const topicSection = section('01 / Your information space');
    const selector = element('select');
    selector.append(element('option', 'Choose a topic'));
    selector.options[0].value = '';
    for (const currentTopic of database.topics) {
      const option = element('option', currentTopic.name); option.value = currentTopic.id; selector.append(option);
    }
    selector.value = topic?.id || '';
    selector.disabled = busy;
    selector.onchange = () => {
      topic = database.topics.find(item => item.id === selector.value);
      page = topic?.pages[pageKey]; navigation.clear(); visibleSince.clear(); annotate(); render();
    };
    topicSection.append(selector);
    const topicTools = element('div', undefined, 'toolbar');
    topicTools.append(control('New topic', () => {
      const name = prompt('Topic name')?.trim(); if (!name) return;
      topic = {id: uid(), name, criteria: [], options: [], pages: {}, recommendations: []}; database.topics.push(topic); page = undefined;
      save().catch(showError); annotate(); render();
    }), control('Recognize topic', () => task('Recognizing the topic…', recognize)));
    if (topic) topicTools.append(control('Rename', () => {
      const name = prompt('Topic name', topic.name)?.trim(); if (name) { topic.name = name; save().catch(showError); render(); }
    }), control('Delete topic', () => {
      if (!confirm('Delete this topic and its reading history?')) return;
      database.topics = database.topics.filter(item => item !== topic); topic = undefined; page = undefined;
      save().catch(showError); annotate(); render();
    }));
    topicSection.append(topicTools);
    const runTools = element('div', undefined, 'toolbar');
    runTools.append(control(page ? 'Reanalyze article' : 'Analyze this article', () => task('Preparing global grounding…', () => analyzePage(true)), 'primary'));
    if (topic && !page && database.topics.some(item => item.pages[pageKey])) runTools.append(control('Move page here', () => {
      const previous = database.topics.find(item => item.pages[pageKey]);
      task('Reanalyzing for the destination topic…', async () => {
        await analyzePage(true);
        delete previous.pages[pageKey];
      });
    }));
    if (page && Object.keys(page.labels).length < paragraphs.length) runTools.append(control('Analyze next 24 paragraphs', () => task('Analyzing the next article section…', () => analyzePage(false))));
    if (paragraphs.length > 24) runTools.append(control('Analyze entire article', () => {
      const count = Math.ceil(paragraphs.length / 24);
      if (!confirm(`Analyze all ${paragraphs.length} paragraphs? This sends ${count} sequential page-analysis calls, plus setup calls if this is a new topic, through your Codex plan. You can stop after the current chunk.`)) return;
      stopBatch = false;
      task('Analyzing the whole article…', async () => {
        await analyzePage(true); await save();
        while (!stopBatch && Object.keys(page.labels).length < paragraphs.length) {
          await analyzePage(false); await save(); render();
        }
      });
    }));
    if (busy && paragraphs.length > 24) runTools.append(button('Stop after current chunk', () => { stopBatch = true; message('Will stop after the current chunk finishes.'); }));
    topicSection.append(runTools, element('p', `${paragraphs.length} readable paragraphs detected${page ? ` · ${Object.keys(page.labels).length} annotated` : ''}.`, 'muted'));
    topicSection.append(element('div', 'Substitutions: Codex bridge replaces GPT-4, BART, SentenceBERT and GPT-2. Semantic labels and suggestions are estimates.', 'substitution'));
    if (!topic) { main.append(element('div', 'Start with an article. Selenite will suggest a broad topic and common criteria, then connect them to the text you are reading.', 'empty')); return; }
    const history = element('details');
    history.append(element('summary', `Articles in this topic (${Object.keys(topic.pages).length})`));
    for (const [url, stored] of Object.entries(topic.pages)) {
      if (!/^https?:\/\//.test(url)) continue;
      const row = element('div');
      const link = element('a', stored.title); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      row.append(link); history.append(row);
    }
    topicSection.append(history);
    const optionsSection = section('02 / Options encountered so far');
    const pageOptions = new Set(Object.values(page?.labels || {}).flatMap(label => label.options));
    for (const item of [...topic.options].sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)))) {
      const chip = control(`${item.pinned ? '⌖ ' : ''}${item.name}`, () => { const key = `option:${item.name}`; expanded.has(key) ? expanded.delete(key) : expanded.add(key); render(); }, `chip option ${pageOptions.has(item.name) ? '' : 'absent'}`);
      optionsSection.append(chip);
      if (expanded.has(`option:${item.name}`)) optionsSection.append(manage(item, topic.options));
    }
    if (!topic.options.length) optionsSection.append(element('p', 'Options will be extracted from the article, not invented.', 'muted'));
    optionsSection.append(control('+ Add option', () => addItem(topic.options, false), 'tiny'));
    const criteriaSection = section('03 / Commonly considered criteria');
    for (const item of [...topic.criteria].sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)))) {
      const entry = element('div', undefined, 'entry');
      const top = element('div', undefined, 'entry-top');
      const count = matches(item.name).length;
      top.append(control(`${item.pinned ? '⌖ ' : ''}${item.name}`, () => { expanded.has(item.name) ? expanded.delete(item.name) : expanded.add(item.name); render(); }, `chip ${count ? '' : 'absent'} ${focusName === item.name ? 'selected' : ''}`), element('span', `${count} mentions`, 'count'));
      if (count) top.append(control('‹', () => navigate(item.name, -1), 'tiny'), control('›', () => navigate(item.name, 1), 'tiny'));
      entry.append(top);
      if (expanded.has(item.name)) entry.append(element('div', item.description, 'description'), manage(item, topic.criteria));
      criteriaSection.append(entry);
    }
    const criterionTools = element('div', undefined, 'toolbar');
    criterionTools.append(control('Request 5 more', () => task('Looking for diverse additional criteria…', async () => {
      await moreCriteria(); message('Criteria added. Reanalyze the article to update its annotations.');
    })), control('+ Add criterion', () => addItem(topic.criteria, true)));
    criteriaSection.append(criterionTools);
    const progress = section('04 / Your reading progress');
    progress.classList.add('progress');
    fillProgress(progress);
    const disclosure = element('details');
    disclosure.append(element('summary', 'About this reconstruction'));
    disclosure.append(element('p', 'Criteria are generated from model knowledge; option names and phrase evidence come from the article. AI labels can be incomplete or wrong. Read the source text. Data stays in browser storage; article text is sent through your local Codex bridge when you analyze it. Vanilla JavaScript and local storage replace React and Firebase.', 'muted'));
    main.append(disclosure);
    main.scrollTop = scrollTop;
  }
  function fillProgress(progress) {
    const {cared, skipped, covered, unseen} = logic.progress(topic, page);
    const validRecommendations = (topic.recommendations || []).filter(name => unseen.includes(name));
    const groups = [
      ['Criteria that you looked at', cared],
      ['On this page, not yet looked at', skipped],
      ['You might be interested in further searching for', validRecommendations]
    ];
    for (const [label, names] of groups) {
      const group = element('div', undefined, 'group'); group.append(element('span', label, 'group-label'));
      for (const name of names) {
        if (label.startsWith('You might')) {
          const link = element('a', name, 'chip'); link.href = `https://www.google.com/search?q=${encodeURIComponent(topic.name + ' ' + name)}`; link.target = '_blank'; link.rel = 'noopener noreferrer'; group.append(link);
        } else group.append(button(name, () => navigate(name, 1), 'chip'));
      }
      if (!names.length) group.append(element('span', 'None yet', 'muted'));
      progress.append(group);
    }
    const partial = page && Object.keys(page.labels).length < paragraphs.length;
    progress.append(element('p', `${Object.keys(topic.pages).length} articles · ${covered.length}/${topic.criteria.length} criteria encountered. Attention is estimated after 2 seconds of visible reading.${partial ? ' Partial article: analyze the remaining paragraphs before interpreting gaps.' : ''}${page?.stale ? ' Criteria changed: reanalyze this article before requesting suggestions.' : ''}`, 'muted'),
      control('Suggest next searches', () => task('Balancing relevance and diversity…', recommend)));
  }
  async function recommend() {
    if (Object.values(topic.pages).some(current => current.stale)) throw new Error('Criteria changed. Reanalyze the articles in this topic before interpreting unseen criteria.');
    const snapshot = topic;
    const result = await api('recommend', {topic: snapshot.name, ...logic.progress(snapshot, page)});
    snapshot.recommendations = result.criteria;
    if (page) page.suggestionCoverage = Object.keys(page.labels).length;
  }
  function renderEndSummary() {
    endShadow.replaceChildren();
    if (!page || !topic || !Object.keys(page.labels).length) { endHost.remove(); return; }
    endShadow.append(style.cloneNode(true));
    const block = element('div', undefined, 'progress');
    block.style.cssText = 'margin:30px 0;padding:22px;border:1px solid #d5e1d8;border-radius:12px;';
    block.append(element('h2', 'Before you leave · Your reading progress'));
    fillProgress(block);
    const toggleLabel = element('label');
    const auto = element('input'); auto.type = 'checkbox'; auto.checked = database.autoSuggest !== false;
    auto.onchange = () => { database.autoSuggest = auto.checked; deferredSave(); };
    toggleLabel.append(auto, document.createTextNode(' Automatically suggest next searches at article end (one model call per analyzed section).'));
    block.append(toggleLabel);
    endShadow.append(block);
    paragraphs.at(-1).node.after(endHost);
  }
  async function recognize() {
    if (!paragraphs.length) throw new Error('No readable article paragraphs found. Try a normal article page.');
    const result = await api('topic', {title: document.title, paragraphs: paragraphs.slice(0, 5).map(({text}) => text), existing: database.topics.map(({id, name}) => ({id, name}))});
    topic = database.topics.find(item => item.id === result.existingId);
    if (!topic) {
      if (!result.topic || typeof result.topic !== 'string') throw new Error('Topic recognition returned no topic. Please retry.');
      topic = {id: uid(), name: result.topic, criteria: [], options: [], pages: {}, recommendations: []};
      database.topics.push(topic);
    }
    page = topic.pages[pageKey];
    await save(); annotate();
  }
  async function moreCriteria() {
    const result = await api('criteria', {topic: topic.name, existing: topic.criteria});
    const existing = new Set(topic.criteria.map(item => item.name.toLowerCase()));
    topic.criteria.push(...result.criteria.filter(item => !existing.has(item.name.toLowerCase())));
    for (const currentPage of Object.values(topic.pages)) currentPage.stale = true;
    if (!topic.customOrder) topic.criteria.sort((left, right) => result.order.indexOf(left.name) - result.order.indexOf(right.name));
    topic.recommendations = [];
    await save();
  }
  async function analyzePage(reset) {
    if (!paragraphs.length) throw new Error('No readable paragraphs found.');
    if (!topic) await recognize();
    if (!topic.criteria.length) { await moreCriteria(); message('Refining the overview with more diverse criteria…'); await moreCriteria(); }
    const previousPage = page;
    if (reset || !page) {
      const previousRead = page?.read || [];
      page = {title: document.title, labels: {}, read: previousRead, details: {}, signature: paragraphs.map(item => item.text).join('\n')};
    }
    const pending = paragraphs.filter(item => !page.labels[item.id]).slice(0, 24);
    if (!pending.length) return;
    message(`Annotating ${pending.length} paragraphs using the global criteria…`);
    let result;
    try {
      result = await api('page', {title: document.title, topic: topic.name, criteria: topic.criteria, paragraphs: pending.map(({id, text}) => ({id, text}))});
    } catch (error) { page = previousPage; throw error; }
    for (const name of result.options) if (!topic.options.some(item => item.name.toLowerCase() === name.toLowerCase())) topic.options.push({name});
    for (const row of result.paragraphs) page.labels[row.id] = row;
    for (const other of database.topics) if (other !== topic) delete other.pages[pageKey];
    topic.pages[pageKey] = page;
    navigation.clear(); visibleSince.clear();
    topic.recommendations = [];
    annotate();
  }
  function clearMarks(node) {
    for (const mark of node.querySelectorAll('mark[data-selenite-mark]')) mark.replaceWith(...mark.childNodes);
    node.normalize();
  }
  function highlightPhrases(node, phrases) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let current;
    let total = 0;
    while ((current = walker.nextNode())) { textNodes.push({node: current, start: total}); total += current.length; }
    const colors = {positive: '#d3edcf', negative: '#f8d5cd', neutral: '#e4e8e7'};
    const segments = logic.phraseSegments(node.textContent, phrases);
    for (const segment of segments.reverse()) for (const entry of [...textNodes].reverse()) {
      const lower = Math.max(0, segment.start - entry.start);
      const upper = Math.min(entry.node.length, segment.end - entry.start);
      if (upper <= lower) continue;
      const range = document.createRange(); range.setStart(entry.node, lower); range.setEnd(entry.node, upper);
      const mark = element('mark'); mark.dataset.seleniteMark = 'true';
      mark.title = segment.phrases.map(phrase => `${phrase.criterion} · ${phrase.sentiment} · ${phrase.option || 'Subject unclear'}`).join('; ');
      mark.dataset.seleniteLabel = lower === segment.start - entry.start ? [...new Set(segment.phrases.map(phrase => phrase.criterion))].join(' / ') : '';
      const sentiment = new Set(segment.phrases.map(phrase => phrase.sentiment));
      mark.style.cssText = `background:${colors[sentiment.size === 1 ? [...sentiment][0] : 'neutral']};color:inherit;border:1px solid #90a69b;border-radius:2px;`;
      range.surroundContents(mark);
    }
  }
  function annotate() {
    for (const paragraph of paragraphs) {
      const old = badges.get(paragraph.id); if (old) old.remove();
      clearMarks(paragraph.node);
      paragraph.node.onmouseenter = null;
      paragraph.node.onmouseleave = null;
      const label = page?.labels[paragraph.id];
      if (!label) continue;
      const wrapper = element('span'); wrapper.dataset.selenite = 'annotation'; wrapper.style.cssText = 'display:block;margin:10px 0 4px;';
      const local = wrapper.attachShadow({mode: 'open'});
      const localStyle = element('style'); localStyle.textContent = ':host{font:12px/1.4 system-ui}button{font:inherit;border:0;border-radius:4px;background:#e5f2fa;color:#315b70;padding:3px 6px;margin:2px;cursor:pointer}.analyze{background:#f4f5ed;color:#536348}.evidence{font:12px/1.5 system-ui;padding:8px;background:#fafcf9;border:1px solid #dce5df;color:#354b40}.positive{border-left:3px solid #519b48}.negative{border-left:3px solid #c66554}.neutral{border-left:3px solid #8a9490}';
      local.append(localStyle);
      for (const name of label.criteria) local.append(button(name, () => { expanded.add(name); focusName = name; render(); }));
      const analyze = button('✧ Analyze', () => task('Analyzing exact phrases and sentiment…', async () => {
        if (!page.details[paragraph.id]) {
          const result = await api('detail', {text: paragraph.text, criteria: topic.criteria, options: topic.options.map(item => item.name)});
          page.details[paragraph.id] = result.phrases;
        } else delete page.details[paragraph.id];
        annotate();
      }), 'analyze');
      analyze.style.opacity = page.details[paragraph.id] ? '1' : '0';
      paragraph.node.onmouseenter = () => { analyze.style.opacity = '1'; };
      paragraph.node.onmouseleave = () => { if (!page.details[paragraph.id]) analyze.style.opacity = '0'; };
      analyze.onfocus = () => { analyze.style.opacity = '1'; };
      local.append(analyze);
      if (page.details[paragraph.id]) {
        analyze.textContent = 'Close analysis';
        const evidence = element('div', undefined, 'evidence');
        if (!page.details[paragraph.id].length) evidence.append(element('div', 'No exact criterion phrases found.'));
        for (const phrase of page.details[paragraph.id]) {
          const line = element('div', `${phrase.criterion} · ${phrase.sentiment} · ${phrase.option || 'Subject unclear'}: “${phrase.quote}”`, phrase.sentiment);
          evidence.append(line);
        }
        local.append(evidence);
        highlightPhrases(paragraph.node, page.details[paragraph.id]);
      }
      paragraph.node.before(wrapper); badges.set(paragraph.id, wrapper);
    }
    renderEndSummary();
  }
  const visibleSince = new Map();
  setInterval(() => {
    if (!page || hidden || document.visibilityState !== 'visible' || !document.hasFocus()) { visibleSince.clear(); return; }
    let changed = false;
    for (const paragraph of paragraphs) {
      const rect = paragraph.node.getBoundingClientRect();
      const visible = rect.top < innerHeight - 40 && rect.bottom > 40 && Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0) >= Math.min(rect.height * .5, innerHeight * .5);
      if (!visible || !page.labels[paragraph.id]) { visibleSince.delete(paragraph.id); continue; }
      if (!visibleSince.has(paragraph.id)) visibleSince.set(paragraph.id, Date.now());
      if (Date.now() - visibleSince.get(paragraph.id) >= 2000 && !page.read.includes(paragraph.id)) { page.read.push(paragraph.id); changed = true; }
    }
    if (changed) { deferredSave(); render(); renderEndSummary(); }
    const last = paragraphs.at(-1);
    if (last && !busy && Object.keys(page.labels).length === paragraphs.length && !Object.values(topic.pages).some(current => current.stale) && database.autoSuggest !== false && page.read.includes(last.id) &&
        page.suggestionCoverage !== Object.keys(page.labels).length && last.node.getBoundingClientRect().bottom < innerHeight) {
      page.suggestionCoverage = Object.keys(page.labels).length;
      task('Suggesting next steps at the end of this article…', recommend);
    }
  }, 500);
  storage.get().then(value => {
    if (value?.topics) database = value;
    topic = database.topics.find(item => item.pages[pageKey]);
    page = topic?.pages[pageKey];
    if (page) message('Restored your saved article annotations and reading progress.');
    if (page && page.signature !== paragraphs.map(item => item.text).join('\n')) {
      delete topic.pages[pageKey]; page = undefined; message('Article content changed. Analyze it again to refresh labels.');
    }
    render(); annotate();
  }).catch(showError);
})();
