import { useContext, useEffect, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { LiveProvider, LivePreview, LiveContext } from "react-live";
import * as React from "react";
import { Wrench, Sparkles, Terminal, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import { useMisty } from "../context";
import { ICONS } from "../lib/icons";
import SemanticDiff from "../components/SemanticDiff";

const { useState: _s, useEffect: _e, useRef: _r, useMemo, useCallback, Fragment } = React;
const SCOPE = { React, useState: _s, useEffect: _e, useRef: _r, useMemo, useCallback, Fragment, ...ICONS };

// Reports React Live's compile/runtime error back to the node (for Fix Render).
function ErrorReporter({ onError }) {
  const { error } = useContext(LiveContext);
  useEffect(() => {
    onError(error || null);
  }, [error]);
  return error ? (
    <pre className="absolute inset-x-0 bottom-0 max-h-40 overflow-auto bg-red-50 text-red-700 text-[11px] p-2 whitespace-pre-wrap border-t border-red-200">{error}</pre>
  ) : null;
}

function cleanHtml(el) {
  const c = el.cloneNode(true);
  c.classList?.remove("misty-hover");
  let html = c.outerHTML.replace(/\s+/g, " ");
  if (html.length > 2500) html = html.slice(0, 2500) + " ...";
  return html;
}

// Source node (B and D in Figure 1): renders the UI code. Blend results also
// show Fix Render / Regenerate and the Applied Changes (semantic diff) panel.
export default function SourceNode({ id, data, selected }) {
  const { updateNodeData, openBlendDialog, runOp, fixRender, duplicateNode, openCode, codeNodeId } = useMisty();
  const frameRef = useRef(null);
  const hovered = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const isBlend = !!data.op;
  const busy = data.status === "loading" || data.status === "updating";
  const hasDiff = isBlend && data.categories;
  const panelOpen = data.panelOpen !== false;

  const setHover = (el) => {
    if (hovered.current === el) return;
    hovered.current?.classList.remove("misty-hover");
    hovered.current = el;
    el?.classList.add("misty-hover");
  };

  const onDragOver = (e) => {
    if (!e.dataTransfer.types.includes("application/x-misty-example") || busy) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
    const root = frameRef.current;
    let el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || !root.contains(el) || el === root) el = null;
    // Prefer the rendered UI's own elements, not the frame wrapper
    if (el && el.dataset?.mistyFrame) el = null;
    setHover(el);
  };
  const onDragLeave = (e) => {
    if (frameRef.current.contains(e.relatedTarget)) return;
    setHover(null);
    setDragOver(false);
  };
  const onDrop = (e) => {
    const exampleId = e.dataTransfer.getData("application/x-misty-example");
    if (!exampleId) return;
    e.preventDefault();
    e.stopPropagation();
    const el = hovered.current || frameRef.current.querySelector("[data-misty-frame] > *");
    const targetHtml = el ? cleanHtml(el) : "the whole screen";
    setHover(null);
    setDragOver(false);
    openBlendDialog({ exampleId, targetId: id, targetHtml });
  };

  return (
    <div
      className={`rounded-lg bg-violet-50 border-t-4 border-violet-300 shadow-md flex ${selected ? "ring-2 ring-violet-400" : ""} ${
        codeNodeId === id ? "outline outline-2 outline-violet-500" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="misty-handle" />
      <div className="w-[420px] flex flex-col items-center px-4 pb-4">
        <div className="text-violet-900 font-medium pt-2">Code Render</div>
        <div className="text-[11px] text-violet-500 mb-1">{data.label}</div>
        <div className="flex gap-4 text-sm text-violet-800 mb-2 h-6">
          <button className="flex items-center gap-1 hover:text-violet-600 disabled:opacity-40" disabled={busy} onClick={() => fixRender(id)} title="Ask the model to repair the rendering">
            <Wrench size={14} /> Fix Render
          </button>
          {isBlend && (
            <button className="flex items-center gap-1 hover:text-violet-600 disabled:opacity-40" disabled={busy} onClick={() => runOp(id)} title="Run the same blend again">
              <Sparkles size={14} /> Regenerate
            </button>
          )}
          <button className="flex items-center gap-1 hover:text-violet-600" onClick={() => duplicateNode(id)} title="Copy this UI into a new source node">
            <Copy size={14} /> Duplicate
          </button>
        </div>

        <div
          ref={frameRef}
          className={`relative w-[375px] h-[720px] bg-white rounded-md border shadow-sm overflow-hidden nodrag nowheel ${dragOver ? "border-violet-500 ring-2 ring-violet-300" : "border-gray-200"}`}
          style={{ transform: "translateZ(0)" }} // keeps "fixed" elements inside the phone frame
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <LiveProvider code={data.code} scope={SCOPE} enableTypeScript={false}>
            <div data-misty-frame="1" className="relative w-full h-full overflow-y-auto">
              <LivePreview Component={React.Fragment} />
            </div>
            <ErrorReporter onError={(err) => err !== (data.renderError || null) && updateNodeData(id, { renderError: err })} />
          </LiveProvider>
          {busy && (
            <div className="absolute inset-0 bg-white/75 flex flex-col items-center justify-center gap-3 text-violet-800 text-sm">
              <div className="misty-spinner" />
              {data.status === "loading" ? "Blending…" : "Updating code…"}
              <span className="text-xs text-violet-500">This takes a few seconds to a minute.</span>
            </div>
          )}
          {data.status === "error" && (
            <div className="absolute inset-x-0 top-0 bg-red-50 border-b border-red-200 text-red-700 text-xs p-2 flex justify-between gap-2">
              <span>{data.error}</span>
              <button className="font-semibold" onClick={() => updateNodeData(id, { status: "idle", error: null })}>×</button>
            </div>
          )}
        </div>

        <button
          className="mt-3 flex items-center gap-2 bg-gray-800 text-white text-sm px-4 py-2 rounded hover:bg-gray-700"
          onClick={() => openCode(codeNodeId === id ? null : id)}
        >
          <Terminal size={14} /> {codeNodeId === id ? "Hide Code" : "Show Code"}
        </button>
      </div>

      {hasDiff && (
        <div className="flex">
          <button
            className="px-1 text-violet-600 hover:bg-violet-100 self-center py-6 rounded"
            onClick={() => updateNodeData(id, { panelOpen: !panelOpen })}
            title={panelOpen ? "Collapse Applied Changes" : "Show Applied Changes"}
          >
            {panelOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          {panelOpen && <SemanticDiff id={id} data={data} busy={busy} />}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="misty-handle !bg-violet-300" isConnectable={false} />
    </div>
  );
}
