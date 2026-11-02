import { useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Undo2, Check, Trash2, Hand } from "lucide-react";
import { useMisty } from "../lib/context.js";
import { cropImage, loadImage } from "../lib/image.js";
import { DRAG_MIME, setDrag } from "../lib/dragState.js";

const clamp = (v) => Math.max(0, Math.min(1, v));

// Example node (Figure 1 A): an uploaded screenshot or sketch. Connect its handle
// to a source node for a global blend, or draw a box around a section, press
// Done, and drag the section onto part of a source UI for a targeted blend.
export default function ExampleNode({ id, data, selected }) {
  const m = useMisty();
  const boxRef = useRef(null);
  const start = useRef(null);
  const crop = useRef(null);
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState("none"); // none | drawing | pending | ready

  const frac = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const inside = (p) => sel && p.x >= sel.x && p.x <= sel.x + sel.w && p.y >= sel.y && p.y <= sel.y + sel.h;

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (mode === "ready" && inside(frac(e))) return; // let the HTML5 drag start
    e.preventDefault();
    start.current = frac(e);
    setSel({ ...start.current, w: 0, h: 0 });
    setMode("drawing");
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (mode !== "drawing") return;
    const p = frac(e), s = start.current;
    setSel({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onPointerUp = () => {
    if (mode !== "drawing") return;
    if (!sel || sel.w < 0.03 || sel.h < 0.015) {
      setSel(null);
      setMode("none");
    } else setMode("pending");
  };

  const done = async () => {
    if (!sel) return;
    const c = await cropImage(data.src, sel);
    c.img = await loadImage(c.thumb);
    crop.current = c;
    setMode("ready");
  };
  const undo = () => {
    setSel(null);
    setMode("none");
    crop.current = null;
  };

  const onDragStart = (e) => {
    if (!crop.current) return e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.setData(DRAG_MIME, id);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setDragImage(crop.current.img, 24, 24);
    setDrag({ exampleId: id, exampleTitle: data.title, crop: crop.current.url, thumb: crop.current.thumb });
  };

  const hint = {
    none: "Draw a box around a section to blend it, or connect the handle to a source for a global blend.",
    drawing: "Release to finish the selection.",
    pending: "Press Done to use this section, or Undo.",
    ready: "Drag the selected section onto part of a source UI.",
  }[mode];

  return (
    <div
      className={`relative w-[300px] rounded-md border-t-[5px] border-[#b9c2e6] bg-[#e6e9f7] px-5 pb-4 pt-2 shadow-[0_2px_10px_rgba(60,60,120,0.10)] ${
        selected ? "ring-2 ring-indigo-400" : "ring-1 ring-[#d6dbf0]"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          className="nodrag min-w-0 flex-1 rounded bg-transparent px-1 text-[12px] font-medium text-[#6870a8] outline-none focus:bg-white"
          value={data.title || ""}
          onChange={(e) => m.patchNode(id, { title: e.target.value })}
        />
        <button title="Delete node" onClick={() => m.deleteNode(id)} className="nodrag rounded p-1 text-[#9aa1cf] hover:bg-white hover:text-red-500">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <h3 className="mb-2 text-center text-[15px] font-semibold text-[#3d4785]">Reference Example</h3>
      <div
        ref={boxRef}
        className="nodrag relative mx-auto w-[240px] cursor-crosshair select-none overflow-hidden rounded-md bg-white shadow-sm"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img src={data.src} draggable={false} className="pointer-events-none block w-full" />
        {sel && (
          <div
            draggable={mode === "ready"}
            onDragStart={onDragStart}
            onDragEnd={() => setTimeout(() => setDrag(null), 0)}
            className={`absolute border-2 border-dashed ${
              mode === "ready" ? "cursor-grab border-indigo-600 bg-indigo-400/20 active:cursor-grabbing" : "border-indigo-500 bg-indigo-300/20"
            }`}
            style={{ left: `${sel.x * 100}%`, top: `${sel.y * 100}%`, width: `${sel.w * 100}%`, height: `${sel.h * 100}%` }}
          >
            {mode === "ready" && (
              <span className="absolute -bottom-3 -right-3 rounded-full bg-white p-1 text-indigo-700 shadow">
                <Hand className="h-4 w-4" />
              </span>
            )}
          </div>
        )}
      </div>
      <p className="mt-2 min-h-[30px] text-center text-[11px] leading-tight text-[#6870a8]">{hint}</p>
      <div className="mt-1 flex justify-center gap-3">
        <button
          disabled={!sel || mode === "drawing"}
          onClick={undo}
          className="nodrag flex items-center gap-1 rounded bg-[#8b93c9] px-4 py-1.5 text-[13px] text-white shadow-sm hover:bg-[#7880bd] disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </button>
        <button
          disabled={mode !== "pending"}
          onClick={done}
          className="nodrag flex items-center gap-1 rounded bg-[#8b93c9] px-4 py-1.5 text-[13px] text-white shadow-sm hover:bg-[#7880bd] disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" /> Done
        </button>
      </div>
      <Handle type="source" position={Position.Right} id="out" className="misty-bar" />
    </div>
  );
}
