const clamp=v=>Math.max(0,Math.min(1,v));
export function projectPoint(point,camera,width,height){
  const [x,y,z]=point.map(v=>v-.5),cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
  const rx=x*cy+z*sy,rz=-x*sy+z*cy,ry=y*cp-rz*sp,depth=y*sp+rz*cp;
  const perspective=3/(3+depth),scale=Math.min(width*.62,height*.8)*camera.zoom;
  return [width/2+rx*scale*perspective,height/2-ry*scale*perspective,depth];
}
export function dragInPlane(point,delta,plane,camera,width,height){
  const axes={xy:[0,1],xz:[0,2],yz:[1,2]}[plane];if(!axes)return [...point];
  const next=[...point],origin=projectPoint(point,camera,width,height),target=[origin[0]+delta[0],origin[1]+delta[1]],eps=.0001;
  for(let iter=0;iter<8;iter++){
    const p=projectPoint(next,camera,width,height),columns=axes.map(axis=>{const v=[...next];v[axis]+=eps;const q=projectPoint(v,camera,width,height);return [(q[0]-p[0])/eps,(q[1]-p[1])/eps];});
    const [[a,c],[b,d]]=columns,det=a*d-b*c;if(Math.abs(det)<1e-6)break;
    const dx=target[0]-p[0],dy=target[1]-p[1];
    next[axes[0]]=clamp(next[axes[0]]+(d*dx-b*dy)/det);next[axes[1]]=clamp(next[axes[1]]+(-c*dx+a*dy)/det);
  }
  return next;
}
export function spaceAxes(state){
  const valid=new Set(state.dimensions.map(d=>d.id)),axes=[];
  for(const id of [...(state.spaceAxes||[]),...state.dimensions.map(d=>d.id)])if(valid.has(id)&&!axes.includes(id)&&axes.length<3)axes.push(id);
  return axes;
}
export function pointCoordinates(state,index,axes=spaceAxes(state)){
  const constrained=[],recognized=[];
  const coordinates=axes.map(id=>{const t=state.tracks[`${state.activeCharacterId}:${id}`],c=t?.controls[index],v=t?.values[index];constrained.push(!!c);recognized.push(v??null);return c?.target??v??.5;});
  return {index,coordinates,constrained,recognized};
}
export function setPointTargets(state,index,values){
  if(!Number.isInteger(index)||index<0||index>=state.slots.length)throw new Error('Invalid sentence.');
  for(const [id,value] of Object.entries(values))if(!state.dimensions.some(d=>d.id===id)||!Number.isFinite(value)||value<0||value>1)throw new Error('Invalid dimension value.');
  for(const [id,value] of Object.entries(values))state.tracks[`${state.activeCharacterId}:${id}`].controls[index]={target:value,tolerance:.12};
}
export function pickProjectedPoint(points,position,selectedIndex,radius=15){
  const distance=p=>Math.hypot(p.screen[0]-position[0],p.screen[1]-position[1]);
  return points.filter(p=>distance(p)<radius).sort((a,b)=>{
    const delta=distance(a)-distance(b);if(Math.abs(delta)>.5)return delta;
    return a.index===selectedIndex?-1:b.index===selectedIndex?1:a.screen[2]-b.screen[2];
  })[0]||null;
}
