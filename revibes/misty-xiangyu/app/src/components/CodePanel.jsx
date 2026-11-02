import { useEffect, useRef, useState } from "react";
import { Editor } from "react-live";
import { X, Copy, Check } from "lucide-react";

// Live code editor, expandable and collapsible on the right (section 4.2.2).
// Only for source nodes. Edits re-render the node as you type.
export default function CodePanel({ node, onClose, onChange }) {
  // The editor is seeded, not controlled: feeding every keystroke back into
  // react-live's Editor makes it loop.
  const [seed, setSeed] = useState({ code: node?.data.code || "", ver: 0 });
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  const lastSent = useRef(null);
  const current = useRef(seed.code);

  useEffect(() => {
    // Follow outside changes (blends, toggles, switching nodes), not our own echo.
    if (node && node.data.code !== lastSent.current) {
      current.current = node.data.code;
      setSeed((s) => ({ code: node.data.code, ver: s.ver + 1 }));
    }
  }, [node?.id, node?.data.code]);

  if (!node) return null;

  const change = (v) => {
    current.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastSent.current = v;
      onChange(v);
    }, 300);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(current.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="w-[520px] shrink-0 border-l border-gray-300 bg-[#011627] flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 text-gray-100 text-sm">
        <span className="truncate">Code: {node.data.label}</span>
        <div className="flex gap-3">
          <button className="flex items-center gap-1 hover:text-white" onClick={copy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
          </button>
          <button className="hover:text-white" onClick={onClose} title="Collapse"><X size={16} /></button>
        </div>
      </div>
      {node.data.renderError && <div className="bg-red-900/60 text-red-100 text-xs px-3 py-1">Render error: {node.data.renderError}</div>}
      <div className="flex-1 overflow-auto misty-editor text-[13px]">
        <Editor key={`${node.id}-${seed.ver}`} code={seed.code} onChange={change} language="jsx" style={{ minHeight: "100%", fontFamily: "ui-monospace, Menlo, monospace" }} />
      </div>
    </div>
  );
}
