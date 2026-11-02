import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, RotateCcw, ArrowRight } from "lucide-react";
import { useMisty } from "../lib/context.js";
import { Toggle } from "./ui.jsx";

// "Applied Changes" (Figure 1 D): the semantic diff of a blend. Each category can
// be switched on or off (coarse control, one model call); inside a category the
// Tailwind classes it changed can be edited, e.g. picking another color
// (fine-grained control, swapped in the code directly).

const HUES = ["slate", "gray", "zinc", "stone", "red", "orange", "amber", "yellow", "lime", "green", "emerald",
  "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"];
const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
const COLOR_RE = new RegExp(
  `^((?:[\\w-]+:)*)(bg|text|border|from|via|to|ring|fill|stroke|divide|outline|decoration|accent|placeholder|caret|shadow)-(?:(${HUES.join("|")})-(\\d{2,3})|(white|black))(\\/\\d+)?$`
);

export function splitCategory(category) {
  const s = String(category || "Change");
  const i = s.indexOf(":");
  if (i < 0) return { kind: "Change", label: s };
  return { kind: s.slice(0, i).trim(), label: s.slice(i + 1).trim() };
}

function ColorGrid({ token, onPick, onClose }) {
  const m = token.match(COLOR_RE);
  const [, variants, prop, , , , alpha = ""] = m;
  const pick = (c) => onPick(`${variants}${prop}-${c}${alpha}`);
  return (
    <div className="absolute right-0 top-6 z-20 rounded-lg border border-gray-200 bg-white p-2 shadow-xl" onMouseLeave={onClose}>
      <div className="mb-1 flex gap-1">
        {["white", "black"].map((c) => (
          <button key={c} title={c} onClick={() => pick(c)} className={`h-3.5 w-3.5 rounded-sm border border-gray-300 bg-${c}`} />
        ))}
      </div>
      {HUES.map((h) => (
        <div key={h} className="flex gap-[2px]">
          {SHADES.map((s) => (
            <button key={s} title={`${h}-${s}`} onClick={() => pick(`${h}-${s}`)} className={`mb-[2px] h-3.5 w-3.5 rounded-sm bg-${h}-${s} hover:scale-125`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ClassToken({ token, editable, onReplace }) {
  const [open, setOpen] = useState(false);
  const m = token.match(COLOR_RE);
  const color = m ? (m[5] || `${m[3]}-${m[4]}`) : null;
  return (
    <span className="relative inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-800 ring-1 ring-gray-200">
      {color && (
        <button
          disabled={!editable}
          title={editable ? "Pick another color" : ""}
          onClick={() => setOpen((o) => !o)}
          className={`h-3 w-3 rounded-sm ring-1 ring-black/10 bg-${color}`}
        />
      )}
      {token}
      {open && <ColorGrid token={token} onClose={() => setOpen(false)} onPick={(t) => { setOpen(false); onReplace(t); }} />}
    </span>
  );
}

function ChangeRow({ change, editable, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(change.after || "");
  const tokens = String(change.after || "").split(/\s+/).filter(Boolean);
  const commit = (value) => {
    setEditing(false);
    if (value.trim() && value.trim() !== change.after) onEdit(value.trim());
  };
  return (
    <li className="rounded-md bg-[#f6f5fc] px-2 py-1.5 text-[11px]">
      <div className="flex items-center gap-1 text-gray-500">
        <span className="rounded bg-violet-100 px-1 text-[10px] uppercase tracking-wide text-violet-700">{change.type || "class"}</span>
        <span className="truncate font-mono line-through decoration-gray-400">{change.before || "(added)"}</span>
        <ArrowRight className="h-3 w-3 shrink-0" />
      </div>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(draft); if (e.key === "Escape") setEditing(false); }}
          className="mt-1 w-full rounded border border-violet-300 bg-white px-1.5 py-0.5 font-mono text-[11px] outline-none"
        />
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {tokens.map((t, i) => (
            <ClassToken
              key={t + i}
              token={t}
              editable={editable}
              onReplace={(nt) => onEdit(tokens.map((x, k) => (k === i ? nt : x)).join(" "))}
            />
          ))}
          {editable && (
            <button onClick={() => { setDraft(change.after || ""); setEditing(true); }} className="text-[10px] text-violet-600 hover:underline">
              edit
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CategoryRow({ id, index, cat, busy }) {
  const m = useMisty();
  const [open, setOpen] = useState(false);
  const { kind, label } = splitCategory(cat.category);
  const changes = cat.changes || [];
  return (
    <div>
      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-500">{kind}</div>
      <div className="mt-1 flex items-start gap-3">
        <p className={`flex-1 text-[15px] font-medium leading-snug ${cat.enabled ? "text-[#4b3fa0]" : "text-gray-400"}`}>{label}</p>
        <div className="flex items-center gap-2 pt-0.5">
          <Toggle on={cat.enabled} disabled={!!busy} onChange={() => m.toggleCategory(id, index)} />
          <span className="w-6 text-[13px] text-gray-700">{cat.enabled ? "On" : "Off"}</span>
        </div>
      </div>
      {changes.length > 0 && (
        <button onClick={() => setOpen((o) => !o)} className="mt-1 flex items-center gap-1 text-[12px] text-gray-500 hover:text-violet-700">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {changes.length} class change{changes.length > 1 ? "s" : ""}
        </button>
      )}
      {open && (
        <ul className="mt-1 space-y-1">
          {changes.map((ch, j) => (
            <ChangeRow
              key={j}
              change={ch}
              editable={cat.enabled && !busy}
              onEdit={(after) => m.editChange(id, index, j, after)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SemanticDiffPanel({ id, blend, busy, open, setOpen }) {
  const m = useMisty();
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Show applied changes"
        className="nodrag flex w-8 flex-col items-center justify-center gap-2 rounded-r-2xl text-[#5b4fa8] hover:bg-violet-100"
      >
        <ChevronLeft className="h-5 w-5" />
        <span className="text-[11px] font-medium [writing-mode:vertical-rl]">Applied Changes</span>
      </button>
    );
  }
  const cats = blend.categories || [];
  return (
    <div className="nodrag nowheel flex w-[360px] cursor-default flex-col py-3 pr-5">
      <div className="flex items-center">
        <button onClick={() => setOpen(false)} title="Hide" className="-ml-1 rounded p-1 text-[#5b4fa8] hover:bg-violet-100">
          <ChevronRight className="h-5 w-5" />
        </button>
        <h3 className="flex-1 text-center text-[16px] font-semibold text-[#3f3a7a]">Applied Changes</h3>
      </div>
      <div className="mt-2 flex justify-end">
        <button
          disabled={!!busy}
          onClick={() => m.resetAll(id)}
          className="flex items-center gap-1 text-[13px] text-[#3f3a7a] hover:text-violet-700 disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" /> Reset All
        </button>
      </div>
      <div className="mt-2 max-h-[640px] space-y-5 overflow-y-auto pl-1 pr-1">
        {cats.length === 0 && <p className="text-sm text-gray-500">The model did not report categorized changes for this blend.</p>}
        {cats.map((c, i) => (
          <CategoryRow key={i} id={id} index={i} cat={c} busy={busy} />
        ))}
      </div>
      {(blend.designExplanation || blend.differences) && (
        <details className="mt-4 rounded-md bg-white/60 p-2 text-[12px] text-gray-600">
          <summary className="cursor-pointer select-none font-medium text-gray-700">Blend notes from the model</summary>
          {blend.designExplanation && <p className="mt-1"><b>Reference design:</b> {String(blend.designExplanation)}</p>}
          {blend.differences && <p className="mt-1"><b>Differences:</b> {typeof blend.differences === "string" ? blend.differences : JSON.stringify(blend.differences)}</p>}
        </details>
      )}
    </div>
  );
}
