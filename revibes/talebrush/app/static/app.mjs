import {copy, emptySlot, newDraft, insertSlot, removeSlot, generationIndices} from './core.mjs';
import {SketchCanvas} from './canvas.mjs';

const $ = id => document.getElementById(id);
const KEY = 'talebrush.reconstruction.v1';
let state = newDraft(), history = [], undo = [], busy = false, recognizing = false, revision = 0;
let tool = 'pen', hover = null, historyOpen = false, preview = null, connected = false, pendingGeneration = null;
let recognitionTimer, loadingTimer, saveFailure = false, inputUndoAt = 0;

function validDraft(value) {
  return value && typeof value.title === 'string' && typeof value.protagonist === 'string'
    && Array.isArray(value.slots) && value.slots.length >= 1 && value.slots.length <= 30
    && value.slots.every(s=>s && typeof s.text === 'string' && ['human','ai'].includes(s.source) && (s.fortune===null || (Number.isFinite(s.fortune)&&s.fortune>=0&&s.fortune<=1)))
    && Array.isArray(value.controls) && value.controls.length===value.slots.length
    && value.controls.every(c=>c===null || (c && Number.isFinite(c.target) && c.target>=0 && c.target<=1 && Number.isFinite(c.tolerance) && c.tolerance>=0 && c.tolerance<=1))
    && Array.isArray(value.surprises) && value.surprises.length===value.slots.length
    && value.surprises.every(s=>s===null || (Number.isFinite(s)&&s>=0&&s<=1));
}
try {
  const stored = JSON.parse(localStorage.getItem(KEY));
  if(validDraft(stored?.draft)) state=stored.draft;
  if(Array.isArray(stored?.history))history=stored.history.filter(h=>validDraft(h.draft)).slice(-50);
}catch{ /* A missing/corrupt browser draft starts a fresh story. */ }

function save(){
  try{localStorage.setItem(KEY,JSON.stringify({draft:state,history}));$('autosave').textContent='Saved locally';saveFailure=false;}
  catch{$('autosave').textContent='Save unavailable';if(!saveFailure){showError('Browser storage is unavailable or full. Keep this tab open and export your story to save it.');saveFailure=true;}}
}
function pushUndo(){undo.push(copy(state));if(undo.length>35)undo.shift();$('undo-button').disabled=busy||!undo.length;}
function changed(){
  if(pendingGeneration){pendingGeneration=null;message('Queued generation canceled because the draft changed. Sketch again when you are ready.');}
  revision++;save();
}
function message(text,loading=false){$('status-text').textContent=text;$('status').classList.toggle('loading',loading);}
function showError(text){$('error').textContent=text;$('error').hidden=false;}
function clearError(){$('error').hidden=true;$('error').textContent='';}
function snapshot(label){history.push({id:crypto.randomUUID(),label,date:new Date().toISOString(),draft:copy(state)});if(history.length>50)history.shift();}
function adjustHeight(textarea){textarea.style.height='auto';textarea.style.height=`${Math.max(26,textarea.scrollHeight)}px`;}
function focusSlot(i,position=0){const textarea=$('sentence-editor').querySelector(`[data-index="${i}"] textarea`);if(textarea){textarea.focus();textarea.setSelectionRange(position,position);textarea.scrollIntoView({block:'nearest',behavior:'smooth'});}}

