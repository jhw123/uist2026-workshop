import {projectPoint,dragInPlane,spaceAxes,pointCoordinates,pickProjectedPoint} from './space-math.mjs';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class HologramSpace{
  constructor({onBegin,onUpdate,onCommit,onSentence,onAxes,onClear}){
    Object.assign(this,{onBegin,onUpdate,onCommit,onSentence,onAxes,onClear});
    this.canvas=$('space-canvas');this.ctx=this.canvas.getContext('2d');this.camera={yaw:.72,pitch:-.4,zoom:1};
    this.canvas.addEventListener('pointerdown',e=>this.start(e));
    this.canvas.addEventListener('pointermove',e=>this.move(e));
    this.canvas.addEventListener('pointerup',e=>this.end(e));
    this.canvas.addEventListener('pointercancel',e=>this.end(e));
    this.canvas.addEventListener('wheel',e=>{if(this.disabled)return;e.preventDefault();this.camera.zoom=clamp(this.camera.zoom*Math.exp(-e.deltaY*.001),.45,2.4);this.draw();},{passive:false});
    $('space-reset').addEventListener('click',()=>{this.camera={yaw:.72,pitch:-.4,zoom:1};this.draw();});
    $('space-clear').addEventListener('click',()=>this.onClear(this.index));
    $('space-sentence').addEventListener('change',()=>this.onSentence(Number($('space-sentence').value)));
    ['x','y','z'].forEach((axis,i)=>$('space-axis-'+axis).addEventListener('change',()=>{
      const next=[...this.axes],value=$('space-axis-'+axis).value,other=next.indexOf(value);
      if(other>=0)next[other]=next[i];next[i]=value;this.onAxes(next);
    }));
    this.resize=new ResizeObserver(()=>this.draw());this.resize.observe(this.canvas);
  }
  setState(state,{disabled=false}={}){
    this.state=state;this.disabled=disabled;this.axes=spaceAxes(state);
    this.index=clamp(Number.isInteger(state.spaceSentence)?state.spaceSentence:Math.max(0,state.slots.findIndex(s=>!s.text.trim())),0,state.slots.length-1);
    const uiKey=JSON.stringify([state.activeCharacterId,this.index,state.dimensions,state.characters,state.slots.map(s=>s.text)]);
    if(this.uiKey===uiKey){
      for(const [i,axis] of ['x','y','z'].entries()){$('space-axis-'+axis).value=this.axes[i];$('space-axis-'+axis).disabled=disabled;}
      for(const id of ['space-sentence','space-clear','space-plane','space-reset'])$(id).disabled=disabled;
      for(const {range} of this.sliderRows)range.disabled=disabled;
      this.updateReadouts();this.draw();return;
    }
    this.uiKey=uiKey;
    for(const [i,axis] of ['x','y','z'].entries()){
      const select=$('space-axis-'+axis);select.replaceChildren();select.disabled=disabled;
      for(const dimension of state.dimensions){const option=document.createElement('option');option.value=dimension.id;option.textContent=dimension.name;select.append(option);}select.value=this.axes[i];
    }
    const sentence=$('space-sentence');sentence.replaceChildren();sentence.disabled=disabled;
    state.slots.forEach((slot,i)=>{const option=document.createElement('option');option.value=i;option.textContent=`${String(i+1).padStart(2,'0')} · ${slot.text.slice(0,60)||'Unwritten sentence'}`;sentence.append(option);});sentence.value=this.index;
    $('space-clear').disabled=disabled;$('space-plane').disabled=disabled;$('space-reset').disabled=disabled;
    $('space-dimension-count').textContent=`${state.dimensions.length}D controls · sentence ${this.index+1}`;
    $('space-character').textContent=state.characters.find(c=>c.id===state.activeCharacterId).name;
    $('space-sliders').replaceChildren();this.sliderRows=[];
    for(const dimension of state.dimensions){
      const row=document.createElement('div');row.className='space-slider-row';
      const heading=document.createElement('div');heading.className='space-slider-heading';
      const label=document.createElement('label');label.htmlFor=`space-value-${dimension.id}`;label.textContent=dimension.name;
      const output=document.createElement('output');heading.append(label,output);
      const range=document.createElement('input');range.type='range';range.min=0;range.max=1;range.step=.01;range.id=label.htmlFor;range.disabled=disabled;
      const endpoints=document.createElement('div');endpoints.className='space-endpoints';const low=document.createElement('span'),high=document.createElement('span');low.textContent=dimension.low;high.textContent=dimension.high;endpoints.append(low,high);
      range.addEventListener('focus',()=>{if(!this.disabled)this.onBegin();});
      range.addEventListener('input',()=>{if(this.disabled)return;this.onUpdate(this.index,{[dimension.id]:Number(range.value)});this.updateReadouts();this.draw();});
      range.addEventListener('change',()=>{if(!this.disabled)this.onCommit([this.index]);});
      row.append(heading,range,endpoints);$('space-sliders').append(row);this.sliderRows.push({dimension,range,output});
    }
    this.updateReadouts();this.draw();
  }
  updateReadouts(){
    if(!this.state)return;
    for(const {dimension,range,output} of this.sliderRows||[]){const t=this.state.tracks[`${this.state.activeCharacterId}:${dimension.id}`],control=t.controls[this.index],value=control?.target??t.values[this.index]??.5;range.value=value;output.textContent=`${Math.round(value*100)}%${control?' target':' · unset'}`;}
    const point=pointCoordinates(this.state,this.index,this.axes);
    $('space-point-coordinates').textContent=this.axes.map((id,i)=>`${this.state.dimensions.find(d=>d.id===id).name}: ${Math.round(point.coordinates[i]*100)}%${point.constrained[i]?'':' (unset)'}`).join(' · ');
  }
  pointer(e){const r=this.canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
  start(e){
    if(this.disabled||e.button!==0)return;e.preventDefault();
    const start=this.pointer(e),near=pickProjectedPoint(this.projected||[],start,this.index);
    if(near){
      const index=near.index;this.onSentence(index);this.onBegin();
      this.drag={kind:'point',start,index,original:pointCoordinates(this.state,index,this.axes).coordinates,axes:[...this.axes],plane:$('space-plane').value};
    }else this.drag={kind:'orbit',start,camera:{...this.camera}};
    this.canvas.setPointerCapture(e.pointerId);
  }
  move(e){
    if(!this.drag)return;const p=this.pointer(e),delta=[p[0]-this.drag.start[0],p[1]-this.drag.start[1]];
    if(this.drag.kind==='orbit'){
      this.camera.yaw=this.drag.camera.yaw+delta[0]*.008;this.camera.pitch=clamp(this.drag.camera.pitch+delta[1]*.008,-1.4,1.4);this.draw();return;
    }
    const coords=dragInPlane(this.drag.original,delta,this.drag.plane,this.camera,this.width,this.height),positions={xy:[0,1],xz:[0,2],yz:[1,2]}[this.drag.plane];
    this.onUpdate(this.drag.index,Object.fromEntries(positions.map(i=>[this.drag.axes[i],coords[i]])));this.drag.moved=true;this.updateReadouts();this.draw();
  }
  end(e){
    if(!this.drag)return;const drag=this.drag;this.drag=null;
    if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
    if(drag.kind==='point'&&drag.moved)this.onCommit([drag.index]);
  }
  draw(){
    if(!this.state||!this.canvas.clientWidth||!this.canvas.clientHeight)return;
    const width=this.width=this.canvas.clientWidth,height=this.height=this.canvas.clientHeight,dpr=window.devicePixelRatio||1;
    if(this.canvas.width!==Math.round(width*dpr)||this.canvas.height!==Math.round(height*dpr)){this.canvas.width=Math.round(width*dpr);this.canvas.height=Math.round(height*dpr);}
    const ctx=this.ctx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const glow=ctx.createRadialGradient(width*.5,height*.5,0,width*.5,height*.5,width*.7);glow.addColorStop(0,'#143a38');glow.addColorStop(1,'#09181e');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    const project=p=>projectPoint(p,this.camera,width,height);
    const line=(a,b,color,lineWidth=1)=>{const x=project(a),y=project(b);ctx.beginPath();ctx.moveTo(x[0],x[1]);ctx.lineTo(y[0],y[1]);ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();};
    for(let t=0;t<=1.001;t+=.2){line([t,0,0],[t,0,1],'#61a99a22');line([0,0,t],[1,0,t],'#61a99a22');}
    for(let axis=0;axis<3;axis++)for(let a=0;a<=1;a++)for(let b=0;b<=1;b++){const p=[0,0,0],q=[0,0,0];p[(axis+1)%3]=q[(axis+1)%3]=a;p[(axis+2)%3]=q[(axis+2)%3]=b;q[axis]=1;line(p,q,'#8cc7b12a');}
    const colors=['#a5dfb6','#8dbcea','#d2a8e5'];
    this.axes.forEach((id,axis)=>{const end=[0,0,0];end[axis]=1;line([0,0,0],end,colors[axis],1.7);const p=project(end);ctx.font='10px sans-serif';ctx.fillStyle=colors[axis];ctx.fillText(`${['X','Y','Z'][axis]} · ${this.state.dimensions.find(d=>d.id===id).name}`,clamp(p[0]+7,5,width-105),clamp(p[1]-7,14,height-8));});
    const points=this.state.slots.map((_,i)=>({...pointCoordinates(this.state,i,this.axes),index:i}));
    ctx.shadowBlur=8;ctx.shadowColor='#79dfbc';
    for(let i=1;i<points.length;i++)line(points[i-1].coordinates,points[i].coordinates,'#8ed9b978',1.6);
    ctx.shadowColor='#78adf0';
    for(let i=1;i<points.length;i++)if([...points[i-1].recognized,...points[i].recognized].every(v=>v!==null))line(points[i-1].recognized,points[i].recognized,'#78aeee',2);
    for(const p of points)if(p.recognized.every(v=>v!==null)){const s=project(p.recognized);ctx.beginPath();ctx.arc(s[0],s[1],3,0,Math.PI*2);ctx.fillStyle='#83b8ef';ctx.fill();}
    this.projected=points.map(p=>({...p,screen:project(p.coordinates)}));
    const sorted=[...this.projected].sort((a,b)=>a.index===this.index?1:b.index===this.index?-1:b.screen[2]-a.screen[2]);
    for(const p of sorted){const [x,y]=p.screen,selected=p.index===this.index,constrained=p.constrained.every(Boolean);ctx.shadowColor='#a0f4c8';ctx.shadowBlur=selected?17:5;ctx.beginPath();ctx.arc(x,y,selected?8:5,0,Math.PI*2);ctx.fillStyle=constrained?'#a1e7bd':'#173932';ctx.fill();ctx.strokeStyle=selected?'#f0ffed':'#7ba694';ctx.lineWidth=selected?2:1;ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=selected?'#efffee':'#a1c7b2';ctx.font=selected?'bold 11px sans-serif':'9px sans-serif';ctx.fillText(String(p.index+1),x+9,y-8);}
    ctx.shadowBlur=0;ctx.font='9px sans-serif';ctx.fillStyle='#70a595';ctx.fillText('TARGET SPACE  /  NUMBERED BY STORY ORDER',14,20);
  }
}
