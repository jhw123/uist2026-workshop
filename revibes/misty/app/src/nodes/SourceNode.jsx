import React, { useCallback } from "react";
import { Handle, Position } from "@xyflow/react";
import { Wrench, Sparkles, SquareTerminal, X, Loader2, AlertTriangle } from "lucide-react";
import { useMisty } from "../context.js";
import Preview from "../components/Preview.jsx";
import AppliedChanges from "../components/AppliedChanges.jsx";

/**
 * Source node (B and D in Figure 1): renders React + Tailwind code. Example sections can be
 * dropped onto it (localized blending); an example node can be connected to it (global
 * blending). Blending outputs also show the semantic diff ("Applied Changes").
 */
export default function SourceNode({ id, data, selected }) {
  const misty = useMisty();
  const isOutput = !!data.origin;
  const loading = data.status === "loading";
  const busy = loading || data.status === "updating";
  const dragActive = !!misty.drag;
  const onError = useCallback((err) => misty.reportRenderError(id, err ? String(err) : null), [id, misty.reportRenderError]);
  const renderError = misty.renderErrors[id];
  const editing = misty.editorNodeId === id;

  return (
    <div
      className={`flex rounded-xl border bg-violet-100/90 shadow-lg ${
        selected || editing ? "border-violet-500 ring-2 ring-violet-300" : "border-violet-200"
      } ${dragActive && !busy ? "ring-2 ring-violet-400/60" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="misty-handle-in" title="Drop a connection here for global blending" />
      <div className="flex flex-col items-center px-4 pb-4 pt-2" style={{ width: 375 + 32 }}>
        <div className="flex w-full items-center">
          <div className="w-5" />
          <div className="flex-1 text-center">
            <div className="text-[15px] font-medium text-violet-950">Code Render</div>
            <div className="text-[11px] text-violet-700/70 truncate" title={data.subtitle}>
              {data.title}
              {data.subtitle ? ` · ${data.subtitle}` : ""}
            </div>
          </div>
          <button className="nodrag p-1 text-violet-400 hover:text-red-600" title="Delete this node" onClick={() => misty.deleteNode(id)}>
            <X size={14} />
          </button>
        </div>
        <div className="my-2 flex items-center gap-5 text-[13px] text-gray-700">
          <button
            className={`nodrag flex items-center gap-1 hover:text-violet-800 disabled:opacity-40 ${renderError ? "text-red-600 font-medium animate-pulse" : ""}`}
            onClick={() => misty.fixRender(id)}
            disabled={busy}
            title="Repair the code (heuristics first, then the model)"
          >
            <Wrench size={14} /> Fix Render
          </button>
          <button
            className="nodrag flex items-center gap-1 hover:text-violet-800 disabled:opacity-40"
            onClick={() => misty.regenerate(id)}
            disabled={busy || !isOutput}
            title={isOutput ? "Run this blending operation again" : "Only blending outputs can be regenerated"}
          >
            <Sparkles size={14} /> Regenerate
          </button>
        </div>

        <div className="relative">
          <Preview
            code={data.code}
            onError={onError}
            dragActive={dragActive && !busy}
            dimmed={loading}
            onDropTarget={(target) => misty.onDropOnSource(id, target)}
          />
          {loading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <Loader2 className="animate-spin text-violet-700" size={28} />
              <div className="text-sm font-medium text-violet-900">{data.loadingText || "Blending…"}</div>
              <div className="text-[11px] text-violet-800/70">The model call can take 20–60 seconds.</div>
            </div>
          )}
          {data.status === "error" && (
            <div className="absolute inset-x-3 bottom-3 z-30 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700 shadow">
              <div className="flex items-center gap-1 font-semibold">
                <AlertTriangle size={13} /> {data.errorTitle || "Blending failed"}
              </div>
              <div className="mt-1 break-words">{data.error}</div>
              {isOutput && (
                <button className="nodrag mt-1 underline" onClick={() => misty.regenerate(id)}>
                  Try again
                </button>
              )}
            </div>
          )}
        </div>

        <button
          className="nodrag mt-4 flex items-center gap-1.5 rounded-md bg-gray-800 px-4 py-2 text-[13px] text-white hover:bg-gray-900"
          onClick={() => misty.openEditor(id)}
        >
          <SquareTerminal size={14} /> {editing ? "Editing code" : "Show Code"}
        </button>
      </div>
      {isOutput && <AppliedChanges node={{ id, data }} />}
      <Handle type="source" position={Position.Right} className="misty-handle-hidden" isConnectable={false} />
    </div>
  );
}
