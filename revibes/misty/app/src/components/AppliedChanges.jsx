import React, { useState } from 'react';
import { RotateCcw, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { useMisty } from '../lib/context.js';
import { hasClasses, replaceClasses } from '../lib/classes.js';

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      className={`nodrag relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-[#2f2f35]' : 'bg-gray-300'} disabled:opacity-40`}
      onClick={() => onChange(!on)} disabled={disabled} role="switch" aria-checked={on}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

// "Color: Changed light to dark theme" -> ["COLOR", "Changed light to dark theme"]
function split(category) {
  const m = String(category || '').match(/^\s*([^:]{1,30}):\s*(.*)$/);
  return m ? [m[1].trim().toUpperCase(), m[2].trim()] : ['CHANGE', String(category || '')];
}

export default function AppliedChanges({ id, data }) {
  const { applyCategories, resetAll, patch } = useMisty();
  const [open, setOpen] = useState({});
  const [showNotes, setShowNotes] = useState(false);
  const cats = data.result?.categorizedChanges || [];
  const catOn = data.catOn || cats.map(() => true);
  const fine = data.fine || {};
  const busy = !!data.loading;

  // Fine-grained control: switch a single class change, or edit its value.
  const setFine = (key, change, next) => {
    const cur = fine[key] || { on: true, after: change.after };
    let code = data.code;
    const live = cur.on ? cur.after : change.before;
    const target = next.on ? next.after : change.before;
    if (live && live.trim()) code = replaceClasses(code, live, target);
    patch(id, { code, fine: { ...fine, [key]: next } });
  };

  return (
    <div className="w-[330px] px-4 py-3 nodrag nowheel cursor-default">
      <div className="text-[15px] font-semibold text-[#3f3470] text-center">Applied Changes</div>
      <div className="flex justify-end mt-1 mb-2">
        <button className="flex items-center gap-1 text-[12px] text-[#4b3f86] hover:text-black disabled:opacity-40" onClick={() => resetAll(id)} disabled={busy}>
          <RotateCcw size={13} /> Reset All
        </button>
      </div>

      {cats.length === 0 && <div className="text-xs text-gray-500">The model did not list any changes for this blend.</div>}

      <div className="space-y-3 max-h-[620px] overflow-auto pr-1">
        {cats.map((c, i) => {
          const [kind, text] = split(c.category);
          const isOpen = open[i];
          return (
            <div key={i}>
              <div className="text-[11px] tracking-wider font-semibold text-gray-500">{kind}</div>
              <div className="flex items-start gap-2">
                <button className="flex-1 text-left text-[13px] font-medium text-[#3b2f7a] leading-snug flex gap-1" onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                  title="Show the individual changes">
                  {isOpen ? <ChevronDown size={14} className="mt-0.5 shrink-0" /> : <ChevronRight size={14} className="mt-0.5 shrink-0" />}
                  <span>{text}</span>
                </button>
                <Toggle on={catOn[i]} disabled={busy} onChange={(v) => applyCategories(id, catOn.map((b, j) => (j === i ? v : b)))} />
                <span className="text-[11px] w-6 text-gray-600 mt-1">{catOn[i] ? 'On' : 'Off'}</span>
              </div>
              {isOpen && (
                <div className="mt-1.5 ml-4 space-y-1">
                  {(c.changes || []).length === 0 && <div className="text-[11px] text-gray-500">No class-level details.</div>}
                  {(c.changes || []).map((ch, j) => {
                    const key = `${i}-${j}`;
                    const st = fine[key] || { on: true, after: ch.after || '' };
                    const live = st.on ? st.after : ch.before;
                    const found = catOn[i] && live && hasClasses(data.code, live);
                    return (
                      <div key={j} className="flex items-center gap-1.5 text-[11px]">
                        <input type="checkbox" checked={st.on} disabled={!found || busy} className="accent-[#4b3f86]"
                          title={found ? 'Apply this change' : 'This class is not in the current code'}
                          onChange={(e) => setFine(key, ch, { ...st, on: e.target.checked })} />
                        <span className="text-gray-400 w-10 shrink-0 truncate">{ch.type}</span>
                        <code className="text-gray-500 line-through truncate max-w-[80px]" title={ch.before}>{ch.before || '∅'}</code>
                        <span className="text-gray-400">→</span>
                        <input
                          className="flex-1 min-w-0 font-mono rounded border border-gray-200 px-1 py-0.5 bg-white disabled:bg-gray-50"
                          defaultValue={st.after} key={st.after} disabled={!st.on || !found || busy}
                          title="Edit the class and press Enter"
                          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== st.after) setFine(key, ch, { ...st, after: v }); }}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(data.result?.designExplanation || data.result?.differences) && (
        <div className="mt-4 border-t border-[#d8d0ef] pt-2">
          <button className="flex items-center gap-1 text-[12px] text-[#4b3f86]" onClick={() => setShowNotes((s) => !s)}>
            <Info size={13} /> {showNotes ? 'Hide' : 'Show'} the model's reading of the example
          </button>
          {showNotes && (
            <div className="mt-2 space-y-2 text-[12px] text-gray-700 select-text">
              {data.result.designExplanation && <p><b>Design:</b> {data.result.designExplanation}</p>}
              {data.result.differences && <p><b>Differences:</b> {typeof data.result.differences === 'string' ? data.result.differences : JSON.stringify(data.result.differences)}</p>}
            </div>
          )}
        </div>
      )}
      {data.blend?.image && (
        <div className="mt-3 border-t border-[#d8d0ef] pt-2 text-[11px] text-gray-600">
          <div className="mb-1">Blended from{data.blend.mode === 'drop' ? ` (${data.blend.aspects.join(', ')}${data.blend.custom ? `: “${data.blend.custom}”` : ''}) into ${data.blend.targetLabel}` : ' (global blend)'}:</div>
          <img src={data.blend.image} alt="" className="max-h-24 rounded border border-gray-200" />
        </div>
      )}
    </div>
  );
}
