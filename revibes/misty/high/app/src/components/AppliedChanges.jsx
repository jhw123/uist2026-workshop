import React, { useState } from "react";
import { RotateCcw, ChevronDown, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { useMisty } from "../context.js";

function Toggle({ on, onChange, disabled, small }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`nodrag flex items-center gap-1.5 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      aria-pressed={on}
    >
      <span
        className={`relative inline-block rounded-full transition-colors ${on ? "bg-violet-600" : "bg-gray-300"} ${small ? "h-4 w-7" : "h-5 w-9"}`}
      >
        <span
          className={`absolute top-0.5 rounded-full bg-white shadow transition-all ${small ? "h-3 w-3" : "h-4 w-4"} ${
            on ? (small ? "left-3.5" : "left-[18px]") : "left-0.5"
          }`}
        />
      </span>
      {!small && <span className="w-6 text-left text-xs text-gray-600">{on ? "On" : "Off"}</span>}
    </button>
  );
}

function ChangeRow({ nodeId, cat, ch, busy }) {
  const misty = useMisty();
  const [val, setVal] = useState(ch.current);
  const commit = () => {
    if (val.trim() !== ch.current) misty.editChange(nodeId, cat.id, ch.id, val.trim());
  };
  return (
    <div className="flex items-center gap-2 py-1">
      <Toggle small on={ch.on && cat.on} disabled={busy || !cat.on} onChange={(v) => misty.toggleChange(nodeId, cat.id, ch.id, v)} />
      <span className="w-12 shrink-0 text-[10px] uppercase tracking-wide text-gray-400">{ch.type}</span>
      <code className="max-w-[90px] truncate rounded bg-gray-100 px-1 text-[10px] text-gray-500 line-through" title={ch.before || "(added)"}>
        {ch.before || "∅"}
      </code>
      <span className="text-gray-400 text-[10px]">→</span>
      <input
        className="nodrag min-w-0 flex-1 rounded border border-gray-200 bg-white px-1 py-0.5 font-mono text-[10px] text-violet-800 focus:border-violet-400 focus:outline-none"
        value={val}
        disabled={busy || !cat.on || !ch.on}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setVal(ch.current);
        }}
        title="Edit the Tailwind class(es) this change applies; press Enter"
      />
    </div>
  );
}

/** "Applied Changes": the semantic diff (Figure 1 D, Section 4.2.3). */
export default function AppliedChanges({ node }) {
  const misty = useMisty();
  const { id, data } = node;
  const busy = data.status === "loading" || data.status === "updating";
  const cats = data.categories || [];

  if (data.changesCollapsed) {
    return (
      <button
        className="nodrag flex w-8 items-start justify-center pt-24 text-violet-700 hover:text-violet-900"
        onClick={() => misty.updateNode(id, { changesCollapsed: false })}
        title="Show applied changes"
      >
        <ChevronLeft size={20} />
      </button>
    );
  }

  return (
    <div className="flex w-[360px] shrink-0">
      <button
        className="nodrag flex w-6 items-center justify-center text-violet-700 hover:text-violet-900"
        onClick={() => misty.updateNode(id, { changesCollapsed: true })}
        title="Collapse applied changes"
      >
        <ChevronRight size={20} />
      </button>
      <div className="flex-1 pr-3">
        <div className="text-center text-[15px] font-medium text-violet-950">Applied Changes</div>
        <div className="mt-2 flex items-center justify-end gap-2">
          {data.status === "updating" && (
            <span className="flex items-center gap-1 text-[11px] text-violet-700">
              <Loader2 size={12} className="animate-spin" /> Updating code…
            </span>
          )}
          <button
            className="nodrag flex items-center gap-1 text-xs text-gray-700 hover:text-violet-800 disabled:opacity-40"
            onClick={() => misty.resetAll(id)}
            disabled={busy}
            title="Turn every change back on (the blending output as generated)"
          >
            <RotateCcw size={13} /> Reset All
          </button>
        </div>
        {data.designExplanation && (
          <p className="mt-2 rounded-md bg-white/60 p-2 text-[11px] leading-snug text-gray-600" title="The model's reading of the reference image">
            <span className="font-medium text-gray-700">Reference: </span>
            {data.designExplanation}
          </p>
        )}
        <div className="mt-2 space-y-3">
          {cats.length === 0 && data.status !== "loading" && (
            <p className="text-xs text-gray-500">The model did not report categorised changes for this blend.</p>
          )}
          {cats.map((c) => (
            <div key={c.id}>
              <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{c.kind}</div>
              <div className="flex items-start gap-2">
                <button
                  className="nodrag mt-0.5 text-gray-400 hover:text-violet-700"
                  onClick={() => misty.setCategoryOpen(id, c.id, !c.open)}
                  title={c.open ? "Hide individual changes" : "Show individual changes"}
                >
                  {c.open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className={`flex-1 text-[14px] font-medium leading-snug ${c.on ? "text-violet-800" : "text-gray-400 line-through"}`}>
                  {c.label}
                </div>
                <Toggle on={c.on} disabled={busy} onChange={(v) => misty.toggleCategory(id, c.id, v)} />
              </div>
              {c.open && (
                <div className="ml-5 mt-1 rounded-md bg-white/70 px-2 py-1">
                  {c.changes.length === 0 && <div className="text-[11px] text-gray-400">No class-level changes listed.</div>}
                  {c.changes.map((ch) => (
                    <ChangeRow key={ch.id + ch.current} nodeId={id} cat={c} ch={ch} busy={busy} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
