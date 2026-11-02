import {applyStroke, arcPath, clamp} from './core.mjs';

const NS = 'http://www.w3.org/2000/svg';
const W = 900, H = 390, P = {left:40, right:24, top:28, bottom:36};
const el = (name, attrs = {}) => {const node = document.createElementNS(NS, name); Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v)); return node;};

function smooth(points, close = false) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0]},${points[0][1]}`;
  for(let i=0;i<points.length-1;i++){
    const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];
    d+=` C${p1[0]+(p2[0]-p0[0])/6},${p1[1]+(p2[1]-p0[1])/6} ${p2[0]-(p3[0]-p1[0])/6},${p2[1]-(p3[1]-p1[1])/6} ${p2[0]},${p2[1]}`;
  }
  return d+(close?' Z':'');
}

export class SketchCanvas {
  constructor(container, {kind = 'fortune', onBegin, onCommit, onHover, onFocus}) {
    this.container = container; this.kind = kind; this.onBegin = onBegin; this.onCommit = onCommit; this.onHover = onHover; this.onFocus = onFocus;
    this.svg = el('svg', {viewBox:`0 0 ${W} ${H}`, preserveAspectRatio:'none', role:'img', 'aria-label': kind === 'fortune' ? 'Draw a fortune arc. Higher is better fortune; left to right follows sentence order.' : 'Draw per-sentence surprise, from low at the bottom to high at the top.'});
    this.container.append(this.svg);
    this.svg.addEventListener('pointerdown', e=>this.start(e));
    this.svg.addEventListener('pointermove', e=>this.move(e));
    this.svg.addEventListener('pointerup', e=>this.end(e));
    this.svg.addEventListener('pointercancel', e=>this.end(e, true));
    this.svg.addEventListener('pointerleave', ()=>{if(!this.drawing)this.onHover?.(null);});
  }
  point(i, v) {return [P.left + i / Math.max(1,(this.preview||this.state).slots.length-1)*(W-P.left-P.right), P.top+(1-clamp(v))*(H-P.top-P.bottom)];}
  coord(e){const r=this.svg.getBoundingClientRect();return {x:clamp((e.clientX-r.left)/r.width*W-P.left,0,W-P.left-P.right)/(W-P.left-P.right),y:clamp((e.clientY-r.top)/r.height*H-P.top,0,H-P.top-P.bottom)/(H-P.top-P.bottom),t:e.timeStamp};}
  setState(state, {history=[], preview=null, hover=null, busy=false, tool='pen'}={}) {
    this.state=state;this.history=history;this.preview=preview;this.hover=hover;this.busy=busy;this.tool=tool;
    this.container.classList.toggle('busy',busy);this.container.classList.toggle('erasing',tool==='eraser');this.render();
  }
  setHover(index){
    this.hover=index;
    this.svg.querySelectorAll('.chart-point').forEach(dot=>{
      const active=Number(dot.dataset.index)===index;dot.setAttribute('r',active?6.5:3.8);dot.setAttribute('stroke-width',active?2:1);
    });
    this.svg.querySelector('.hover-line')?.remove();
    const count=(this.preview||this.state).slots.length;
    if(index!==null&&index!==undefined&&index<count){const [x]=this.point(index,0);this.svg.append(el('line',{class:'hover-line',x1:x,x2:x,y1:P.top,y2:H-P.bottom,stroke:'#9ab7c9','stroke-width':2,'stroke-dasharray':'4 5','pointer-events':'none',opacity:.5}));}
  }
  start(e){
    if(this.busy || this.preview || e.button!==0)return;
    e.preventDefault();this.onBegin?.();this.drawing=true;this.svg.setPointerCapture(e.pointerId);this.points=[this.coord(e)];this.touched=new Set();
    this.apply(this.points);
  }
  apply(points){
    const controls=this.kind==='fortune'?this.state.controls:this.state.surprises.map(v=>v===null?null:{target:v,tolerance:.07});
    const touched=applyStroke(controls,points,this.state.slots.length,this.tool==='eraser');
    touched.forEach(i=>this.touched.add(i));
    if(this.kind==='surprise')this.state.surprises=controls.map(v=>v?.target??null);
    this.render();
  }
  move(e){
    if(this.drawing){const p=this.coord(e);this.apply([this.points.at(-1),p]);this.points.push(p);return;}
    const i=Math.round(this.coord(e).x*(this.state.slots.length-1));
    this.onHover?.(i);
  }
  end(e,cancelled=false){
    if(!this.drawing)return;
    this.drawing=false;
    if(this.svg.hasPointerCapture(e.pointerId))this.svg.releasePointerCapture(e.pointerId);
    this.onCommit?.([...this.touched].sort((a,b)=>a-b),this.kind,this.tool==='eraser',cancelled);
  }
  render(){
    if(!this.state)return;
    this.svg.replaceChildren();
    const defs=el('defs'),pattern=el('pattern',{id:`hatch-${this.kind}`,width:8,height:8,patternUnits:'userSpaceOnUse',patternTransform:'rotate(42)'});
    pattern.append(el('rect',{width:8,height:8,fill:'#dcedd9','fill-opacity':'.34'}),el('line',{x1:0,y1:0,x2:0,y2:8,stroke:'#add1ad','stroke-width':2,'stroke-opacity':'.75'}));defs.append(pattern);this.svg.append(defs);
    const plotH=H-P.top-P.bottom;
    for(let band=0;band<5;band++)this.svg.append(el('rect',{x:0,y:P.top+band*plotH/5,width:W,height:plotH/5,fill:['#f9f7ed','#f8f8f1','#f5f6ef','#f1f3ec','#ecf0e8'][band]}));
    const display=this.preview||this.state, slots=display.slots;
    const point=(i,v)=>this.point(i,v);
    const count=slots.length;
    for(let i=0;i<count;i++){
      const [x]=point(i,0);this.svg.append(el('line',{x1:x,x2:x,y1:P.top,y2:H-P.bottom,stroke:'#dce3d3','stroke-width':1}));
      const label=el('text',{x,y:H-13,'text-anchor':'middle',fill:'#aeb8a0','font-size':11,'font-family':'sans-serif'});label.textContent=String(i+1).padStart(2,'0');this.svg.append(label);
    }
    const baseline=point(0,.5)[1];this.svg.append(el('line',{x1:14,x2:W-10,y1:baseline,y2:baseline,stroke:'#b3bca7','stroke-width':1.5}));
    if(this.kind==='fortune'){
      for(const saved of this.history){
        const savedPoint=(i,v)=>[P.left+i/Math.max(1,saved.draft.slots.length-1)*(W-P.left-P.right),P.top+(1-clamp(v))*plotH];
        this.svg.append(el('path',{d:arcPath(saved.draft.slots,savedPoint),fill:'none',stroke:'#83967f','stroke-width':2,opacity:.17}));
      }
      const controls=display.controls;
      let group=[];
      const drawGroup=()=>{
        if(!group.length)return;
        const upper=group.map(([i,c])=>point(i,clamp(c.target+c.tolerance)));
        const lower=group.map(([i,c])=>point(i,clamp(c.target-c.tolerance))).reverse();
        if(group.length===1){upper[0][0]-=10;upper.push([upper[0][0]+20,upper[0][1]]);lower[0][0]+=10;lower.push([lower[0][0]-20,lower[0][1]]);}
        const upperD=smooth(upper), lowerD=smooth(lower);
        this.svg.append(el('path',{d:upperD+lowerD.replace(/^M/,' L')+' Z',fill:`url(#hatch-${this.kind})`,stroke:'none'}));
        this.svg.append(el('path',{d:smooth(group.map(([i,c])=>point(i,c.target))),fill:'none',stroke:'#8eb788','stroke-width':1.7,'stroke-opacity':'.5','stroke-dasharray':'3 4'}));group=[];
      };
      controls.forEach((c,i)=>{if(c)group.push([i,c]);else drawGroup();});drawGroup();
      // Actual values are recognition results; target values are never used for blue points.
      for(let i=0;i<slots.length;i++){
        const slot=slots[i];if(slot.fortune===null||!slot.text.trim())continue;
        const [x,y]=point(i,slot.fortune),color=slot.source==='ai'?'#608eb5':'#929f87';
        if(i>0&&slots[i-1].fortune!==null&&slots[i-1].text.trim())this.svg.append(el('path',{d:smooth([point(i-1,slots[i-1].fortune),[x,y]]),fill:'none',stroke:color,'stroke-width':2.5}));
        const dot=el('circle',{cx:x,cy:y,r:this.hover===i?6.5:3.8,fill:color,stroke:'#fffefa','stroke-width':this.hover===i?2:1,class:'chart-point','data-index':i,tabindex:0,'aria-label':`Sentence ${i+1}: fortune ${Math.round(slot.fortune*100)}%. ${slot.text}`});
        const title=el('title');title.textContent=`${i+1}. ${slot.text}\nFortune: ${Math.round(slot.fortune*100)}%`;dot.append(title);
        dot.addEventListener('focus',()=>this.onHover?.(i));dot.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();this.onFocus?.(i);}});this.svg.append(dot);
      }
      if(!controls.some(Boolean)&&!slots.some(s=>s.fortune!==null)){
        const label=el('text',{x:W*.55,y:H*.39,'text-anchor':'middle',fill:'#acb9a0','font-size':17,'font-family':'Georgia,serif','font-style':'italic','pointer-events':'none'});label.textContent='A rise. A fall. A new beginning.';this.svg.append(label);
        const subtitle=el('text',{x:W*.55,y:H*.47,'text-anchor':'middle',fill:'#b2bda9','font-size':11,'font-family':'sans-serif','pointer-events':'none'});subtitle.textContent='Sketch a line to see what happens next';this.svg.append(subtitle);
      }
    }else{
      const values=display.surprises.map(v=>({fortune:v}));
      this.svg.append(el('path',{d:arcPath(values,point),fill:'none',stroke:'#5d9364','stroke-width':2.5}));
    }
    this.setHover(this.hover);
  }
}
