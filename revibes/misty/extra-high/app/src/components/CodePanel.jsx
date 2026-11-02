import { useEffect, useRef, useState } from "react";
import { Editor } from "react-live";
import { themes } from "prism-react-renderer";
import { X, Copy, Download, AlertTriangle } from "lucide-react";

// The live code editor, expandable and collapsible on the right (paper §4.2.2).
// It edits the code of one source node; example nodes have no code.
export default function CodePanel({ open, setOpen, node, error, onChange, notify }) {
  const [text, setText] = useState(node?.data?.code || "");
  const sent = useRef(text);
  const timer = useRef(null);
  const code = node?.data?.code;

  useEffect(() => {
    if (code !== undefined && code !== sent.current) {
      sent.current = code;
      setText(code);
    }
  }, [code, node?.id]);

  if (!open) return null;

  const edit = (value) => {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      sent.current = value;
      onChange(node.id, value);
    }, 300);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    notify("Code copied");
  };
  const download = () => {
    const name = (node.data.title || "component").replace(/[^\w-]+/g, "-").toLowerCase();
    const body = `// Generated with Misty (revibe). React + Tailwind CSS; icons from lucide-react.\nconst Screen = ${text}\n\nexport default Screen;\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/javascript" }));
    a.download = `${name}.jsx`;
    a.click();
  };

  const isSource = node?.type === "source";
  return (
    <aside className="flex w-[520px] shrink-0 flex-col border-l border-[#e0dbf3] bg-[#1f1d2b] text-white">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-white/50">Code</div>
          <div className="truncate text-sm font-medium">{isSource ? node.data.title : "No source node selected"}</div>
        </div>
        {isSource && (
          <>
            <button onClick={copy} title="Copy code" className="rounded p-1.5 hover:bg-white/10"><Copy className="h-4 w-4" /></button>
            <button onClick={download} title="Download as .jsx" className="rounded p-1.5 hover:bg-white/10"><Download className="h-4 w-4" /></button>
          </>
        )}
        <button onClick={() => setOpen(false)} title="Collapse" className="rounded p-1.5 hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>
      {isSource ? (
        <>
          <div className="misty-code min-h-0 flex-1 overflow-auto">
            <Editor key={node.id} code={text} language="jsx" theme={themes.nightOwl} onChange={edit} style={{ minHeight: "100%", padding: 12 }} />
          </div>
          {error && (
            <div className="max-h-32 overflow-auto border-t border-red-400/40 bg-red-950/60 px-4 py-2 text-xs text-red-200">
              <div className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Render error</div>
              <pre className="whitespace-pre-wrap font-mono">{error}</pre>
            </div>
          )}
          <div className="border-t border-white/10 px-4 py-2 text-[11px] text-white/50">
            Edits apply live to the node. React + Tailwind; icons from lucide-react; images from /stock/.
          </div>
        </>
      ) : (
        <div className="p-6 text-sm text-white/70">
          Click “Show Code” on a source node to edit its code. Code editors are only for source nodes, not example images.
        </div>
      )}
    </aside>
  );
}
