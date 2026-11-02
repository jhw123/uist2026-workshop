import { useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Undo2, Check, Move } from "lucide-react";
import { useMisty } from "../context";
import { cropDataUrl } from "../lib/image";

// Example node (A in Figure 1): shows an uploaded screenshot or sketch.
// Users crop a section (draw a box, then Done) and drag it onto a source node;
// or connect the handle on the right to a source node for a global blend.
export default function ExampleNode({ id, data, selected }) {
  const { updateNodeData } = useMisty();
  const imgRef = useRef(null);
  const [draft, setDraft] = useState(null); // rect being drawn, in fractions
  const [drawing, setDrawing] = useState(false);
  const start = useRef(null);
  const crop = data.crop;
  const rect = draft || crop?.rect;
  const ghost = useRef(null);
  useEffect(() => {
    if (!crop?.url) return;
    ghost.current = new Image();
    ghost.current.src = crop.url;
  }, [crop?.url]);

  const frac = (e) => {
    const r = imgRef.current.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = frac(e);
    setDrawing(true);
    setDraft({ ...start.current, w: 0, h: 0 });
  };
  const onPointerMove = (e) => {
    if (!drawing) return;
    const p = frac(e);
    const s = start.current;
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onPointerUp = () => {
    setDrawing(false);
    if (draft && (draft.w < 0.02 || draft.h < 0.01)) setDraft(null);
  };

  const done = async () => {
    if (!draft) return;
    const url = await cropDataUrl(data.image, draft);
    updateNodeData(id, { crop: { rect: draft, url } });
    setDraft(null);
  };
  const undo = () => {
    setDraft(null);
    updateNodeData(id, { crop: null });
  };

  const onDragStart = (e) => {
    e.dataTransfer.setData("application/x-misty-example", id);
    e.dataTransfer.effectAllowed = "copy";
    if (ghost.current?.complete) e.dataTransfer.setDragImage(ghost.current, 20, 20);
  };

  return (
    <div className={`w-[340px] rounded-lg bg-indigo-50 border-t-4 border-indigo-300 shadow-md ${selected ? "ring-2 ring-indigo-400" : ""}`}>
      <div className="text-center text-indigo-900 font-medium py-2">{data.name || "Reference Example"}</div>
      <div className="px-4 pb-2">
        <div
          ref={imgRef}
          className="relative nodrag select-none cursor-crosshair bg-white"
          onPointerDown={crop && !draft ? undefined : onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img src={data.image} draggable={false} className="w-full block pointer-events-none" />
          {crop && !draft && (
            // Clicking outside the confirmed crop starts a new selection
            <div className="absolute inset-0" onPointerDown={onPointerDown} />
          )}
          {rect && (
            <div
              className={`absolute border-2 border-dashed ${crop && !draft ? "border-indigo-600 bg-indigo-400/20 cursor-grab" : "border-indigo-500 bg-indigo-300/20"}`}
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
              draggable={!!(crop && !draft)}
              onDragStart={crop && !draft ? onDragStart : undefined}
              onPointerDown={crop && !draft ? (e) => e.stopPropagation() : undefined}
              title={crop && !draft ? "Drag this section onto a source UI" : ""}
            >
              {crop && !draft && (
                <span className="absolute -top-6 right-0 bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 whitespace-nowrap">
                  <Move size={10} /> drag onto a source UI
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-center gap-3 pb-3">
        <button className="flex items-center gap-1 px-4 py-1.5 rounded bg-indigo-300 text-white text-sm disabled:opacity-50 hover:bg-indigo-400" disabled={!rect} onClick={undo}>
          <Undo2 size={14} /> Undo
        </button>
        <button className="flex items-center gap-1 px-4 py-1.5 rounded bg-indigo-300 text-white text-sm disabled:opacity-50 hover:bg-indigo-400" disabled={!draft} onClick={done}>
          <Check size={14} /> Done
        </button>
      </div>
      <p className="text-[11px] text-indigo-700/70 px-4 pb-3 text-center">
        Draw a box to select a section, press Done, then drag it onto a source UI. Or drag the handle on the right to a source UI to blend the whole screen.
      </p>
      <Handle type="source" position={Position.Right} className="misty-handle" />
    </div>
  );
}
