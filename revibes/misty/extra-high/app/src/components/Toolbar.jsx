import { useEffect, useRef, useState } from "react";
import { ImagePlus, Code2, LayoutTemplate, RotateCcw, CircleHelp, SquareTerminal } from "lucide-react";
import { bridgeHealth } from "../lib/llm.js";
import { SAMPLE_EXAMPLES, SAMPLE_SOURCES } from "../lib/samples.js";

function BridgeStatus() {
  const [h, setH] = useState(null);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const r = await bridgeHealth();
      if (alive) setH(r);
    };
    check();
    const t = setInterval(check, 10000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!h) return null;
  return h.ok ? (
    <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800 ring-1 ring-emerald-200" title="Paper: GPT-4o. Here the workshop's LLM bridge answers with the model of the coding agent it runs on.">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      Model: {h.model} via {h.backend} bridge <span className="text-emerald-600">(substitute for GPT-4o)</span>
    </div>
  ) : (
    <div className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs text-red-700 ring-1 ring-red-200">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      LLM bridge offline: run <code className="font-mono">python3 llm-bridge/bridge.py claude</code>
    </div>
  );
}

export default function Toolbar({ onUpload, onAddSource, onAddSampleExample, onAddSampleSource, onReset, onHelp, codeOpen, onToggleCode }) {
  const fileRef = useRef(null);
  const [menu, setMenu] = useState(false);
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-[#e0dbf3] bg-white px-4">
      <div className="mr-2 leading-tight">
        <div className="text-[17px] font-bold tracking-tight text-[#3f3a7a]">Misty</div>
        <div className="text-[10px] text-[#9a93c9]">UI prototyping through conceptual blending · revibe</div>
      </div>
      <button onClick={() => fileRef.current.click()} className="flex items-center gap-1.5 rounded-md bg-[#efecf9] px-3 py-1.5 text-sm text-[#3f3a7a] hover:bg-[#e3def6]">
        <ImagePlus className="h-4 w-4" /> Add example image
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { onUpload([...e.target.files]); e.target.value = ""; }}
      />
      <button onClick={onAddSource} className="flex items-center gap-1.5 rounded-md bg-[#efecf9] px-3 py-1.5 text-sm text-[#3f3a7a] hover:bg-[#e3def6]">
        <Code2 className="h-4 w-4" /> Add source code
      </button>
      <div className="relative">
        <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[#3f3a7a] hover:bg-[#efecf9]">
          <LayoutTemplate className="h-4 w-4" /> Samples
        </button>
        {menu && (
          <div className="absolute left-0 top-10 w-64 rounded-lg border border-gray-200 bg-white p-2 text-sm shadow-xl" onMouseLeave={() => setMenu(false)}>
            <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Example images</div>
            {SAMPLE_EXAMPLES.map((s) => (
              <button key={s.src} onClick={() => { setMenu(false); onAddSampleExample(s); }} className="block w-full rounded px-2 py-1.5 text-left hover:bg-violet-50">{s.title}</button>
            ))}
            <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Source UIs</div>
            {SAMPLE_SOURCES.map((s) => (
              <button key={s.title} onClick={() => { setMenu(false); onAddSampleSource(s); }} className="block w-full rounded px-2 py-1.5 text-left hover:bg-violet-50">{s.title}</button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onReset} title="Start over with the demo canvas" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[#3f3a7a] hover:bg-[#efecf9]">
        <RotateCcw className="h-4 w-4" /> New canvas
      </button>
      <button onClick={onHelp} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-[#3f3a7a] hover:bg-[#efecf9]">
        <CircleHelp className="h-4 w-4" /> How to use
      </button>
      <div className="flex-1" />
      <BridgeStatus />
      <button
        onClick={onToggleCode}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${codeOpen ? "bg-[#2d2b3a] text-white" : "bg-[#efecf9] text-[#3f3a7a] hover:bg-[#e3def6]"}`}
      >
        <SquareTerminal className="h-4 w-4" /> Code editor
      </button>
    </header>
  );
}
