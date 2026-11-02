import React, { useRef, useState } from 'react';
import { ImagePlus, FileCode2, Trash2, HelpCircle, X } from 'lucide-react';

export default function Toolbar({ health, onAddExamples, onAddSource, onClear }) {
  const fileRef = useRef(null);
  const [help, setHelp] = useState(() => {
    try { return localStorage.getItem('misty-help-closed') !== '1'; } catch { return true; }
  });
  const closeHelp = () => {
    setHelp(false);
    try { localStorage.setItem('misty-help-closed', '1'); } catch { /* ignore */ }
  };

  const status = health == null
    ? { color: 'bg-gray-400', text: 'Checking LLM bridge…' }
    : health.ok
      ? { color: 'bg-emerald-500', text: `LLM bridge: ${health.backend || 'connected'}${health.model ? ` (${health.model})` : ''}` }
      : { color: 'bg-red-500', text: 'LLM bridge not running: python3 llm-bridge/bridge.py claude' };

  return (
    <>
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-xl bg-white/95 shadow-md border border-[#e2ddf3] px-3 py-2">
        <div className="mr-2">
          <div className="text-[17px] font-bold text-[#4b3f86] leading-none">Misty</div>
          <div className="text-[10px] text-gray-500">Mixing Interfaces by Semantic Transformation</div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { onAddExamples(e.target.files); e.target.value = ''; }} />
        <button className="flex items-center gap-1.5 rounded-md bg-[#e3e9f7] hover:bg-[#d3ddf3] text-[#2b4a7a] text-[13px] px-3 py-1.5" onClick={() => fileRef.current.click()}>
          <ImagePlus size={15} /> Add example
        </button>
        <button className="flex items-center gap-1.5 rounded-md bg-[#ece7f8] hover:bg-[#ded6f4] text-[#3f3470] text-[13px] px-3 py-1.5" onClick={onAddSource}>
          <FileCode2 size={15} /> Add source UI
        </button>
        <button className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" onClick={() => setHelp((h) => !h)} title="How to use Misty"><HelpCircle size={16} /></button>
        <button className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100" onClick={onClear} title="Clear canvas"><Trash2 size={16} /></button>
        <div className="flex items-center gap-1.5 ml-2 text-[11px] text-gray-600 max-w-[260px]" title={status.text}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${status.color}`} />
          <span className="truncate">{status.text}</span>
        </div>
      </div>

      {help && (
        <div className="absolute top-20 left-3 z-10 w-[330px] rounded-xl bg-white/95 shadow-md border border-[#e2ddf3] p-4 text-[12.5px] text-gray-700 leading-relaxed">
          <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-700" onClick={closeHelp}><X size={15} /></button>
          <div className="font-semibold text-[#4b3f86] mb-1.5">Blend examples into your UI</div>
          <ol className="list-decimal ml-4 space-y-1">
            <li><b>Add example</b> screenshots or photos of hand-drawn sketches (or paste / drop images on the canvas).</li>
            <li><b>Global blend:</b> drag from the blue ● on an example to a source UI.</li>
            <li><b>Drag-and-drop blend:</b> <i>Select region</i> on an example, then drag it onto part of a source UI and pick Color, Layout, Content or Customize.</li>
            <li>Each blend makes a new node. Toggle the <b>Applied Changes</b> to keep or revert them; expand one to adjust single classes.</li>
            <li><b>Show Code</b> opens the live editor. <b>Fix Render</b> repairs broken code; <b>Regenerate</b> reruns the blend.</li>
          </ol>
          <div className="mt-2 text-[11px] text-gray-500">Pan with drag, zoom with the wheel. Delete a node with Backspace.</div>
        </div>
      )}
    </>
  );
}
