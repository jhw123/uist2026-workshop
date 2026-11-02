export const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
export const clone = value => structuredClone(value);
export function normalizedCrop(crop) {
  if (!crop) return null;
  const x=clamp(Number(crop.x)||0,0,.99),y=clamp(Number(crop.y)||0,0,.99);
  return {x,y,w:clamp(Number(crop.w)||.1,.01,1-x),h:clamp(Number(crop.h)||.1,.01,1-y)};
}
export function validateWorkspace(data) {
  if (!data || data.version!==1 || !Array.isArray(data.nodes) || data.nodes.length>100) throw Error('This is not a supported Misty workspace (version 1, at most 100 nodes).');
  const ids=new Set();
  for(const n of data.nodes){
    if(typeof n.id!=='string'||ids.has(n.id)||!['example','source'].includes(n.type))throw Error('Invalid or duplicate node.');
    ids.add(n.id);
    if(!Number.isFinite(n.x)||!Number.isFinite(n.y))throw Error('Invalid node position.');
    if(typeof n.name!=='string')throw Error('Every node needs a name.');
    if(n.type==='source'&&(typeof n.code!=='string'||n.code.length>300000))throw Error('Invalid source code.');
    if(n.type==='example'&&(typeof n.image!=='string'||!(n.image.startsWith('/assets/')||/^data:image\/(png|jpeg|gif|webp);base64,/.test(n.image))))throw Error('Invalid reference image.');
    if(n.crop)n.crop=normalizedCrop(n.crop);
    if(n.type==='source'){
      if(!Array.isArray(n.groups))n.groups=[];
      n.groups=n.groups.filter(g=>g&&typeof g==='object').slice(0,10).map((g,i)=>({...g,id:typeof g.id==='string'?g.id:'group-'+i,category:String(g.category||'Visual details'),description:String(g.description||''),enabled:g.enabled!==false,controls:(Array.isArray(g.controls)?g.controls:[]).filter(c=>c&&['range','color','text','select'].includes(c.type)&&(c.type!=='select'||Array.isArray(c.options))).slice(0,3)}));
    }
  }
  data.edges=(Array.isArray(data.edges)?data.edges:[]).filter(e=>ids.has(e.from)&&ids.has(e.to));
  data.view={x:Number(data.view?.x)||0,y:Number(data.view?.y)||0,zoom:clamp(Number(data.view?.zoom)||.8,.2,1.5)};
  data.name=typeof data.name==='string'?data.name:'Untitled workspace';
  if(!ids.has(data.selected))data.selected=data.nodes[0]?.id||null;
  return data;
}
export function fitView(nodes,width,height){
  if(!nodes.length)return {x:0,y:0,zoom:1};
  const minX=Math.min(...nodes.map(n=>n.x)),minY=Math.min(...nodes.map(n=>n.y));
  const maxX=Math.max(...nodes.map(n=>n.x+360)),maxY=Math.max(...nodes.map(n=>n.y+725));
  const zoom=clamp(Math.min((width-100)/(maxX-minX),(height-140)/(maxY-minY)),.2,1.15);
  return {x:(width-(maxX-minX)*zoom)/2-minX*zoom,y:70-minY*zoom,zoom};
}
