// Source code executes only in an opaque-origin, script-only sandbox iframe.
export function normalizeCode(input) {
  return input.trim().replace(/^```(?:jsx|tsx|javascript|html)?\s*\n?|\n?```$/g, '')
    .replace(/^\s*import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s*['"][^'"]+['"];?\s*$/gm, '')
    .trim();
}

export function componentProgram(input) {
  let code = normalizeCode(input);
  let name;
  const defaultName = code.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/);
  if (defaultName) { name = defaultName[1]; code = code.replace(defaultName[0], ''); }
  code = code.replace(/export\s+default\s+/, '').replace(/export\s+(?=(?:const|function|let)\s)/g, '');
  if (/^(?:async\s+)?function\s+([\w$]+)/.test(code)) name ||= code.match(/function\s+([\w$]+)/)[1];
  if (/^(?:const|let|var)\s+/.test(code)) {
    const declarations = [...code.matchAll(/(?:const|let|var)\s+([A-Z][\w$]*)\s*=/g)];
    name ||= declarations.at(-1)?.[1];
  }
  if (name) return `${code}\n;return ${name};`;
  return `return (${code.replace(/;\s*$/, '')});`;
}

export function previewDocument(code, id, revision = '') {
  const base = location.origin;
  const safe = value => JSON.stringify(value).replace(/</g, '\\u003c');
  const isHTML = /^(?:<!doctype|<html|<style|<div|<main|<section)/i.test(normalizeCode(code));
  return `<!doctype html><html><head><meta charset="UTF-8"><base href="${base}/">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' ${base}; style-src 'unsafe-inline'; img-src data: blob: ${base}; font-src data: ${base}; connect-src 'none';">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Arial,sans-serif}body{background:white;user-select:none}button,a{cursor:pointer}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#ccc;border-radius:4px}#misty-error{padding:20px;background:#fff1f2;color:#9f1239;font:12px/1.6 monospace;white-space:pre-wrap}</style>
  <script src="${base}/vendor/react.js"></script><script src="${base}/vendor/react-dom.js"></script>
  <script src="${base}/vendor/babel.js"></script><script src="${base}/vendor/tailwind.js"></script>
  </head><body><div id="root"></div><script>
  const nodeId=${safe(id)}, revision=${safe(revision)};
  const send=(type,data={})=>parent.postMessage({type,nodeId,revision,...data},'*');
  let hasError=false;const fail=error=>{hasError=true;document.getElementById('root').innerHTML='';const e=document.createElement('pre');e.id='misty-error';e.textContent=String(error.message||error);document.getElementById('root').append(e);send('misty-error',{error:e.textContent})};
  window.addEventListener('error',e=>fail(e.error||e.message));
  window.addEventListener('unhandledrejection',e=>fail(e.reason));
  try {
    ${isHTML ? `document.getElementById('root').innerHTML=${safe(normalizeCode(code))};` : `const program=Babel.transform(${safe(componentProgram(code))},{presets:['react'],sourceType:'script',parserOpts:{allowReturnOutsideFunction:true}}).code;
    const {useState,useEffect,useMemo,useRef,useCallback,useReducer,useLayoutEffect,Fragment}=React;
    const Component=new Function('React','useState','useEffect','useMemo','useRef','useCallback','useReducer','useLayoutEffect','Fragment',program)(React,useState,useEffect,useMemo,useRef,useCallback,useReducer,useLayoutEffect,Fragment);
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component));`}
    setTimeout(()=>{if(!hasError)send('misty-rendered')},500);
  } catch(error){fail(error)}
  let targetMode=false, highlighted=null, oldOutline='',oldOffset='';
  const clear=()=>{if(highlighted){highlighted.style.outline=oldOutline;highlighted.style.outlineOffset=oldOffset;highlighted=null}};
  function describe(el){
    if(!el||el.id==='misty-error')return null;
    if(el===document.documentElement||el===document.body)el=document.getElementById('root').firstElementChild||document.getElementById('root');
    // Prefer a meaningful repeated card or control rather than an inline text glyph.
    if(['SPAN','SVG','PATH','IMG','H1','H2','H3','P','SMALL','STRONG'].includes(el.tagName))el=el.closest('article,li,button,section,header,nav')||el.parentElement;
    const rect=el.getBoundingClientRect();const parts=[];let current=el;
    while(current&&current.id!=='root'&&current!==document.body){const parent=current.parentElement;parts.unshift(current.tagName.toLowerCase()+':nth-child('+(parent?[...parent.children].indexOf(current)+1:1)+')');current=parent}
    const target={html:el.outerHTML.slice(0,16000),selector:'#root > '+parts.join(' > '),tag:el.tagName.toLowerCase(),label:(el.innerText||el.getAttribute('aria-label')||el.tagName).trim().slice(0,100),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
    highlighted=el;oldOutline=el.style.outline;oldOffset=el.style.outlineOffset;el.style.outline='3px solid #8b5cf6';el.style.outlineOffset='-3px';
    return target;
  }
  function targetAt(x,y){clear();return describe(document.elementFromPoint(x,y))}
  window.addEventListener('message',e=>{if(e.source!==parent)return;const m=e.data;
    if(m.type==='misty-mode'){targetMode=m.enabled;if(!targetMode)clear()}
    if(m.type==='misty-hit'){const target=targetAt(m.x,m.y);if(target)send('misty-target',{target,request:m.request})}
    if(m.type==='misty-clear')clear();
    if(m.type==='misty-elements'){
      const elements=[...document.querySelectorAll('#root main,#root section,#root article,#root header,#root nav,#root button,#root li')].slice(0,60).map(el=>{
        clear();return describe(el)
      }).filter(Boolean);clear();
      const unique=[...new Map(elements.map(t=>[t.selector,t])).values()];send('misty-elements',{elements:unique});
    }
  });
  document.addEventListener('pointermove',e=>{if(targetMode){const target=targetAt(e.clientX,e.clientY);if(target)send('misty-hover',{target})}});
  document.addEventListener('click',e=>{e.preventDefault();if(targetMode){e.stopPropagation();const target=targetAt(e.clientX,e.clientY);if(target)send('misty-pick',{target})}},true);
  document.addEventListener('submit',e=>e.preventDefault());
  <\/script></body></html>`;
}
