import React, { useState } from 'react';
import { SAMPLES } from '../lib/samples.js';
import { repairCode } from '../lib/repair.js';
import { compile } from '../lib/render.jsx';

// Add a work-in-progress UI: paste React + Tailwind code, upload a file, or pick a sample.
export default function AddSourceDialog({ onClose, onAdd }) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState(null);

  const add = () => {
    const fixed = repairCode(code);
    const { error } = compile(fixed);
    if (error) return setErr(String(error.message || error));
    onAdd(fixed, title.trim());
  };
  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCode(await f.text());
    if (!title) setTitle(f.name);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onMouseDown={onClose}>
      <div className="w-[620px] max-w-[92vw] rounded-xl bg-white shadow-2xl p-5" onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-lg font-semibold text-[#3f3470]">Add a source UI</div>
        <p className="text-xs text-gray-600 mt-1">
          A React component using Tailwind classes, written as <code className="bg-gray-100 px-1">{'() => { return (<div>…</div>); }'}</code>.
          Imports and exports are removed. Lucide icons (e.g. <code>{'<Heart />'}</code>) and images in <code>/stock/</code> are available.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {SAMPLES.map((s) => (
            <button key={s.name} className="rounded-md bg-[#ece7f8] hover:bg-[#ded6f4] text-[#3f3470] text-xs px-3 py-1.5"
              onClick={() => { setCode(s.code); setTitle(s.name); setErr(null); }}>
              Sample: {s.name}
            </button>
          ))}
          <label className="rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-1.5 cursor-pointer">
            Upload .jsx / .tsx / .js
            <input type="file" accept=".jsx,.tsx,.js,.ts,.txt" className="hidden" onChange={upload} />
          </label>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name (optional)"
          className="w-full mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
        <textarea value={code} onChange={(e) => { setCode(e.target.value); setErr(null); }} spellCheck={false}
          placeholder={'() => {\n  return (\n    <div className="p-4">Hello</div>\n  );\n}'}
          className="w-full h-72 mt-2 rounded-md border border-gray-300 p-3 font-mono text-xs" />
        {err && <div className="text-xs text-red-600 mt-1 font-mono whitespace-pre-wrap">{err}</div>}
        <div className="flex justify-end gap-2 mt-3">
          <button className="rounded-md px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" onClick={onClose}>Cancel</button>
          <button className="rounded-md px-4 py-2 text-sm bg-[#4b3f86] text-white disabled:opacity-50" disabled={!code.trim()} onClick={add}>Add to canvas</button>
        </div>
      </div>
    </div>
  );
}
