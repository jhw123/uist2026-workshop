import React, { useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Undo2, Check, GripVertical, X, Crop, Hand } from "lucide-react";
import { useMisty } from "../context.js";
import { cropDataUrl } from "../lib/images.js";

const W = 300;

/**
 * Example node (A in Figure 1): an uploaded screenshot or sketch. Draw a rectangle to select
 * a section; Done crops it so it can be dragged onto a source node. Connect the handle on
 * the right to a source node for global blending.
 */
export default function ExampleNode({ id, data, selected }) {
  const misty = useMisty();
  const imgRef = useRef(null);
  const [draft, setDraftState] = useState(null); // selection being drawn, fractions
  const draftRef = useRef(null);
  const setDraft = (d) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const start = useRef(null);
  const sel = draft || data.selection || null;
  const confirmed = !!data.crop && !draft;
  const cropImg = useRef(null);
  const wholeImg = useRef(null);

  const frac = (e) => {
    const r = imgRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = frac(e);
    start.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onPointerMove = (e) => {
    if (!start.current) return;
    const p = frac(e);
    const s = start.current;
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    const d = draftRef.current;
    setDraft(null);
    if (d && d.w >= 0.02 && d.h >= 0.01) misty.updateNode(id, { selection: d, crop: null });
  };

  const done = async () => {
    if (!data.selection) return;
    const url = await cropDataUrl(data.imageUrl, data.selection);
    misty.updateNode(id, { crop: url });
  };
  const undo = () => misty.updateNode(id, { selection: null, crop: null });

  const startDrag = (e, whole) => {
    const url = whole ? data.imageUrl : data.crop;
    misty.beginDrag({ exampleId: id, imageUrl: url, whole });
    e.dataTransfer.setData("application/x-misty-example", id);
    e.dataTransfer.effectAllowed = "copy";
    const ghost = whole ? wholeImg.current : cropImg.current;
    if (ghost?.complete) {
      try {
        e.dataTransfer.setDragImage(ghost, 24, 24);
      } catch {}
    }
  };

  return (
    <div
      className={`rounded-xl bg-indigo-50/95 border ${selected ? "border-indigo-500 ring-2 ring-indigo-300" : "border-indigo-200"} shadow-lg`}
      style={{ width: W + 24 }}
    >
      <div className="flex items-center gap-1 px-3 pt-2 pb-1">
        <div className="flex-1 text-center">
          <div className="text-[15px] font-medium text-indigo-950">Reference Example</div>
          <div className="text-[11px] text-indigo-700/70 truncate" title={data.name}>
            {data.name}
          </div>
        </div>
        <button
          className="nodrag p-1 text-indigo-400 hover:text-red-600"
          title="Delete this example"
          onClick={() => misty.deleteNode(id)}
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div
          className="nodrag nopan relative select-none cursor-crosshair overflow-hidden rounded-lg bg-white shadow-sm"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img ref={imgRef} src={data.imageUrl} draggable={false} className="block w-full" alt={data.name} />
          {sel && (
            <div
              className={`absolute border-2 border-dashed ${confirmed ? "border-indigo-600 bg-indigo-500/15 cursor-grab" : "border-indigo-500 bg-indigo-400/10"}`}
              style={{ left: `${sel.x * 100}%`, top: `${sel.y * 100}%`, width: `${sel.w * 100}%`, height: `${sel.h * 100}%` }}
              draggable={confirmed}
              onPointerDown={(e) => confirmed && e.stopPropagation()}
              onDragStart={(e) => startDrag(e, false)}
              onDragEnd={() => misty.endDrag()}
              title={confirmed ? "Drag this section onto a Code Render" : ""}
            >
              {confirmed && (
                <div className="absolute -right-2 -bottom-2 rounded-full bg-indigo-600 p-1 text-white shadow">
                  <Hand size={12} />
                </div>
              )}
            </div>
          )}
        </div>
        <img ref={wholeImg} src={data.imageUrl} alt="" className="fixed -left-[9999px] top-0 w-[110px]" />
        {data.crop && <img ref={cropImg} src={data.crop} alt="" className="fixed -left-[9999px] top-0 max-w-[180px]" />}

        <div className="mt-2 flex items-center justify-center gap-2">
          {!data.selection ? (
            <>
              <span className="text-[11px] text-indigo-800/70 flex items-center gap-1">
                <Crop size={12} /> Draw on the image to select a section
              </span>
            </>
          ) : (
            <>
              <button
                className="nodrag flex items-center gap-1 rounded-md bg-indigo-400/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                onClick={undo}
              >
                <Undo2 size={13} /> Undo
              </button>
              <button
                className={`nodrag flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white ${data.crop ? "bg-indigo-700" : "bg-indigo-400/80 hover:bg-indigo-500"}`}
                onClick={done}
              >
                <Check size={13} /> Done
              </button>
            </>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-center">
          <div
            className="nodrag flex cursor-grab items-center gap-1 rounded-md px-2 py-1 text-[11px] text-indigo-700 hover:bg-indigo-100"
            draggable
            onDragStart={(e) => startDrag(e, true)}
            onDragEnd={() => misty.endDrag()}
            title="Drag the whole screen onto a section of a Code Render"
          >
            <GripVertical size={12} /> {data.crop ? "or drag the whole screen" : "Drag the whole screen"}
          </div>
        </div>
        {data.crop && (
          <div className="mt-1 text-center text-[11px] text-indigo-800/80">Drag the selected section onto a Code Render</div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="misty-handle-out"
        title="Connect to a Code Render for global blending"
      />
    </div>
  );
}
