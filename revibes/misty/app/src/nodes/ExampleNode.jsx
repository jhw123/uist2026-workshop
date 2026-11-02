import React, { useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Crop, Undo2, Check, Hand, Image as ImageIcon } from 'lucide-react';
import { useMisty, setDragPayload } from '../lib/context.js';
import { cropFromImage } from '../lib/image.js';

const WIDTH = 300;

export default function ExampleNode({ id, data, selected }) {
  const { patch } = useMisty();
  const [selecting, setSelecting] = useState(false);
  const [draft, setDraft] = useState(null); // rect being drawn
  const imgRef = useRef(null);
  const dragImgRef = useRef(null);
  const start = useRef(null);
  const sel = data.selection; // { rect, url } or null

  const toNorm = (e) => {
    const r = imgRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onDown = (e) => {
    if (!selecting) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = toNorm(e);
    setDraft({ x: start.current.x, y: start.current.y, w: 0, h: 0 });
  };
  const onMove = (e) => {
    if (!start.current) return;
    const p = toNorm(e), s = start.current;
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    if (draft && draft.w > 0.03 && draft.h > 0.02) {
      const url = cropFromImage(imgRef.current, draft);
      patch(id, (d) => ({ selection: { rect: draft, url }, history: [...(d.history || []), d.selection || null] }));
    }
    setDraft(null);
  };

  const undo = () => patch(id, (d) => {
    const h = [...(d.history || [])];
    return { selection: h.pop() || null, history: h };
  });

  const onDragStart = (e, whole) => {
    const image = whole ? data.image : sel.url;
    setDragPayload({ exampleId: id, image, exampleTitle: data.title, whole });
    e.dataTransfer.setData('text/plain', 'misty-example');
    e.dataTransfer.effectAllowed = 'copy';
    if (dragImgRef.current) e.dataTransfer.setDragImage(dragImgRef.current, 20, 20);
  };

  const box = (r, extra) => ({
    left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, ...extra,
  });

  return (
    <div className={`rounded-xl bg-[#e3e9f7] shadow-md border-2 ${selected ? 'border-[#4f86c6]' : 'border-transparent'}`} style={{ width: WIDTH + 32 }}>
      <div className="px-4 pt-3 pb-2 text-center">
        <div className="text-[15px] font-semibold text-[#2b4a7a] flex items-center justify-center gap-1.5">
          <ImageIcon size={15} /> Reference Example
        </div>
        <div className="text-[11px] text-[#5b6f90] truncate" title={data.title}>{data.title}</div>
      </div>

      <div className="px-4">
        <div
          className={`relative nodrag select-none ${selecting ? 'cursor-crosshair' : ''}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        >
          <img
            ref={imgRef} src={data.image} alt={data.title}
            className="block w-full rounded-md shadow-sm bg-white"
            draggable={!selecting && !sel}
            onDragStart={(e) => onDragStart(e, true)}
            onDragEnd={() => setTimeout(() => setDragPayload(null), 100)}
          />
          {sel && (
            <div
              className={`absolute border-2 border-dashed border-[#3b5ba5] bg-[#3b5ba5]/15 rounded-sm ${selecting ? 'pointer-events-none' : 'cursor-grab'}`}
              style={box(sel.rect)}
              draggable={!selecting}
              onDragStart={(e) => onDragStart(e, false)}
              onDragEnd={() => setTimeout(() => setDragPayload(null), 100)}
              title="Drag this region onto part of a source UI"
            >
              {!selecting && (
                <span className="absolute -bottom-3 -right-3 rounded-full bg-white shadow p-1 text-[#3b5ba5]"><Hand size={14} /></span>
              )}
            </div>
          )}
          {draft && <div className="absolute border-2 border-dashed border-[#3b5ba5] bg-[#3b5ba5]/10" style={box(draft)} />}
        </div>
        {/* Off-screen thumbnail used as the drag image */}
        <img ref={dragImgRef} src={sel?.url || data.image} alt="" style={{ position: 'absolute', left: -9999, top: 0, width: 90 }} />
      </div>

      <div className="flex justify-center gap-2 px-4 py-3">
        {selecting ? (
          <>
            <button className="nodrag flex items-center gap-1 rounded-md bg-[#7d93b8] hover:bg-[#6b82a9] text-white text-xs px-3 py-1.5 disabled:opacity-50"
              onClick={undo} disabled={!(data.history || []).length}>
              <Undo2 size={13} /> Undo
            </button>
            <button className="nodrag flex items-center gap-1 rounded-md bg-[#7d93b8] hover:bg-[#6b82a9] text-white text-xs px-3 py-1.5"
              onClick={() => setSelecting(false)}>
              <Check size={13} /> Done
            </button>
          </>
        ) : (
          <button className="nodrag flex items-center gap-1 rounded-md bg-[#4f6fa8] hover:bg-[#3f5f98] text-white text-xs px-3 py-1.5"
            onClick={() => setSelecting(true)}>
            <Crop size={13} /> {sel ? 'Reselect region' : 'Select region'}
          </button>
        )}
        {sel && !selecting && (
          <button className="nodrag text-xs text-[#4f6fa8] underline" onClick={() => patch(id, (d) => ({ selection: null, history: [...(d.history || []), d.selection] }))}>
            Clear
          </button>
        )}
      </div>
      <div className="px-4 pb-3 text-[11px] leading-snug text-[#5b6f90] text-center">
        {selecting
          ? 'Drag over the image to select a section. Done when finished.'
          : sel
            ? 'Drag the selected section onto part of a source UI, or connect ● to a source UI for a global blend.'
            : 'Connect ● to a source UI for a global blend, or drag the image (or a selected section) onto part of a source UI.'}
      </div>

      <Handle type="source" id="out" position={Position.Right}
        style={{ width: 16, height: 16, background: '#4f86c6', border: '3px solid white', right: -9 }} />
    </div>
  );
}
