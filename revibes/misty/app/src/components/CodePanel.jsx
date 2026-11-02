import React, { useState } from 'react';
import { Editor } from 'react-live';
import { themes } from 'prism-react-renderer';
import { X, Copy, Download, Check } from 'lucide-react';

// Live code editor, docked to the right side of the screen (paper §4.2.2).
export default function CodePanel({ node, onChange, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.data.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };
  const download = () => {
    const blob = new Blob([`// ${node.data.title}\nconst Screen = ${node.data.code};\n\nexport default Screen;\n`], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Screen.jsx';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="w-[520px] max-w-[45vw] h-full flex flex-col bg-[#1e1e24] text-white shadow-2xl border-l border-black">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Code</div>
          <div className="text-[11px] text-gray-400 truncate">{node.data.title} · edits render live</div>
        </div>
        <button className="p-1.5 rounded hover:bg-white/10" onClick={copy} title="Copy code">{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        <button className="p-1.5 rounded hover:bg-white/10" onClick={download} title="Download as Screen.jsx"><Download size={16} /></button>
        <button className="p-1.5 rounded hover:bg-white/10" onClick={onClose} title="Collapse"><X size={16} /></button>
      </div>
      <div className="flex-1 overflow-auto text-[12.5px]">
        <Editor
          key={node.id}
          code={node.data.code}
          language="jsx"
          theme={themes.vsDark}
          onChange={onChange}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', minHeight: '100%' }}
        />
      </div>
    </div>
  );
}
