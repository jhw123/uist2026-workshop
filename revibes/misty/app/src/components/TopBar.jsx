import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Images, FilePlus2, HelpCircle, Trash2, ChevronDown, X } from "lucide-react";
import { bridgeHealth } from "../lib/llm.js";
import { SAMPLE_SOURCES, SAMPLE_EXAMPLES } from "../lib/samples.js";
import { repairCode } from "../lib/repair.js";

function Menu({ label, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-violet-100" onClick={() => setOpen(!open)}>
        <Icon size={15} /> {label} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[60] mt-1 min-w-[220px] rounded-md border border-gray-200 bg-white py-1 shadow-xl" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}
const Item = ({ onClick, children }) => (
  <button className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-violet-50" onClick={onClick}>
    {children}
  </button>
);

function PasteCode({ onDone, onCancel }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("My UI");
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30" onMouseDown={onCancel}>
      <div className="w-[640px] rounded-lg bg-white p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center">
          <h2 className="flex-1 font-medium">New source UI from code</h2>
          <button onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <input className="mb-2 w-full rounded border px-2 py-1 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name" />
        <textarea
          className="h-72 w-full rounded border p-2 font-mono text-xs"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={"Paste React + Tailwind code, e.g.\n() => {\n  return <div className=\"p-4\">Hello</div>;\n}\n\nA named component (function App() {...}) also works; imports are removed."}
        />
        <div className="mt-2 flex justify-end gap-2">
          <button className="rounded px-3 py-1.5 text-sm hover:bg-gray-100" onClick={onCancel}>
            Cancel
          </button>
          <button className="rounded bg-violet-700 px-3 py-1.5 text-sm text-white disabled:opacity-40" disabled={!code.trim()} onClick={() => onDone(code, title)}>
            Add to canvas
          </button>
        </div>
      </div>
    </div>
  );
}

function Help({ onClose }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30" onMouseDown={onClose}>
      <div className="max-h-[80vh] w-[620px] overflow-auto rounded-lg bg-white p-5 text-sm leading-relaxed text-gray-700 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center">
          <h2 className="flex-1 text-lg font-medium text-gray-900">How to blend with Misty</h2>
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <b>Add examples</b>: upload screenshots or hand-drawn sketches (<i>Add example</i>), drop image files on the canvas, or paste an image. Each becomes a <b>Reference Example</b> node.
          </li>
          <li>
            <b>Add your UI</b>: a <b>Code Render</b> node renders React + Tailwind code. Start from a sample or paste your own.
          </li>
          <li>
            <b>Global blending</b>: drag from the handle on the right of a Reference Example onto a Code Render. Misty blends the example's visual style and layout into your content and creates a new Code Render.
          </li>
          <li>
            <b>Localized blending</b>: draw a rectangle on a Reference Example, press <i>Done</i>, then drag the selected section onto part of a Code Render. The section it would change is highlighted. On drop, pick what to blend: Color, Layout, Content (add the selected elements) or Customize (your own aspect).
          </li>
          <li>
            <b>Semantic diff</b>: each output lists its <b>Applied Changes</b> by category. Toggle a category off or on to remove or bring back that kind of change; open a category to toggle or edit single class changes. <i>Reset All</i> returns to the output as generated.
          </li>
          <li>
            <b>Refine</b>: <i>Show Code</i> opens the code editor on the right; edits render live. <i>Fix Render</i> repairs broken code, <i>Regenerate</i> runs the blend again. Blend into any node to branch and compare alternatives side by side.
          </li>
        </ol>
        <p className="mt-3 text-xs text-gray-500">
          Rebuilt from the paper for the Revibing HCI workshop. Model calls go through the workshop LLM bridge (not GPT-4o as in the paper). Stock photos are generated images. The canvas is saved in this browser.
        </p>
      </div>
    </div>
  );
}

export default function TopBar({ onAddExample, onAddSource, onOpenEditor, onReset }) {
  const fileRef = useRef(null);
  const [health, setHealth] = useState(null);
  const [paste, setPaste] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const h = await bridgeHealth();
      if (alive) setHealth(h);
    };
    check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const bridgeText = health?.ok
    ? `Model: ${health.backend || "bridge"}${health.model ? ` · ${health.model}` : ""} via LLM bridge (paper: GPT-4o)`
    : "LLM bridge not running";

  return (
    <div className="z-30 flex items-center gap-1 border-b border-violet-200 bg-white/90 px-3 py-1.5 shadow-sm">
      <div className="mr-3 flex items-baseline gap-2">
        <span className="text-lg font-semibold tracking-tight text-violet-900">Misty</span>
        <span className="hidden text-xs text-gray-500 lg:inline">UI prototyping through interactive conceptual blending</span>
      </div>
      <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-violet-100" onClick={() => fileRef.current?.click()}>
        <ImagePlus size={15} /> Add example
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          for (const f of e.target.files) await onAddExample(URL.createObjectURL(f), f.name);
          e.target.value = "";
        }}
      />
      <Menu label="Sample examples" icon={Images}>
        {SAMPLE_EXAMPLES.map((s) => (
          <Item key={s.file} onClick={() => onAddExample(s.file, s.name)}>
            {s.name}
          </Item>
        ))}
      </Menu>
      <Menu label="Add source UI" icon={FilePlus2}>
        {Object.entries(SAMPLE_SOURCES).map(([k, s]) => (
          <Item key={k} onClick={() => onAddSource(s.code, s.title)}>
            Sample: {s.title}
          </Item>
        ))}
        <div className="my-1 border-t" />
        <Item onClick={() => setPaste(true)}>Paste my own code…</Item>
      </Menu>
      <div className="flex-1" />
      <span
        className={`mr-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${health?.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
        title={health?.ok ? "Model calls go through the workshop LLM bridge" : "Start it from the repository root: python3 llm-bridge/bridge.py claude"}
      >
        <span className={`h-2 w-2 rounded-full ${health?.ok ? "bg-emerald-500" : "bg-amber-500"}`} />
        {bridgeText}
      </span>
      <button className="rounded-md p-1.5 text-gray-600 hover:bg-violet-100" title="Help" onClick={() => setHelp(true)}>
        <HelpCircle size={17} />
      </button>
      <button className="rounded-md p-1.5 text-gray-600 hover:bg-red-50 hover:text-red-700" title="Clear the canvas" onClick={onReset}>
        <Trash2 size={16} />
      </button>
      {paste && (
        <PasteCode
          onCancel={() => setPaste(false)}
          onDone={async (code, title) => {
            setPaste(false);
            const id = onAddSource(repairCode(code).code, title);
            onOpenEditor(id);
          }}
        />
      )}
      {help && <Help onClose={() => setHelp(false)} />}
    </div>
  );
}
