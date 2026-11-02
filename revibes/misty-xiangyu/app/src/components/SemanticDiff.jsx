import { useState } from "react";
import { RotateCcw, ChevronDown, ChevronRight as ChevronR } from "lucide-react";
import { useMisty } from "../context";

function Switch({ on, onChange, disabled }) {
  return (
    <button
      className="flex items-center gap-2 text-sm text-gray-700 disabled:opacity-50 shrink-0"
      onClick={() => onChange(!on)}
      disabled={disabled}
    >
      <span className={`relative w-10 h-6 rounded-full transition-colors ${on ? "bg-violet-600" : "bg-gray-300"}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-5" : "left-1"}`} />
      </span>
      <span className="w-6">{on ? "On" : "Off"}</span>
    </button>
  );
}

function splitCategory(text) {
  const i = text.indexOf(":");
  return i > 0 && i < 30 ? [text.slice(0, i).trim(), text.slice(i + 1).trim()] : ["Change", text];
}

// Applied Changes panel (D in Figure 1, section 4.2.3): semantic diff with a
// coarse toggle per category and, expanded, fine-grained control per change.
export default function SemanticDiff({ id, data, busy }) {
  const { applyDiff, resetDiff } = useMisty();
  const [open, setOpen] = useState({});
  const [edits, setEdits] = useState({}); // changeId -> edited "after" value, not yet applied
  const [showReading, setShowReading] = useState(false);
  const cats = data.categories || [];

  const setCat = (ci, enabled) =>
    applyDiff(id, cats.map((c, i) => (i === ci ? { ...c, enabled, changes: c.changes.map((x) => ({ ...x, enabled })) } : c)));

  const setChange = (ci, xi, enabled) =>
    applyDiff(
      id,
      cats.map((c, i) => {
        if (i !== ci) return c;
        const changes = c.changes.map((x, j) => (j === xi ? { ...x, enabled } : x));
        return { ...c, changes, enabled: changes.some((x) => x.enabled !== false) };
      })
    );

  const pending = Object.keys(edits).length > 0;
  const applyEdits = () => {
    applyDiff(
      id,
      cats.map((c) => ({ ...c, changes: c.changes.map((x) => (x.id in edits ? { ...x, editedAfter: edits[x.id] } : x)) }))
    );
    setEdits({});
  };

  return (
    <div className="w-[400px] px-4 pb-4 pt-2 nodrag nowheel cursor-default">
      <div className="text-center text-violet-900 font-medium">Applied Changes</div>
      <div className="flex justify-end mt-2 mb-3">
        <button className="flex items-center gap-1 text-sm text-violet-800 hover:text-violet-600 disabled:opacity-40" disabled={busy} onClick={() => { setEdits({}); resetDiff(id); }}>
          <RotateCcw size={14} /> Reset All
        </button>
      </div>
      {cats.length === 0 && <p className="text-sm text-gray-500">The model did not list its changes for this blend.</p>}
      <div className="max-h-[640px] overflow-y-auto pr-1 flex flex-col gap-4">
        {cats.map((c, ci) => {
          const [kind, text] = splitCategory(c.category);
          return (
            <div key={c.id}>
              <div className="text-xs font-semibold tracking-wider text-gray-500 uppercase">{kind}</div>
              <div className="flex items-start justify-between gap-3">
                <button className="flex items-start gap-1 text-left text-violet-900 font-medium text-[15px]" onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} title="Show the individual changes">
                  <span className="mt-1 text-violet-400">{open[c.id] ? <ChevronDown size={14} /> : <ChevronR size={14} />}</span>
                  {text}
                </button>
                <Switch on={c.enabled} disabled={busy} onChange={(v) => setCat(ci, v)} />
              </div>
              {open[c.id] && (
                <div className="ml-5 mt-2 flex flex-col gap-1.5">
                  {c.changes.length === 0 && <span className="text-xs text-gray-400">No class-level details.</span>}
                  {c.changes.map((x, xi) => (
                    <label key={x.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" disabled={busy} checked={c.enabled && x.enabled !== false} onChange={(e) => setChange(ci, xi, e.target.checked)} />
                      <span className="text-gray-400 w-12 shrink-0">{x.type}</span>
                      <code className="text-red-700 line-through truncate max-w-[90px]" title={x.before}>{x.before || "∅"}</code>
                      <span className="text-gray-400">→</span>
                      <input
                        className="flex-1 min-w-0 border border-gray-200 rounded px-1 py-0.5 font-mono text-green-800 bg-white"
                        value={edits[x.id] ?? x.editedAfter ?? x.after}
                        onChange={(e) => setEdits((ed) => ({ ...ed, [x.id]: e.target.value }))}
                        title="Edit the value, then press Apply edits"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {pending && (
        <button className="mt-4 w-full bg-violet-600 text-white text-sm py-1.5 rounded hover:bg-violet-700 disabled:opacity-50" disabled={busy} onClick={applyEdits}>
          Apply edits
        </button>
      )}
      {(data.designExplanation || data.differences) && (
        <div className="mt-5 border-t border-violet-200 pt-2">
          <button className="text-xs text-violet-700 flex items-center gap-1" onClick={() => setShowReading((v) => !v)}>
            {showReading ? <ChevronDown size={12} /> : <ChevronR size={12} />} How the model read the reference
          </button>
          {showReading && (
            <div className="text-xs text-gray-600 mt-1 space-y-1">
              {data.designExplanation && <p><b>Design:</b> {data.designExplanation}</p>}
              {data.differences && <p><b>Differences:</b> {data.differences}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
