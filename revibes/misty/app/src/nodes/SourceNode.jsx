import React, { useCallback, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Hammer, Sparkles, Terminal, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Code2 } from 'lucide-react';
import { useMisty, getDragPayload } from '../lib/context.js';
import { CodePreview } from '../lib/render.jsx';
import AppliedChanges from '../components/AppliedChanges.jsx';

const PHONE_W = 375;
const PHONE_H = 720;

// Choose a meaningful element under the cursor: climb from tiny leaf
// elements (icons, short text) to a container of reasonable size.
function pickTarget(el, root) {
  let cur = el;
  while (cur && cur !== root && root.contains(cur)) {
    const r = cur.getBoundingClientRect();
    const scale = root.getBoundingClientRect().width / root.offsetWidth || 1;
    const area = (r.width / scale) * (r.height / scale);
    // Icons, inline text and plain text blocks (headings, paragraphs) climb to their container.
    const textOnly = /^(P|H[1-6]|LABEL|LI)$/.test(cur.tagName) && cur.children.length === 0;
    const leaf = cur instanceof SVGElement || textOnly || ['SPAN', 'B', 'I', 'STRONG', 'EM', 'SMALL'].includes(cur.tagName);
    if (!leaf && area >= 2400) return cur;
    cur = cur.parentElement;
  }
  return root.firstElementChild?.firstElementChild || null;
}

function describe(el) {
  const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
  return `<${el.tagName.toLowerCase()}>${text ? ` “${text.slice(0, 60)}${text.length > 60 ? '…' : ''}”` : ''}`;
}

export default function SourceNode({ id, data, selected }) {
  const { requestDrop, regenerate, fixRender, openCode, codeNodeId, patch } = useMisty();
  const [hl, setHl] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const rootRef = useRef(null);
  const targetRef = useRef(null);
  const hasResult = !!data.result;
  const isBlend = !!data.blend;

  const onRenderError = useCallback((err) => {
    const msg = err ? String(err.message || err) : null;
    if ((data.renderError || null) !== msg) patch(id, { renderError: msg });
  }, [data.renderError, id, patch]);

  const onDragOver = (e) => {
    if (!getDragPayload() || data.loading) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    const root = rootRef.current;
    const t = pickTarget(e.target, root);
    if (!t) return;
    targetRef.current = t;
    const cr = root.getBoundingClientRect();
    const scale = cr.width / root.offsetWidth || 1;
    const r = t.getBoundingClientRect();
    setHl({
      left: (r.left - cr.left) / scale + root.scrollLeft,
      top: (r.top - cr.top) / scale + root.scrollTop,
      width: r.width / scale, height: r.height / scale, label: describe(t),
    });
  };
  const onDragLeave = (e) => {
    if (!rootRef.current.contains(e.relatedTarget)) setHl(null);
  };
  const onDrop = (e) => {
    const p = getDragPayload();
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    const t = targetRef.current || pickTarget(e.target, rootRef.current);
    setHl(null);
    const html = t ? t.outerHTML : '';
    requestDrop({
      sourceId: id, exampleId: p.exampleId, image: p.image, exampleTitle: p.exampleTitle,
      targetHtml: html.length > 4000 ? html.slice(0, 4000) + '…' : html,
      targetLabel: t ? describe(t) : 'the whole screen',
    });
  };

  return (
    <div className={`flex rounded-xl bg-[#ece7f8] shadow-md border-2 ${selected ? 'border-[#8b7fc7]' : 'border-transparent'}`}>
      <Handle type="target" id="in" position={Position.Left}
        style={{ width: 16, height: 16, background: '#8b7fc7', border: '3px solid white', left: -9 }} />

      <div className="flex flex-col items-center px-5 pt-3 pb-4" style={{ width: PHONE_W + 40 }}>
        <div className="text-[15px] font-semibold text-[#3f3470]">Code Render</div>
        <div className="text-[11px] text-[#6c6396] mb-1 truncate max-w-full" title={data.title}>
          {data.title}{isBlend && data.blend.exampleTitle ? ` · from ${data.blend.exampleTitle}` : ''}
          {data.edited ? ' · edited' : ''}
        </div>
        <div className="flex gap-4 mb-2 text-[13px] text-[#4b3f86]">
          <button className="nodrag flex items-center gap-1 hover:text-[#2c2260]" onClick={() => fixRender(id)} title="Repair code that does not render">
            <Hammer size={14} /> Fix Render
          </button>
          {isBlend && (
            <button className="nodrag flex items-center gap-1 hover:text-[#2c2260] disabled:opacity-40" onClick={() => regenerate(id)} disabled={!!data.loading} title="Run this blend again">
              <Sparkles size={14} /> Regenerate
            </button>
          )}
        </div>

        <div className="relative">
          <div
            ref={rootRef}
            className="nodrag nowheel relative overflow-auto bg-white rounded-lg shadow-inner border border-[#d8d0ef]"
            style={{ width: PHONE_W, height: PHONE_H }}
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
          >
            <div className="relative min-h-full">
              <CodePreview code={data.code} onError={onRenderError} />
            </div>
            {hl && (
              <div className="misty-highlight pointer-events-none absolute rounded-md" style={{ left: hl.left, top: hl.top, width: hl.width, height: hl.height }}>
                <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-[#7c5cd6] text-white text-[10px] px-1.5 py-0.5 max-w-[340px] truncate">
                  Blend into {hl.label}
                </span>
              </div>
            )}
          </div>
          {data.loading && (
            <div className="absolute inset-0 rounded-lg bg-white/80 backdrop-blur-[1px] flex flex-col items-center justify-center gap-2 text-[#4b3f86] text-sm">
              <Loader2 className="animate-spin" size={26} />
              <div className="px-6 text-center">{data.loading}</div>
              <div className="text-[11px] text-gray-500">This takes a few seconds to a minute.</div>
            </div>
          )}
        </div>

        {data.error && (
          <div className="nodrag mt-2 w-full rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div className="select-text">{data.error}</div>
          </div>
        )}

        <button
          className={`nodrag mt-3 flex items-center gap-1.5 rounded-md text-white text-[13px] px-4 py-2 shadow ${codeNodeId === id ? 'bg-[#4b3f86]' : 'bg-[#2f2f35] hover:bg-black'}`}
          onClick={() => openCode(codeNodeId === id ? null : id)}
        >
          {codeNodeId === id ? <Code2 size={14} /> : <Terminal size={14} />} {codeNodeId === id ? 'Hide Code' : 'Show Code'}
        </button>
      </div>

      {hasResult && (
        <div className="flex items-stretch border-l border-[#d8d0ef]">
          <button className="nodrag px-1.5 text-[#6c5bb0] hover:bg-[#e2dbf5]" onClick={() => setPanelOpen((o) => !o)} title={panelOpen ? 'Collapse' : 'Show applied changes'}>
            {panelOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          {panelOpen && <AppliedChanges id={id} data={data} />}
        </div>
      )}

      <Handle type="source" id="out" position={Position.Right} isConnectable={false}
        style={{ width: 10, height: 10, background: '#b7acdf', border: '2px solid white', right: -6 }} />
    </div>
  );
}
