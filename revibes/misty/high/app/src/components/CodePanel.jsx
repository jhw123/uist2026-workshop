import React, { useEffect, useRef, useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { ChevronRight, ChevronLeft, Copy, Check, Code2 } from "lucide-react";

const EXT = [javascript({ jsx: true }), EditorView.lineWrapping];

/** Live code editor, expandable and collapsible on the right side (Section 4.2.2). */
export default function CodePanel({ node, open, onOpen, onClose, onChange }) {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState(node?.data?.code || "");
  const timer = useRef(null);
  const nodeId = node?.id;
  const external = node?.data?.code;

  // Follow outside changes (blends, toggles) unless the user is typing.
  useEffect(() => {
    if (external !== undefined && external !== text && !timer.current) setText(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external, nodeId]);

  const change = (v) => {
    setText(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      onChange(nodeId, v);
    }, 350);
  };

  if (!open) {
    return (
      <button
        className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-lg bg-gray-800 px-1.5 py-3 text-white shadow-lg hover:bg-gray-900"
        onClick={onOpen}
        title="Show the code editor"
      >
        <ChevronLeft size={16} />
        <Code2 size={16} />
      </button>
    );
  }

  const readOnly = !node || node.data.status === "loading";
  return (
    <div className="absolute bottom-0 right-0 top-0 z-20 flex w-[min(560px,45vw)] flex-col border-l border-gray-700 bg-[#1e1e2e] shadow-2xl">
      <div className="flex items-center gap-2 border-b border-gray-700 px-3 py-2 text-sm text-gray-200">
        <button className="rounded p-1 hover:bg-white/10" onClick={onClose} title="Collapse the code editor">
          <ChevronRight size={16} />
        </button>
        <div className="min-w-0 flex-1 truncate">
          {node ? (
            <>
              <span className="font-medium">Code</span>
              <span className="text-gray-400"> · {node.data.title}{node.data.subtitle ? ` · ${node.data.subtitle}` : ""}</span>
            </>
          ) : (
            <span className="text-gray-400">Select a Code Render and press Show Code</span>
          )}
        </div>
        {node && (
          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-white/10"
            onClick={() => {
              navigator.clipboard?.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {node && (
        <div className="min-h-0 flex-1 overflow-auto text-[13px]">
          <CodeMirror value={text} theme="dark" extensions={EXT} onChange={change} editable={!readOnly} basicSetup={{ foldGutter: true }} />
        </div>
      )}
      <div className="border-t border-gray-700 px-3 py-1.5 text-[11px] text-gray-400">
        React + Tailwind, as one component: <code>{"() => { return (...) }"}</code>. Edits render live.
      </div>
    </div>
  );
}
