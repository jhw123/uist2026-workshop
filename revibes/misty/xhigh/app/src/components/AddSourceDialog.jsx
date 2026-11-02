import { useState } from "react";
import { Upload } from "lucide-react";
import { Modal } from "./ui.jsx";
import { SAMPLE_SOURCES } from "../lib/samples.js";

// Add a source node: paste or upload React + Tailwind code for a single screen.
export default function AddSourceDialog({ onAdd, onClose }) {
  const [title, setTitle] = useState("My UI");
  const [code, setCode] = useState("");

  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCode(await f.text());
    setTitle(f.name.replace(/\.\w+$/, ""));
  };

  return (
    <Modal onClose={onClose} className="w-[640px] max-w-[95vw] rounded-xl bg-white p-6 shadow-2xl">
      <h2 className="text-lg font-semibold text-[#2d2b3a]">Add your work-in-progress UI</h2>
      <p className="mt-1 text-sm text-gray-600">
        Paste a React component styled with Tailwind CSS, e.g. <code className="rounded bg-gray-100 px-1">{"() => { return (<div className=\"p-4\">…</div>) }"}</code>.
        Imports and <code className="rounded bg-gray-100 px-1">export default</code> are removed automatically. Icons can come from lucide-react.
      </p>
      <div className="mt-4 flex gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Name" />
        <label className="flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          <Upload className="h-4 w-4" /> Upload file
          <input type="file" accept=".jsx,.js,.tsx,.ts,.txt" className="hidden" onChange={upload} />
        </label>
      </div>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        className="mt-3 h-72 w-full rounded-md border border-gray-300 bg-gray-50 p-3 font-mono text-xs"
        placeholder="() => {&#10;  return (&#10;    <div className=&quot;min-h-full bg-white p-4&quot;>…</div>&#10;  );&#10;}"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        Or start from:
        {SAMPLE_SOURCES.map((s) => (
          <button key={s.title} onClick={() => { setTitle(s.title); setCode(s.code); }} className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700 hover:bg-violet-100">
            {s.title}
          </button>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Cancel</button>
        <button
          disabled={!code.trim()}
          onClick={() => onAdd({ title: title.trim() || "My UI", code })}
          className="rounded-md bg-[#2d2b3a] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Add source node
        </button>
      </div>
    </Modal>
  );
}
