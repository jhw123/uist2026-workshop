import {starterCode,initialWorkspace} from './starter.js';
import {previewDocument} from './preview.js';
import {clamp,clone,normalizedCrop,validateWorkspace,fitView} from './model.js';

const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/>',
 code:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
 sparkles:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3zM21 3v4m-2-2h4"/>',
 arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',chevron:'<path d="m9 6 6 6-6 6"/>',
 undo:'<path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12"/>',redo:'<path d="m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/>',
 fit:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
 cursor:'<path d="m5 3 14 10-7 1-3 7-4-18z"/>',hand:'<path d="M8 12V5a2 2 0 0 1 4 0v6-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v9a7 7 0 0 1-7 7h-1c-2 0-4-2-5-4l-4-6a2 2 0 0 1 3-2l2 2"/>',
 pen:'<path d="m4 16-1 5 5-1L21 7l-4-4L4 16zm10-10 4 4"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
 folder:'<path d="M3 6h6l2 2h10v12H3V6zM12 12v5m-2-2 2 2 2-2"/>',canvas:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V4H4v11h4"/>',
 refresh:'<path d="M20 10a8 8 0 1 0-1 7m1-14v7h-7"/>',trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',crop:'<path d="M6 3v15h15M3 6h15v15M10 3v3m8 8h3"/>',
 check:'<path d="m5 12 4 4L19 6"/>',link:'<path d="m10 13 4-4m-6 6-2 2a3 3 0 0 0 4 4l4-4a3 3 0 0 0 0-4m-4-2a3 3 0 0 1 0-4l4-4a3 3 0 0 1 4 4l-2 2"/>',
 sliders:'<path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4m11 7h-4M1 12h4m7 11v-4"/>',grip:'<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3"/>',back:'<path d="M19 12H5m5-5-5 5 5 5"/>'
};
const icon=name=>`<i data-icon="${name}"></i>`;
function hydrate(root=document){$$('i[data-icon]',root).forEach(el=>{if(!el.firstChild)el.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[el.dataset.icon]||paths.sparkles}</svg>`})}

let db;
async function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('misty-workspaces',1);r.onupgradeneeded=()=>r.result.createObjectStore('workspaces');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function readSaved(){try{db=await openDB();return await new Promise((resolve,reject)=>{const r=db.transaction('workspaces').objectStore('workspaces').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}catch{return null}}
let state;try{const saved=await readSaved();state=saved?validateWorkspace(saved):initialWorkspace()}catch{state=initialWorkspace()}
const history=[],future=[],busy=new Set(),signatures=new Map(),targetOptions=new Map();
let tab='overview',tool='select',space=false,gesture=null,targetMode=null,pendingBlend=null,toastTimer,saveTimer,editorTimer;
let bridge={ok:false},operationError='',modalPreviousFocus,refineTimer;
const viewport=$('#viewport'),world=$('#world'),nodes=$('#nodes');
const getNode=id=>state.nodes.find(n=>n.id===id);
const selected=()=>getNode(state.selected);
const uid=prefix=>prefix+'-'+crypto.randomUUID().slice(0,8);
function remember(){history.push(clone(state));if(history.length>25)history.shift();future.length=0}
function persist(){clearTimeout(saveTimer);$('#save-state').textContent='Saving…';saveTimer=setTimeout(async()=>{if(!db){$('#save-state').textContent='Save to file to keep changes';return}try{await new Promise((resolve,reject)=>{const tx=db.transaction('workspaces','readwrite');tx.objectStore('workspaces').put(clone(state),'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});$('#save-state').textContent='Saved locally'}catch{toast('Browser storage is full. Save your workspace to a file.',true);$('#save-state').textContent='Save to file'}},350)}
function toast(message,error=false){clearTimeout(toastTimer);const el=$('#toast');el.textContent=message;el.classList.toggle('error',error);el.hidden=false;toastTimer=setTimeout(()=>el.hidden=true,error?9000:4000)}
function applyView(){const v=state.view;world.style.transform=`translate(${v.x}px,${v.y}px) scale(${v.zoom})`;$('#zoom-value').textContent=Math.round(v.zoom*100)+'%';viewport.style.backgroundPosition=`${v.x}px ${v.y}px`;viewport.style.backgroundSize=`${19*v.zoom}px ${19*v.zoom}px`}
function focusNode(node){state.view.x=(viewport.clientWidth-360*state.view.zoom)/2-node.x*state.view.zoom;state.view.y=60-node.y*state.view.zoom;applyView();persist()}
function fit(){state.view=fitView(state.nodes,viewport.clientWidth,viewport.clientHeight);applyView();persist()}
function select(id,focus=false){state.selected=id;operationError='';render();if(focus&&getNode(id))focusNode(getNode(id));persist()}
function render(){
  $('#workspace-name').value=state.name;$('#node-count').textContent=state.nodes.length;
  $('#node-list').innerHTML=state.nodes.map(n=>`<button class="node-item ${n.id===state.selected?'selected':''}" data-action="select-node" data-id="${esc(n.id)}"><span class="mini">${n.type==='example'?`<img src="${esc(n.image)}" alt="">`:icon('code')}</span><span><strong>${esc(n.name)}</strong><small>${n.type==='example'?'REFERENCE EXAMPLE':n.parent?'BLENDED VARIATION':'SOURCE UI'}</small></span><span class="node-indicator"></span></button>`).join('');
  renderNodes();renderEdges();renderInspector();hydrate();applyView();
  $('[data-action=undo]').disabled=!history.length||busy.size>0;$('[data-action=redo]').disabled=!future.length||busy.size>0;
}
function renderNodes(){
  for(const el of [...nodes.children])if(!getNode(el.dataset.node)){el.remove();signatures.delete(el.dataset.node)}
  for(const n of state.nodes){
    let el=document.getElementById('node-'+n.id);
    if(!el){el=document.createElement('article');el.id='node-'+n.id;el.dataset.node=n.id;nodes.append(el)}
    el.className=`node ${n.type} ${n.parent?'result':''} ${n.id===state.selected?'selected':''}`;
    el.style.left=n.x+'px';el.style.top=n.y+'px';
    const signature=JSON.stringify([n.type,n.code,n.image,n.name,n.parent,n.kind]);
    if(signatures.get(n.id)!==signature){
      signatures.set(n.id,signature);
      el.innerHTML=`<header class="node-header"><span class="node-symbol">${icon(n.type==='example'?'image':n.parent?'sparkles':'code')}</span><span class="node-heading"><strong>${esc(n.name)}</strong><small>${n.type==='example'?'REFERENCE EXAMPLE':n.parent?'BLENDING OUTPUT':'WORK IN PROGRESS'}</small></span><span class="node-badge">${n.type==='example'?esc(n.kind||'Image'):n.parent?'Variation':'Source'}</span><button class="icon-button" data-action="delete-node" data-id="${esc(n.id)}" aria-label="Delete ${esc(n.name)}" title="Delete node">${icon('close')}</button></header><div class="node-body"><div class="screen ${n.type==='example'?'example-screen':''}">${n.type==='example'?`<img src="${esc(n.image)}" alt="${esc(n.name)} reference — drag to select a region" draggable="false"><div class="crop-box" hidden></div>`:`<iframe title="${esc(n.name)} preview" sandbox="allow-scripts" referrerpolicy="no-referrer" data-id="${esc(n.id)}"></iframe>`}</div><p class="node-caption">${n.type==='example'?'Drag to select a region · connect for a global blend':n.parent?'A new direction, with your original content.':'Your content. A world of possibilities.'}</p></div><footer class="node-footer">${n.type==='example'?`<button class="button quiet" data-action="clear-crop" data-id="${esc(n.id)}">${icon('crop')}<span>Full screen</span></button><button class="button region-drag quiet" data-action="drag-region" data-id="${esc(n.id)}" title="Drag selected region onto a source UI">${icon('grip')} Drag region</button><button class="button blend-button" data-action="blend-global" data-id="${esc(n.id)}">Blend ${icon('arrow')}</button>`:`<button class="button quiet" data-action="show-code" data-id="${esc(n.id)}">${icon('code')} Show code</button><span class="node-controls"><button class="button quiet" data-action="repair" data-id="${esc(n.id)}" title="Repair render with Codex">Fix render</button>${n.parent?`<button class="icon-button" data-action="regenerate" data-id="${esc(n.id)}" title="Regenerate as a new variation" aria-label="Regenerate variation">${icon('refresh')}</button>`:''}<button class="icon-button" data-action="export-code" data-id="${esc(n.id)}" title="Export code" aria-label="Export source code">${icon('download')}</button></span>`}</footer><button class="node-port ${n.type==='source'?'in':''}" data-action="connect-port" data-id="${esc(n.id)}" title="${n.type==='example'?'Connect to a source UI for global blending':'Receive an example connection'}" aria-label="${n.type==='example'?'Connect example':'Connect source'}"></button>`;
      if(n.type==='source'){
        const frame=$('iframe',el);frame.dataset.revision=uid('render');frame.srcdoc=previewDocument(n.code,n.id,frame.dataset.revision);
      }
    }
    if(n.type==='example')renderCrop(n);
    let cover=$('.busy-cover',el);
    if(busy.has(n.id)&&!cover){cover=document.createElement('div');cover.className='busy-cover';cover.innerHTML='<div class="spinner"></div><span>Mixing a new direction…</span><small>One request through your Codex bridge</small>';$('.node-body',el).append(cover)}else if(!busy.has(n.id)&&cover)cover.remove();
  }
  hydrate(nodes);
}
function renderCrop(n){const box=$('.crop-box',document.getElementById('node-'+n.id));if(!box)return;box.hidden=!n.crop;if(n.crop){Object.assign(box.style,{left:n.crop.x*320+'px',top:n.crop.y*560+'px',width:n.crop.w*320+'px',height:n.crop.h*560+'px'})}const label=$('[data-action=clear-crop] span',document.getElementById('node-'+n.id));if(label)label.textContent=n.crop?'Clear region':'Full screen'}
function curve(a,b){const d=Math.max(100,Math.abs(b.x-a.x)*.45);return `M${a.x+10000} ${a.y+10000} C${a.x+d+10000} ${a.y+10000},${b.x-d+10000} ${b.y+10000},${b.x+10000} ${b.y+10000}`}
function renderEdges(){const edges=state.edges.map(e=>{const a=getNode(e.from),b=getNode(e.to);if(!a||!b)return '';return `<path class="edge" d="${curve({x:a.x+360,y:a.y+350},{x:b.x,y:b.y+350})}"/>`}).join('');$('#edges').innerHTML=edges+(gesture?.type==='connect'?`<path class="edge" d="${curve(gesture.start,gesture.end)}" style="stroke:#9b78bd"/>`:'')}
function overviewIntro(n){return `<div class="inspector-kicker">${icon(n.parent?'sliders':'sparkles')}${n.parent?'SEMANTIC DIFF':'A LITTLE INSPIRATION'}</div><input class="rename-input" aria-label="Node name" data-rename="${esc(n.id)}" value="${esc(n.name)}" maxlength="100">`}
function renderInspector(){
  const n=selected(),inspector=$('#inspector');
  if(!n){inspector.innerHTML=`<div class="inspector-header">Inspector<button class="icon-button" data-action="close-inspector" aria-label="Close inspector">${icon('close')}</button></div><div class="inspector-content"><h3>Start with an idea.</h3><p>Add an example image or a source UI to begin exploring.</p></div>`;return}
  const isSource=n.type==='source';
  inspector.innerHTML=`<div class="inspector-header"><div class="inspector-tabs"><button class="inspector-tab ${tab==='overview'||!isSource?'active':''}" data-action="overview-tab">${n.parent?'Applied changes':isSource?'Blend & explore':'Reference'}</button>${isSource?`<button class="inspector-tab ${tab==='code'?'active':''}" data-action="code-tab">Code</button>`:''}</div><button class="icon-button" data-action="close-inspector" aria-label="Close inspector" title="Close inspector">${icon('close')}</button></div>`;
  if(isSource&&tab==='code'){
    inspector.insertAdjacentHTML('beforeend',`<div class="code-panel"><div class="code-tools"><span>React + Tailwind · live preview</span><button class="icon-button" data-action="copy-code" data-id="${esc(n.id)}" aria-label="Copy code">${icon('copy')}</button><button class="icon-button" data-action="export-code" data-id="${esc(n.id)}" aria-label="Download code">${icon('download')}</button></div><textarea id="code-editor" class="code-editor" aria-label="Source code editor" spellcheck="false" ${busy.has(n.id)?'disabled':''}>${esc(n.code)}</textarea><div class="code-error" ${!n.error?'hidden':''}>${esc(n.error)}</div><div class="code-note">Changes render automatically. Use a React component or HTML. React hooks, Tailwind classes and inline SVG are supported.<br/><button class="button secondary compact" data-action="repair" data-id="${esc(n.id)}" ${busy.has(n.id)?'disabled':''}>${icon('refresh')} Fix render with Codex</button></div></div>`);hydrate(inspector);return;
  }
  let content=overviewIntro(n);
  if(n.type==='example'){
    content+=`<p>Select a region in the image, then drag it onto your UI. Or blend the whole screen to explore a new direction.</p><div class="source-card">${icon(n.kind==='Sketch'?'pen':'image')}<div><strong>${esc(n.kind||'Reference image')}</strong><small>${n.crop?'REGION SELECTED':'ENTIRE IMAGE'}</small></div></div><label class="field-label" for="blend-source">BLEND INTO</label><select id="blend-source">${state.nodes.filter(n=>n.type==='source').map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select><button class="button" data-action="blend-global" data-id="${esc(n.id)}" ${busy.size?'disabled':''}>${icon('sparkles')} Blend whole screen</button><button class="button secondary" data-action="choose-target" data-id="${esc(n.id)}" ${busy.size?'disabled':''}>${icon('target')} Blend selected region</button><hr class="inspector-divider"><span class="eyebrow">REGION · PERCENT OF IMAGE AREA</span><div class="crop-inputs">${['x','y','w','h'].map((k,i)=>`<label>${['Left','Top','Width','Height'][i]} %<input type="number" min="0" max="100" step="1" data-crop-field="${k}" aria-label="Crop ${['left','top','width','height'][i]} percent" value="${Math.round((n.crop?.[k]??(['w','h'].includes(k)?1:0))*100)}"></label>`).join('')}</div><button class="button quiet" data-action="apply-crop" data-id="${esc(n.id)}">${icon('crop')} Apply region</button><p>Use these fields as an alternative to drawing a region. Click “Blend selected region” to choose the target from a list.</p>`;
  }else if(n.parent){
    content+=`<p>${esc(n.designExplanation||'Your reference, reinterpreted with your content.')} ${esc(n.differences||'')}</p><div class="inspector-actions"><button class="button secondary" data-action="regenerate" data-id="${esc(n.id)}" ${busy.has(n.id)?'disabled':''}>${icon('refresh')} Regenerate</button><button class="button quiet" data-action="reset-groups" data-id="${esc(n.id)}" ${busy.has(n.id)?'disabled':''}>${icon('undo')} Reset all</button></div><div class="groups">${(n.groups||[]).map(g=>groupMarkup(g,n)).join('')||'<p class="empty-groups">The model did not return semantic groups. You can refine the result in the code editor or regenerate.</p>'}</div>${(n.groups||[]).some(g=>g.controls?.length)?`<button class="button secondary" data-action="apply-refinement" data-id="${esc(n.id)}" ${busy.has(n.id)?'disabled':''}>${icon('check')} Apply widget values</button>`:''}<p style="margin-top:15px;font-size:9px">Toggles update the UI through a model call. Widget values apply together when you choose Apply.</p><button class="button quiet" data-action="parent-node" data-id="${esc(n.id)}">${icon('back')} View previous version</button><hr class="inspector-divider">${blendChooser(n)}`;
  }else{
    content+=`<p>A starting point, ready for a different perspective. Blend an example into this UI while keeping your content.</p><div class="source-card">${icon('code')}<div><strong>React + Tailwind</strong><small>LIVE, EDITABLE SOURCE UI</small></div></div>${blendChooser(n)}<hr class="inspector-divider"><span class="eyebrow">TWO WAYS TO MIX</span><div class="how-to"><span class="step-number">1</span><div><strong>Think big. Connect screens.</strong><p>Connect an example’s handle to this UI to explore its overall style and layout.</p></div></div><div class="how-to"><span class="step-number">2</span><div><strong>Get specific. Blend a region.</strong><p>Select part of an example and drag it onto an element. Pick Color, Layout, Content, or Customize.</p></div></div><div class="tip">Every blend creates a new variation.<br/>Your starting point stays on the canvas.</div>`;
  }
  if(n.error)content+=`<div class="error-box"><strong>Preview needs a repair</strong><br/>${esc(n.error)}<button class="button secondary" data-action="repair" data-id="${esc(n.id)}">Fix render with Codex</button></div>`;
  if(operationError)content+=`<div class="error-box">${esc(operationError)}</div>`;
  inspector.insertAdjacentHTML('beforeend',`<div class="inspector-content">${content}</div><div class="inspector-foot">${icon('sparkles')} Mixing Interfaces by Semantic Transformation. Plus Y.</div>`);hydrate(inspector);
}
function blendChooser(n){return `<label class="field-label" for="blend-reference">REFERENCE EXAMPLE</label><select id="blend-reference">${state.nodes.filter(n=>n.type==='example').map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select><button class="button" data-action="blend-source" data-id="${esc(n.id)}" ${busy.size||!state.nodes.some(n=>n.type==='example')?'disabled':''}>${icon('sparkles')} Blend with this UI</button>`}
function groupMarkup(g,n){return `<div class="group"><label class="toggle"><span><span class="group-category">${esc(g.category)}</span><span class="group-description">${esc(g.description)}</span></span><input type="checkbox" role="switch" data-group="${esc(g.id)}" aria-label="${esc(g.category+': '+g.description)}" ${g.enabled?'checked':''} ${busy.has(n.id)?'disabled':''}></label>${g.controls?.length?`<details><summary>Adjust details</summary>${g.controls.map(c=>`<label class="control-label" for="${esc(g.id+'-'+c.id)}">${esc(c.label)}</label><div class="control-row">${c.type==='select'?`<select id="${esc(g.id+'-'+c.id)}" data-control="${esc(c.id)}" data-group-id="${esc(g.id)}" ${busy.has(n.id)?'disabled':''}>${c.options.map(o=>`<option ${o===c.value?'selected':''}>${esc(o)}</option>`).join('')}</select>`:`<input id="${esc(g.id+'-'+c.id)}" type="${esc(c.type)}" data-control="${esc(c.id)}" data-group-id="${esc(g.id)}" value="${esc(c.value)}" ${c.type==='range'?`min="${c.min}" max="${c.max}" step="${c.step}"`:''} ${busy.has(n.id)?'disabled':''}>`}<output>${esc(c.value)}${esc(c.unit||'')}</output></div>`).join('')}</details>`:''}</div>`}
function modal(content,wide=false){modalPreviousFocus=document.activeElement;$('#modal-root').innerHTML=`<div class="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="modal-title" class="modal ${wide?'wide':''}"><button class="icon-button close-modal" data-action="close-modal" aria-label="Close dialog">${icon('close')}</button>${content}</section></div>`;hydrate($('#modal-root'));setTimeout(()=>$('.modal input:not([type=checkbox]),.modal select,.modal textarea,.modal button')?.focus(),0)}
function closeModal(){if(busy.size)return;$('#modal-root').innerHTML='';pendingBlend=null;modalPreviousFocus?.focus?.()}
function showHelp(){modal(`<span class="eyebrow">WELCOME TO MISTY</span><h2 id="modal-title">Mix a little. Discover a lot.</h2><p>A reconstruction of Misty’s conceptual blending workflow from the paper by Lu et al. (CHI 2025).</p><ol class="help-list"><li><strong>Bring your starting point.</strong> Use Fuji’s profile or add a React/Tailwind component or HTML file.</li><li><strong>Add inspiration.</strong> Upload screenshots or photos of sketches. No example code needed.</li><li><strong>Explore globally.</strong> Drag the right handle of an example to the left handle of a source. Or use the Blend button.</li><li><strong>Refine locally.</strong> Draw a region on an example, then drag “Drag region” onto a source element. Select Color, Layout, Content, or Customize. A target list also supports this without dragging.</li><li><strong>Keep what works.</strong> Toggle semantic changes, adjust generated controls, regenerate a variation, or edit the source directly.</li></ol><p>Drag empty canvas or hold Space to pan. Use + / − to zoom. Scroll pans; Ctrl/Cmd + scroll zooms. ⌘Z undoes a workspace edit. Save workspace downloads all code and images.</p><div class="tip">Model: Codex bridge, replacing the paper’s GPT-4o. Static mobile screens are the paper’s scope. Your inputs are sent through your signed-in Codex plan only when you request a blend, refinement, or repair.</div><div class="modal-actions"><button class="button" data-action="close-modal">Let’s explore ${icon('arrow')}</button></div>`,true)}
function showBridge(){modal(`<span class="eyebrow">MODEL CONNECTION</span><h2 id="modal-title">Your Codex bridge.</h2><p>${bridge.ok?'Connected to '+esc(bridge.bridge?.model||'Codex')+'. No API key needed.':'Start the bridge in a separate terminal from the repository root.'}</p><div class="bridge-command">cd ~/Desktop/uist2026-workshop<br/>python3 llm-bridge/bridge.py codex</div><p>Keep this terminal running. Misty checks the backend to make sure your requests use Codex.</p><div class="tip">Substitution: the paper used GPT-4o. This implementation uses the bridge’s selected Codex model (${esc(bridge.bridge?.model||'small, fast model')}).</div><div class="modal-actions"><button class="button secondary" data-action="check-bridge">Check connection</button><button class="button" data-action="close-modal">Done</button></div>`)}
async function checkBridge(){try{const r=await fetch('/api/health');bridge=await r.json()}catch{bridge={ok:false}}const el=$('#bridge-status');el.className='status '+(bridge.ok?'online':'offline');$('span:last-child',el).textContent=bridge.ok?'Codex bridge connected':'Bridge disconnected';el.title=bridge.ok?`Codex · ${bridge.bridge.model}. Replaces GPT-4o in the paper.`:'Start python3 llm-bridge/bridge.py codex';return bridge.ok}
async function api(action,payload){
  if(!bridge.ok){await checkBridge();if(!bridge.ok)throw Error(bridge.bridge?.backend&&bridge.bridge.backend!=='codex'?'A different backend is running. Stop it and run python3 llm-bridge/bridge.py codex.':'Codex bridge is unavailable. From the repository root, run python3 llm-bridge/bridge.py codex.')}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),330000);
  try{const r=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});const result=await r.json();if(!r.ok)throw Error(result.error||'The model call failed.');return result}finally{clearTimeout(timer)}
}
async function referenceImage(example,crop=null){
  const image=new Image();image.src=example.image;await image.decode();
  const {naturalWidth:w,naturalHeight:h}=image;
  // Crop rectangle is measured on the 320 × 560 contain-fit display, including letterbox space.
  const scale=Math.min(320/w,560/h),ox=(320-w*scale)/2,oy=(560-h*scale)/2;
  let sx=0,sy=0,sw=w,sh=h;
  if(crop){const x1=clamp((crop.x*320-ox)/scale,0,w),y1=clamp((crop.y*560-oy)/scale,0,h),x2=clamp(((crop.x+crop.w)*320-ox)/scale,0,w),y2=clamp(((crop.y+crop.h)*560-oy)/scale,0,h);sx=x1;sy=y1;sw=x2-x1;sh=y2-y1;if(sw<1||sh<1)throw Error('The region is outside the image. Select part of the visible image.')}
  const resize=Math.min(1,1400/Math.max(sw,sh)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(sw*resize));canvas.height=Math.max(1,Math.round(sh*resize));canvas.getContext('2d').drawImage(image,sx,sy,sw,sh,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
}
function beginBlend(referenceId,sourceId,target=null,local=false){
  if(busy.size){toast('Let the current blend finish first.');return}
  const example=getNode(referenceId),source=getNode(sourceId);
  if(!example||!source||source.type!=='source'){toast('Add a source UI before blending.',true);return}
  clearTargetMode();
  pendingBlend={referenceId,sourceId,target,crop:local?clone(example.crop):null,local};
  modal(`<span class="eyebrow">${local?'TARGETED BLENDING':'GLOBAL BLENDING'}</span><h2 id="modal-title">Pick blending options.</h2><p>${local?'Choose what to bring from the selected region. Unrelated areas stay as they are.':'Bring the example’s style and layout into your UI, while keeping your content.'}</p><div class="blend-context"><img src="${esc(example.image)}" alt=""><div><strong>${esc(example.name)} → ${esc(source.name)}</strong><small id="target-summary">${target?esc(target.label):local?'Choose a target section below':'Full screen · new variation'}</small></div></div>${local?`<label class="field-label" for="target-choice">TARGET SECTION</label><select id="target-choice"><option value="">${target?'Dropped target: '+esc(target.label):'Entire screen (contextual addition)'}</option>${(targetOptions.get(sourceId)||[]).map((t,i)=>`<option value="${i}">${esc(t.tag+' · '+t.label)}</option>`).join('')}</select>`:''}<div class="aspect-grid">${[['Color','Adopt the example’s palette.'],['Layout','Borrow structure and arrangement.'],['Content','Add UI elements in your context.'],['Customize','Describe another aspect to blend.']].map(([name,description])=>`<label class="aspect-option"><input type="checkbox" name="aspect" value="${name}" ${!local&&['Color','Layout'].includes(name)?'checked':''}><span><strong>${name}</strong><small>${description}</small></span></label>`).join('')}</div><label class="field-label" for="custom-instruction">CUSTOMIZE / ADDITIONAL DIRECTION <span style="font-size:9px">(optional)</span></label><textarea id="custom-instruction" placeholder="e.g. Use the carousel layout for all my interests, keeping the light theme." maxlength="2000"></textarea><div class="tip">Creates a new source node. Your existing versions stay on the canvas.</div><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancel</button><button class="button" data-action="run-blend">${icon('sparkles')} Create blend</button></div>`);
}
async function runBlend(){
  if(!pendingBlend||busy.size)return;
  const aspects=$$('input[name=aspect]:checked').map(e=>e.value),instruction=$('#custom-instruction').value.trim();
  if(!aspects.length){toast('Choose at least one blending aspect.',true);return}
  if(aspects.includes('Customize')&&!instruction){toast('Describe the custom aspect you want to blend.',true);$('#custom-instruction').focus();return}
  const request=clone(pendingBlend),source=getNode(request.sourceId),example=getNode(request.referenceId);
  const choice=$('#target-choice')?.value;if(choice)request.target=targetOptions.get(source.id)?.[Number(choice)]||request.target;
  if(request.local&&!request.target)request.target={tag:'main',label:'Entire screen / contextual addition',html:source.code,selector:'#root'};
  request.aspects=aspects;request.instruction=instruction;
  $('#modal-root').innerHTML='';pendingBlend=null;await generate(request);
}
async function generate(request){
  const source=getNode(request.sourceId),example=getNode(request.referenceId);if(!source||!example)return;
  if(busy.size)return;
  busy.add(source.id);operationError='';render();
  const originalCode=source.code;
  try{
    const image=await referenceImage(example,request.crop);
    const result=await api('blend',{code:originalCode,image,target:request.target,aspects:request.aspects,instruction:request.instruction,crop:request.crop});
    remember();
    let x=source.x+470,y=source.y;
    while(state.nodes.some(n=>Math.abs(n.x-x)<365&&Math.abs(n.y-y)<750))y+=780;
    const n={id:uid('blend'),type:'source',name:source.name.replace(/ · \d+$/,'')+' · '+(state.nodes.filter(n=>n.parent===source.id).length+1),x,y,code:result.updatedCode,fullBlendCode:result.updatedCode,originalCode,parent:source.id,reference:example.id,request,groups:result.categorizedChanges||[],appliedGroups:clone(result.categorizedChanges||[]),designExplanation:result.designExplanation||'',differences:result.differences||'',error:null};
    state.nodes.push(n);state.edges.push({from:source.id,to:n.id,kind:'evolution'},{from:example.id,to:n.id,kind:'reference'});state.selected=n.id;tab='overview';render();focusNode(n);persist();toast('A new direction is ready. Refine its semantic changes.');
  }catch(error){operationError=error.message;toast(error.message,true)}finally{busy.delete(source.id);render();persist()}
}
async function refine(n){
  if(!n||busy.size)return;
  const desired=clone(n.groups),previous=clone(n.appliedGroups||n.groups.map(g=>({...g,enabled:true})));
  busy.add(n.id);operationError='';render();
  try{const result=await api('refine',{code:n.code,originalCode:n.originalCode,fullBlendCode:n.fullBlendCode,groups:desired});const wanted=n.groups;n.groups=clone(previous);remember();n.groups=wanted;n.code=result.updatedCode;n.groups=desired;n.appliedGroups=clone(desired);n.error=null;toast('Semantic changes applied.');persist()}catch(error){n.groups=previous;operationError=error.message;toast(error.message,true)}finally{busy.delete(n.id);render()}
}
async function repair(n){if(!n||n.type!=='source'||busy.size)return;busy.add(n.id);operationError='';render();try{const result=await api('repair',{code:n.code,error:n.error||'Check JSX syntax and component shape.'});remember();n.code=result.updatedCode;n.error=null;persist();toast('Repaired code is ready.')}catch(error){operationError=error.message;toast(error.message,true)}finally{busy.delete(n.id);render()}}
function download(text,name,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function safeName(name){return name.replace(/[^a-z0-9 -]/gi,'').trim().replace(/\s+/g,'-').toLowerCase()||'misty'}
function saveWorkspace(){download(JSON.stringify(state,null,2),safeName(state.name)+'.misty.json');toast('Workspace downloaded with all images and source code.');persist()}
function addSourceDialog(){modal(`<span class="eyebrow">BRING YOUR STARTING POINT</span><h2 id="modal-title">Add a source UI.</h2><p>Paste a React component with Tailwind classes, or a single HTML document. No example code is needed for your references.</p><label class="field-label" for="source-name">NAME</label><input type="text" id="source-name" value="Untitled source" maxlength="100"><label class="field-label" for="source-import">SOURCE CODE</label><textarea class="code-import" id="source-import" spellcheck="false" placeholder="() => { return (<main className=&quot;p-6&quot;>Your UI</main>); }"></textarea><p>Available: React hooks, Tailwind utilities, inline CSS and SVG. Use a self-contained component without package imports. TypeScript requires conversion to JavaScript.</p><div class="modal-actions"><button class="button secondary" data-action="upload-code">${icon('folder')} Choose file</button><button class="button" data-action="create-source">${icon('plus')} Add source</button></div>`,true)}
async function addImages(files){for(const f of files){if(!['image/png','image/jpeg','image/gif','image/webp'].includes(f.type)){toast('Use PNG, JPEG, WebP or GIF images.',true);continue}if(f.size>8*1024*1024){toast('Reference images must be smaller than 8 MB.',true);continue}const image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f)});try{const img=new Image();img.src=image;await img.decode();remember();const n={id:uid('reference'),type:'example',name:f.name.replace(/\.[^.]+$/,''),x:64,y:90+state.nodes.filter(n=>n.type==='example').length*780,image,crop:null,kind:'Screenshot / sketch'};state.nodes.push(n);state.selected=n.id;tab='overview';render();focusNode(n);persist()}catch{toast('That image could not be opened.',true)}}}
function clearTargetMode(){targetMode=null;$$('iframe').forEach(f=>f.contentWindow?.postMessage({type:'misty-mode',enabled:false},'*'));$('#drop-hint').hidden=true;$('#canvas-hint span').textContent='Connect an example to your UI. See where it takes you.'}
function frameHit(frame,event,request){const r=frame.getBoundingClientRect();frame.contentWindow.postMessage({type:'misty-hit',x:(event.clientX-r.left)*320/r.width,y:(event.clientY-r.top)*560/r.height,request},'*')}
function sourceUnder(event){return $$('iframe[data-id]').find(f=>{const r=f.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom})}
let connectionFrom=null,suppressClick=false;
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||button.disabled)return;
  const action=button.dataset.action,id=button.dataset.id,n=getNode(id)||selected();
  if(suppressClick){suppressClick=false;return}
  switch(action){
    case 'upload-reference':$('#image-input').click();break;
    case 'import-workspace':$('#workspace-input').click();break;
    case 'save':saveWorkspace();break;
    case 'help':showHelp();break;
    case 'close-modal':closeModal();break;
    case 'check-bridge':await checkBridge();showBridge();break;
    case 'select-node':tab='overview';select(id,true);openInspector();break;
    case 'close-inspector':$('#inspector').classList.add('closed');document.body.classList.add('inspector-closed');if(!$('.inspector-reopen')){const b=document.createElement('button');b.className='icon-button inspector-reopen';b.dataset.action='open-inspector';b.setAttribute('aria-label','Open inspector');b.innerHTML=icon('sliders');$('.canvas-area').append(b);hydrate(b)}break;
    case 'open-inspector':openInspector();break;
    case 'overview-tab':tab='overview';renderInspector();hydrate();break;
    case 'code-tab':tab='code';renderInspector();hydrate();break;
    case 'show-code':state.selected=id;tab='code';render();openInspector();persist();break;
    case 'copy-code':try{await navigator.clipboard.writeText(n.code);toast('Source code copied.')}catch{toast('Clipboard unavailable. Use Export code instead.',true)}break;
    case 'export-code':download(n.code,safeName(n.name)+(/^(<!doctype|<html)/i.test(n.code.trim())?'.html':'.jsx'),'text/plain');break;
    case 'fit':fit();break;
    case 'zoom-in':zoomBy(1.15);break;
    case 'zoom-out':zoomBy(1/1.15);break;
    case 'reset-zoom':zoomBy(1/state.view.zoom);break;
    case 'pan-tool':setTool('pan');break;
    case 'select-tool':setTool('select');break;
    case 'undo':undo();break;
    case 'redo':redo();break;
    case 'add-source':addSourceDialog();break;
    case 'upload-code':$('#code-input').click();break;
    case 'create-source':{
      const code=$('#source-import').value.trim(),name=$('#source-name').value.trim()||'Untitled source';
      if(!code){toast('Paste source code or choose a file first.',true);return}
      if(code.length>300000){toast('Source code must be smaller than 300 KB.',true);return}
      remember();const s={id:uid('source'),type:'source',name,code,x:540,y:90+state.nodes.filter(n=>n.type==='source').length*780,groups:[],error:null};state.nodes.push(s);state.selected=s.id;closeModal();tab='code';render();focusNode(s);persist();break;
    }
    case 'add-sketch':{
      remember();const s={id:uid('sketch'),type:'example',name:'A sketch of a possibility',x:64,y:90+state.nodes.filter(n=>n.type==='example').length*780,image:'/assets/sketch.svg',kind:'Sketch',crop:null};state.nodes.push(s);state.selected=s.id;tab='overview';render();focusNode(s);persist();break;
    }
    case 'delete-node':if(busy.size){toast('Wait for the current model call before deleting nodes.');return}remember();state.nodes=state.nodes.filter(n=>n.id!==id);state.edges=state.edges.filter(e=>e.from!==id&&e.to!==id);if(state.selected===id)state.selected=state.nodes.at(-1)?.id;render();persist();break;
    case 'clear-crop':remember();n.crop=null;render();persist();break;
    case 'apply-crop':remember();n.crop=normalizedCrop(Object.fromEntries($$('[data-crop-field]').map(input=>[input.dataset.cropField,Number(input.value)/100])));render();persist();toast('Region selected. Blend it into a target section.');break;
    case 'blend-global':{
      const sourceId=$('#blend-source')?.value||state.nodes.find(n=>n.type==='source')?.id;
      beginBlend(id,sourceId);break;
    }
    case 'blend-source':beginBlend($('#blend-reference').value,id);break;
    case 'choose-target':{
      const sourceId=$('#blend-source')?.value;if(!sourceId){toast('Add a source UI first.',true);return}
      beginBlend(id,sourceId,null,true);break;
    }
    case 'run-blend':await runBlend();break;
    case 'regenerate':if(n.request)await generate(clone(n.request));break;
    case 'apply-refinement':await refine(n);break;
    case 'reset-groups':if(!busy.size){n.groups.forEach(g=>{g.enabled=false});await refine(n)}break;
    case 'parent-node':if(getNode(n.parent)){select(n.parent,true)}else toast('The previous node was removed. The original code is still stored in this variation.');break;
    case 'repair':await repair(n);break;
    case 'connect-port':{
      if(n.type==='example'){connectionFrom=n.id;toast('Now click the left handle of a source UI. You can also drag between handles.')}else if(connectionFrom){beginBlend(connectionFrom,n.id);connectionFrom=null}break;
    }
  }
});
$('#bridge-status').addEventListener('click',showBridge);
function openInspector(){$('#inspector').classList.remove('closed');document.body.classList.remove('inspector-closed');$('.inspector-reopen')?.remove()}
function setTool(value){tool=value;viewport.classList.toggle('panning',value==='pan');for(const b of $$('[data-action=select-tool],[data-action=pan-tool]')){const active=b.dataset.action===value+'-tool';b.classList.toggle('active',active);b.setAttribute('aria-pressed',active)}}
function zoomBy(factor,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){const {zoom,x,y}=state.view,next=clamp(zoom*factor,.2,1.5);state.view={zoom:next,x:cx-(cx-x)*next/zoom,y:cy-(cy-y)*next/zoom};applyView();persist()}
function undo(){if(!history.length||busy.size)return;future.push(clone(state));state=history.pop();signatures.clear();render();persist();toast('Undid the last workspace edit.')}
function redo(){if(!future.length||busy.size)return;history.push(clone(state));state=future.pop();signatures.clear();render();persist();toast('Restored the workspace edit.')}
$('#image-input').addEventListener('change',e=>{addImages(e.target.files);e.target.value=''});
$('#code-input').addEventListener('change',async e=>{const f=e.target.files[0];if(f){if(f.size>300000){toast('Code must be smaller than 300 KB.',true);return}$('#source-import').value=await f.text();$('#source-name').value=f.name.replace(/\.[^.]+$/,'')}e.target.value=''});
$('#workspace-input').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>64*1024*1024)throw Error('Workspace file is too large (maximum 64 MB).');if(busy.size)throw Error('Wait for the current model call before importing a workspace.');const data=validateWorkspace(JSON.parse(await f.text()));remember();state=data;signatures.clear();tab='overview';render();fit();persist();toast('Workspace restored.')}catch(error){toast(error.message,true)}e.target.value=''});
$('#workspace-name').addEventListener('change',e=>{remember();state.name=e.target.value.trim()||'Untitled workspace';persist()});
document.addEventListener('change',e=>{
  if(e.target.matches('[data-rename]')){const n=getNode(e.target.dataset.rename);if(!n)return;remember();n.name=e.target.value.trim()||'Untitled';render();persist()}
  if(e.target.matches('[data-group]')){const n=selected();const g=n.groups.find(g=>g.id===e.target.dataset.group);if(!g)return;g.enabled=e.target.checked;clearTimeout(refineTimer);refineTimer=setTimeout(()=>refine(n),500)}
  if(e.target.matches('[data-control]')){const g=selected().groups.find(g=>g.id===e.target.dataset.groupId),c=g?.controls.find(c=>c.id===e.target.dataset.control);if(c){c.value=c.type==='range'?Number(e.target.value):e.target.value;const output=e.target.closest('.control-row').querySelector('output');if(output)output.textContent=c.value+(c.unit||'')}}
  if(e.target.id==='target-choice'&&pendingBlend){const t=targetOptions.get(pendingBlend.sourceId)?.[Number(e.target.value)];$('#target-summary').textContent=e.target.value&&t?t.label:pendingBlend.target?.label||'Entire screen / contextual addition'}
});
document.addEventListener('input',e=>{
  if(e.target.id==='code-editor'){
    const n=selected();if(!n||busy.has(n.id))return;
    if(!editorTimer)remember();const value=e.target.value;clearTimeout(editorTimer);
    editorTimer=setTimeout(()=>{editorTimer=null;if(getNode(n.id)){n.code=value;n.error=null;renderNodes();renderEdges();persist()}},500);
  }
  if(e.target.matches('[data-control]')){const out=e.target.closest('.control-row').querySelector('output');if(out)out.textContent=e.target.value}
});
// The canvas owns pointer gestures, so dragging remains smooth across iframe boundaries.
viewport.addEventListener('pointerdown',e=>{
  if(e.button!==0&&e.button!==1)return;if($('.modal'))return;
  const action=e.target.closest('[data-action]')?.dataset.action,id=e.target.closest('[data-node]')?.dataset.node,n=getNode(id);
  const point={x:e.clientX,y:e.clientY};
  if(action==='drag-region'&&n?.type==='example'){
    gesture={type:'region',id,start:point,lastFrame:null,target:null,moved:false};
    document.body.classList.add('dragging');$('#drag-ghost').innerHTML=`<img src="${esc(n.image)}" alt="">`;$('#drag-ghost').hidden=false;$('#drop-hint').hidden=false;
  }else if(action==='connect-port'&&n?.type==='example'){
    gesture={type:'connect',id,start:{x:n.x+360,y:n.y+350},end:{x:n.x+360,y:n.y+350},pointer:point,moved:false};
    document.body.classList.add('dragging');
  }else if(e.target.closest('button,input,textarea,select'))return;
  else if(e.target.closest('.example-screen')&&n&&tool!=='pan'&&!space){
    select(n.id);remember();const rect=e.target.closest('.example-screen').getBoundingClientRect();
    gesture={type:'crop',id,rect,start:{x:clamp((e.clientX-rect.left)/rect.width,0,1),y:clamp((e.clientY-rect.top)/rect.height,0,1)},old:n.crop};
  }else if(e.target.closest('.node-header')&&n&&tool!=='pan'&&!space){select(n.id);remember();gesture={type:'node',id,start:point,x:n.x,y:n.y};document.body.classList.add('dragging')}
  else if(!n||tool==='pan'||space||e.button===1){gesture={type:'pan',start:point,x:state.view.x,y:state.view.y};viewport.classList.add('panning')}
  else if(n){select(n.id);return}
  else return;
  viewport.setPointerCapture(e.pointerId);e.preventDefault();
});
document.addEventListener('pointermove',e=>{
  if(!gesture)return;const g=gesture;
  if(g.type==='pan'){state.view.x=g.x+e.clientX-g.start.x;state.view.y=g.y+e.clientY-g.start.y;applyView()}
  if(g.type==='node'){const n=getNode(g.id);n.x=g.x+(e.clientX-g.start.x)/state.view.zoom;n.y=g.y+(e.clientY-g.start.y)/state.view.zoom;const el=document.getElementById('node-'+n.id);el.style.left=n.x+'px';el.style.top=n.y+'px';renderEdges()}
  if(g.type==='crop'){const n=getNode(g.id),x=clamp((e.clientX-g.rect.left)/g.rect.width,0,1),y=clamp((e.clientY-g.rect.top)/g.rect.height,0,1);n.crop={x:Math.min(x,g.start.x),y:Math.min(y,g.start.y),w:Math.abs(x-g.start.x),h:Math.abs(y-g.start.y)};renderCrop(n)}
  if(g.type==='connect'){g.moved||=Math.hypot(e.clientX-g.pointer.x,e.clientY-g.pointer.y)>5;const r=viewport.getBoundingClientRect();g.end={x:(e.clientX-r.left-state.view.x)/state.view.zoom,y:(e.clientY-r.top-state.view.y)/state.view.zoom};renderEdges()}
  if(g.type==='region'){
    g.moved||=Math.hypot(e.clientX-g.start.x,e.clientY-g.start.y)>5;
    Object.assign($('#drag-ghost').style,{left:e.clientX+15+'px',top:e.clientY+15+'px'});
    const frame=sourceUnder(e);if(frame!==g.lastFrame){g.lastFrame?.contentWindow.postMessage({type:'misty-clear'},'*');g.target=null;g.lastFrame=frame}
    if(frame)frameHit(frame,e,'hover');
  }
});
document.addEventListener('pointerup',e=>{
  if(!gesture)return;const g=gesture;gesture=null;document.body.classList.remove('dragging');$('#drag-ghost').hidden=true;$('#drop-hint').hidden=true;viewport.classList.toggle('panning',tool==='pan'||space);
  if(g.type==='crop'){const n=getNode(g.id);if(n.crop?.w<.01||n.crop?.h<.01)n.crop=g.old;renderCrop(n);renderInspector();hydrate()}
  if(g.type==='connect'&&g.moved){suppressClick=true;setTimeout(()=>suppressClick=false,100);const frame=sourceUnder(e);if(frame)beginBlend(g.id,frame.dataset.id);else{const source=state.nodes.filter(n=>n.type==='source').find(n=>{const r=document.getElementById('node-'+n.id).getBoundingClientRect();return e.clientX>=r.left-15&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom});if(source)beginBlend(g.id,source.id);else toast('Drop the connection on a source UI.')}}
  if(g.type==='region'){
    const frame=sourceUnder(e);g.lastFrame?.contentWindow.postMessage({type:'misty-clear'},'*');
    if(g.moved&&frame){suppressClick=true;setTimeout(()=>suppressClick=false,100);targetMode={referenceId:g.id,sourceId:frame.dataset.id};frameHit(frame,e,'drop')}
    else if(!g.moved){const source=state.nodes.find(n=>n.type==='source');if(source)beginBlend(g.id,source.id,null,true)}else toast('Drop the region onto the visible screen of a source UI.');
  }
  renderEdges();persist();
});
document.addEventListener('pointercancel',()=>{gesture=null;document.body.classList.remove('dragging');$('#drag-ghost').hidden=true;$('#drop-hint').hidden=true;renderEdges()});
viewport.addEventListener('wheel',e=>{if(e.target.closest('iframe'))return;e.preventDefault();if(e.ctrlKey||e.metaKey){const r=viewport.getBoundingClientRect();zoomBy(Math.exp(-e.deltaY*.006),e.clientX-r.left,e.clientY-r.top)}else{state.view.x-=e.deltaX;state.view.y-=e.deltaY;applyView();persist()}},{passive:false});
viewport.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();$('#drop-hint').hidden=false;$('#drop-hint').textContent='Drop images to add reference examples'}});
viewport.addEventListener('dragleave',()=>$('#drop-hint').hidden=true);
viewport.addEventListener('drop',e=>{e.preventDefault();$('#drop-hint').hidden=true;$('#drop-hint').textContent='Drop on a source UI to choose what to blend';addImages(e.dataTransfer.files)});
window.addEventListener('message',event=>{
  const frame=$$('iframe[data-id]').find(f=>f.contentWindow===event.source);if(!frame)return;
  const m=event.data;if(!m||m.nodeId!==frame.dataset.id||m.revision!==frame.dataset.revision)return;
  const n=getNode(m.nodeId);if(!n)return;
  if(m.type==='misty-error'){n.error=m.error;if(state.selected===n.id){const error=$('.code-error');if(tab==='code'&&error){error.hidden=false;error.textContent=m.error}else{renderInspector();hydrate()}}}
  if(m.type==='misty-rendered'){n.error=null;frame.contentWindow.postMessage({type:'misty-elements'},'*');if(state.selected===n.id){const error=$('.code-error');if(error)error.hidden=true}}
  if(m.type==='misty-elements')targetOptions.set(n.id,m.elements);
  if(m.type==='misty-target'){
    if(gesture?.type==='region'&&gesture.lastFrame===frame)gesture.target=m.target;
    if(m.request==='drop'&&targetMode){const t=targetMode;clearTargetMode();beginBlend(t.referenceId,n.id,m.target,true)}
  }
  if(m.type==='misty-pick'&&targetMode){const t=targetMode;clearTargetMode();beginBlend(t.referenceId,n.id,m.target,true)}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if($('.modal'))closeModal();clearTargetMode();connectionFrom=null;return}
  if(e.key==='Tab'&&$('.modal')){const elements=$$('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]',$('.modal')).filter(el=>el.offsetParent!==null);if(!elements.length)return;const first=elements[0],last=elements.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}return}
  const editing=e.target.matches('input,textarea,select');
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveWorkspace();return}
  if(editing)return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}
  if(e.code==='Space'){e.preventDefault();space=true;viewport.classList.add('panning')}
  if(e.key==='+'||e.key==='=')zoomBy(1.15);if(e.key==='-')zoomBy(1/1.15);
});
document.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;viewport.classList.toggle('panning',tool==='pan')}});
render();await checkBridge();
if(window.innerWidth<=760){$('#inspector').classList.add('closed');document.body.classList.add('inspector-closed');const b=document.createElement('button');b.className='icon-button inspector-reopen';b.dataset.action='open-inspector';b.setAttribute('aria-label','Open inspector');b.innerHTML=icon('sliders');$('.canvas-area').append(b);hydrate(b);fit()}else if(!state.nodes.some(n=>n.parent)){fit()}
persist();