async function api(path,body){
  let response;
  try{response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
  catch{throw new Error('Cannot reach the TaleBrush server. Restart python3 server.py, then try again.');}
  let data;try{data=await response.json();}catch{throw new Error('The server returned an unreadable response. Your draft is safe.');}
  if(!response.ok)throw new Error(data.error||'The request failed. Your draft is safe.');return data;
}

const fortuneCanvas=new SketchCanvas($('fortune-canvas'),{onBegin:pushUndo,onCommit:commitStroke,onHover:setHover,onFocus:focusSlot});
const surpriseCanvas=new SketchCanvas($('surprise-canvas'),{kind:'surprise',onBegin:pushUndo,onCommit:commitStroke,onHover:setHover});

function renderCanvases(){
  const options={history:historyOpen?history:[],preview,hover,busy,tool};
  fortuneCanvas.setState(state,options);surpriseCanvas.setState(state,options);
}
function setHover(i){
  if(hover===i)return;hover=i;
  $('sentence-editor').querySelectorAll('.sentence-row').forEach(row=>row.classList.toggle('highlighted',Number(row.dataset.index)===i));
  fortuneCanvas.setHover(i);surpriseCanvas.setHover(i);
}
function renderEditor(){
  const shown=preview||state;
  $('story-title').value=shown.title;$('protagonist').value=shown.protagonist;
  $('story-title').disabled=busy||!!preview;$('protagonist').disabled=busy||!!preview;
  document.querySelector('.editor-panel').classList.toggle('history-preview',!!preview);
  $('sentence-editor').replaceChildren();
  shown.slots.forEach((slot,i)=>{
    const row=document.createElement('div');row.className=`sentence-row ${slot.source==='ai'?'ai':'author'}`;row.dataset.index=i;
    row.classList.toggle('highlighted',i===hover);
    const number=document.createElement('span');number.className='row-number';number.textContent=String(i+1).padStart(2,'0');number.setAttribute('aria-hidden','true');
    const textarea=document.createElement('textarea');textarea.rows=1;textarea.value=slot.text;textarea.maxLength=4000;textarea.spellcheck=true;
    textarea.setAttribute('aria-label',`Sentence ${i+1}${slot.source==='ai'?', AI generated':''}`);textarea.disabled=busy||!!preview;
    textarea.placeholder=i===0?'Begin your story…':i===shown.slots.findIndex(s=>!s.text.trim())?'A little space for what comes next…':'…';
    textarea.addEventListener('input',()=>{
      if(Date.now()-inputUndoAt>1500){pushUndo();inputUndoAt=Date.now();}
      state.slots[i].text=textarea.value;state.slots[i].source='human';state.slots[i].fortune=null;
      row.classList.remove('ai');row.classList.add('author');adjustHeight(textarea);changed();renderCanvases();updateSentenceCount();queueRecognition();
    });
    textarea.addEventListener('keydown',e=>{
      if(e.isComposing)return;
      if(e.key==='Enter'&&!e.shiftKey){
        e.preventDefault();if(state.slots.length>=30){message('This short-story canvas supports up to 30 sentences.');return;}
        pushUndo();const position=textarea.selectionStart,end=textarea.selectionEnd;
        const tail=textarea.value.slice(end);state.slots[i].text=textarea.value.slice(0,position);state.slots[i].source='human';state.slots[i].fortune=null;
        insertSlot(state,i+1,emptySlot(tail));changed();render();focusSlot(i+1);queueRecognition();
      }else if(e.key==='Backspace'&&!textarea.value&&state.slots.length>1){
        e.preventDefault();pushUndo();removeSlot(state,i);changed();render();focusSlot(Math.max(0,i-1),state.slots[Math.max(0,i-1)].text.length);queueRecognition();
      }
    });
    textarea.addEventListener('paste',e=>{
      const text=e.clipboardData.getData('text');if(!text.includes('\n'))return;
      const lines=text.replace(/\r/g,'').split('\n');
      if(state.slots.length+lines.length-1>30){e.preventDefault();showError('Paste up to 30 sentence rows at a time.');return;}
      e.preventDefault();pushUndo();const before=textarea.value.slice(0,textarea.selectionStart),after=textarea.value.slice(textarea.selectionEnd);
      state.slots[i]={...state.slots[i],text:before+lines[0],source:'human',fortune:null};
      for(let j=1;j<lines.length;j++)insertSlot(state,i+j,emptySlot(lines[j]+(j===lines.length-1?after:'')));
      changed();render();focusSlot(i+lines.length-1);queueRecognition();
    });
    row.addEventListener('pointerenter',()=>setHover(i));row.addEventListener('pointerleave',()=>setHover(null));
    textarea.addEventListener('focus',()=>setHover(i));
    const remove=document.createElement('button');remove.className='remove-row';remove.textContent='×';remove.title=`Remove sentence ${i+1}`;remove.setAttribute('aria-label',`Remove sentence ${i+1}`);remove.disabled=busy||!!preview||state.slots.length<=1;
    remove.addEventListener('click',()=>{pushUndo();removeSlot(state,i);changed();render();queueRecognition();});
    row.append(number,textarea,remove);$('sentence-editor').append(row);adjustHeight(textarea);
  });
  updateSentenceCount(shown);
}

function updateSentenceCount(shown=preview||state){$('sentence-count').textContent=`${shown.slots.filter(s=>s.text.trim()).length} / ${shown.slots.length} sentences`;}

function render(){
  renderEditor();renderCanvases();
  $('history-count').textContent=history.length;
  $('surprise-toggle').checked=state.showSurprise;$('surprise-panel').hidden=!state.showSurprise;
  $('undo-button').disabled=busy||!undo.length;
  for(const id of ['generate-button','add-sentence','surprise-toggle','recognize-button','new-button','pen-tool','eraser-tool'])$(id).disabled=busy;
  $('add-sentence').disabled=busy||state.slots.length>=30;
  $('history-button').disabled=busy;$('generate-label').textContent=busy?'Writing…':'Generate Again';
  document.body.classList.toggle('busy',busy);
  $('pen-tool').classList.toggle('active',tool==='pen');$('pen-tool').setAttribute('aria-pressed',String(tool==='pen'));
  $('eraser-tool').classList.toggle('active',tool==='eraser');$('eraser-tool').setAttribute('aria-pressed',String(tool==='eraser'));
}

function commitStroke(touched,kind,erased,cancelled){
  if(cancelled){if(undo.length)state=undo.pop();changed();render();return;}
  if(!touched.length)return;
  changed();
  if(kind==='surprise'){message('Surprise sketch updated. Generate Again to use it.');renderCanvases();return;}
  const from=Math.min(...touched),to=Math.max(...touched);
  state.lastRange=Array.from({length:to-from+1},(_,k)=>from+k);changed();
  if(erased){message('Fortune constraint erased. Generate Again to explore this range without a target.');render();return;}
  generateRange(state.lastRange);
}

async function generateRange(range){
  if(busy)return;
  clearTimeout(recognitionTimer);closeHistory();clearError();
  if(!state.protagonist.trim()){showError('Name your protagonist above the canvas first.');$('protagonist').focus();return;}
  if(recognizing){pendingGeneration=[...new Set([...(pendingGeneration||[]),...range])].sort((a,b)=>a-b);message('Finishing fortune analysis. Your sketch is queued and will generate automatically.');return;}
  const indices=generationIndices(state.slots,range);
  if(!indices.length){message('Your words are fixed anchors. Sketch across empty rows or AI sentences, or clear a row to replace it.');return;}
  if(indices.length>24){showError('Generate up to 24 sentences in one stroke. Sketch a shorter section.');return;}
  state.lastRange=range;pushUndo();const initial=copy(state);
  busy=true;render();message(`Writing ${indices.length} sentence${indices.length===1?'':'s'} along your sketch, then independently recognizing their fortune…`,true);
  let elapsed=0;loadingTimer=setInterval(()=>{elapsed+=5;message(`Exploring your story… ${elapsed}s · Generating and independently scoring candidates.`,true);},5000);
  try{
    const result=await api('/api/generate',{...copy(state),indices,surprises:state.showSurprise?state.surprises:Array(state.slots.length).fill(null)});
    if(!history.length)history.push({id:crypto.randomUUID(),label:'Starting draft',date:new Date().toISOString(),draft:initial});
    result.updates.forEach(update=>{state.slots[update.index]={...state.slots[update.index],text:update.text,fortune:update.fortune,source:'ai'};});
    snapshot(`Exploration ${history.filter(h=>h.label.startsWith('Exploration')).length+1}`);changed();
    message(`${result.updates.length} new sentence${result.updates.length===1?'':'s'}. Compare the blue fortune arc with your sketch, edit the words, or try another direction.`);
  }catch(error){showError(error.message);message('Your draft and sketch are safe. Generate Again to retry.');}
  finally{clearInterval(loadingTimer);busy=false;$('status').classList.remove('loading');render();}
}

function queueRecognition(){clearTimeout(recognitionTimer);recognitionTimer=setTimeout(()=>analyze(false),2200);}
async function analyze(explicit=true){
  if(busy||recognizing||!connected||!state.protagonist.trim()||!state.slots.some(s=>s.text.trim())){
    if(explicit&&!connected)showError('The Codex bridge is offline. Start python3 llm-bridge/bridge.py codex from the workshop repository.');return;
  }
  clearTimeout(recognitionTimer);const atRevision=revision;recognizing=true;$('recognize-button').disabled=true;
  if(explicit){clearError();message('Recognizing your protagonist’s fortune from the actual text…',true);}
  else $('connection-text').textContent='Recognizing fortune…';
  try{
    const result=await api('/api/recognize',{protagonist:state.protagonist,slots:copy(state.slots)});
    if(atRevision!==revision){queueRecognition();return;}
    result.scores.forEach(row=>state.slots[row.index].fortune=row.fortune);save();renderCanvases();
    if(explicit)message('Fortune recognized from your current text. The points show the model’s interpretation of your protagonist’s fortune.');
  }catch(error){if(explicit||atRevision===revision)showError(error.message);}
  finally{
    recognizing=false;$('recognize-button').disabled=busy;if(explicit)$('status').classList.remove('loading');$('connection-text').textContent=connected?'Codex bridge connected':'Codex bridge offline';
    if(pendingGeneration){const range=pendingGeneration;pendingGeneration=null;generateRange(range);}
  }
}

function closeHistory(){historyOpen=false;preview=null;$('history-menu').hidden=true;$('history-button').setAttribute('aria-expanded','false');render();}
function openHistory(){
  historyOpen=true;$('history-menu').hidden=false;$('history-button').setAttribute('aria-expanded','true');$('history-items').replaceChildren();
  if(!history.length){const text=document.createElement('p');text.className='history-empty';text.textContent='Your generated stories will appear here.';$('history-items').append(text);}
  [...history].reverse().forEach(saved=>{
    const button=document.createElement('button');button.className='history-item';const title=document.createElement('strong');title.textContent=saved.label;
    const summary=document.createElement('span');summary.textContent=`${new Date(saved.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · ${saved.draft.slots.find(s=>s.text.trim())?.text.slice(0,85)||'Empty draft'}`;button.append(title,summary);
    const show=()=>{preview=saved.draft;renderEditor();renderCanvases();message(`Previewing ${saved.label}. Select to restore; move away to return to your draft.`);};
    button.addEventListener('pointerenter',show);button.addEventListener('focus',show);
    button.addEventListener('click',()=>{pushUndo();snapshot('Before restoring');state=copy(saved.draft);changed();closeHistory();message(`Restored ${saved.label}. You can edit it or sketch a new direction.`);});
    $('history-items').append(button);
  });
  renderCanvases();
}
$('history-button').addEventListener('click',()=>historyOpen?closeHistory():openHistory());
$('history-items').addEventListener('pointerleave',()=>{preview=null;renderEditor();renderCanvases();message('Hover over a saved story to compare its text and fortune arc.');});
document.addEventListener('pointerdown',e=>{if(historyOpen&&!e.target.closest('.history-wrap'))closeHistory();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&historyOpen){closeHistory();$('history-button').focus();}
  if(e.target.matches('textarea,input')||busy||$('help-dialog').open)return;
  if(e.key.toLowerCase()==='p')selectTool('pen');if(e.key.toLowerCase()==='e')selectTool('eraser');
});
function selectTool(value){tool=value;render();message(value==='eraser'?'Erase part of the green envelope. The next generation there will have no fortune target.':'Draw across the canvas. Release your stroke to generate the touched part of the story.');}
$('pen-tool').addEventListener('click',()=>selectTool('pen'));
$('eraser-tool').addEventListener('click',()=>selectTool('eraser'));
$('generate-button').addEventListener('click',()=>{
  let range=state.lastRange?.length?state.lastRange:state.controls.map((control,i)=>control?i:null).filter(i=>i!==null);
  if(!range.length)range=state.slots.map((s,i)=>!s.text.trim()?i:null).filter(i=>i!==null);
  generateRange(range);
});
$('add-sentence').addEventListener('click',()=>{if(state.slots.length>=30)return;pushUndo();insertSlot(state,state.slots.length);changed();render();focusSlot(state.slots.length-1);});
$('undo-button').addEventListener('click',()=>{if(!undo.length||busy)return;closeHistory();state=undo.pop();changed();render();message('Previous draft action restored.');});
$('surprise-toggle').addEventListener('change',()=>{pushUndo();state.showSurprise=$('surprise-toggle').checked;changed();render();});
for(const [id,property] of [['story-title','title'],['protagonist','protagonist']]){
  $(id).addEventListener('focus',pushUndo);
  $(id).addEventListener('input',()=>{
    state[property]=$(id).value;
    if(property==='protagonist')state.slots.forEach(s=>s.fortune=null);
    changed();
    if(property==='protagonist'){renderCanvases();queueRecognition();}
  });
}
$('recognize-button').addEventListener('click',()=>analyze(true));
$('new-button').addEventListener('click',()=>{pendingGeneration=null;pushUndo();if(state.slots.some(s=>s.text.trim()))snapshot('Before new story');state=newDraft();state.title='';state.protagonist='';state.slots=Array.from({length:10},()=>emptySlot());changed();closeHistory();render();message('A blank page. Name your protagonist and write the beginning.');$('protagonist').focus();});
$('export-button').addEventListener('click',()=>{
  const shown=preview||state,text=shown.title+'\n\n'+shown.slots.map(s=>s.text||'[Unwritten sentence]').join('\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=(shown.title||'TaleBrush story').replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,100)+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
function openHelp(details=false){$('help-dialog').showModal();if(details){$('model-details').open=true;$('model-details').scrollIntoView({block:'start'});}}
$('help-button').addEventListener('click',()=>openHelp());$('details-button').addEventListener('click',()=>openHelp(true));$('close-help').addEventListener('click',()=>$('help-dialog').close());
$('help-dialog').addEventListener('click',e=>{if(e.target===$('help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});

async function checkConnection(){
  try{const response=await fetch('/api/health');const data=await response.json();connected=data.ok;$('connection-text').textContent=data.ok?'Codex bridge connected':'Codex bridge offline';$('connection').classList.toggle('offline',!data.ok);$('connection').title=data.ok?`${data.backend} · ${data.model||'default model'}`:data.message;}
  catch{connected=false;$('connection-text').textContent='TaleBrush server offline';$('connection').classList.add('offline');}
}
$('retry-connection').addEventListener('click',async()=>{await checkConnection();if(connected){clearError();message('Connected to the Codex bridge. You can sketch to generate.');}});
window.addEventListener('resize',()=>{$('sentence-editor').querySelectorAll('textarea').forEach(adjustHeight);});
render();save();checkConnection();
if(history.length)message('Your saved draft is restored. Edit a sentence, redraw a section, or explore History.');
