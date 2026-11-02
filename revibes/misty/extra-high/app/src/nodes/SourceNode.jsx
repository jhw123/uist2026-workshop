import React, { useEffect, useMemo, useRef, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import { Wrench, Sparkles, SquareTerminal, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { useMisty } from "../lib/context.js";
import { compile } from "../lib/compile.js";
import { DRAG_MIME, getDrag } from "../lib/dragState.js";
import SemanticDiffPanel from "../components/SemanticDiffPanel.jsx";
import { Spinner, Elapsed } from "../components/ui.jsx";

class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    this.props.onError(error?.message || String(error));
  }
  render() {
    if (this.state.error) return <RenderError message={this.state.error.message || String(this.state.error)} />;
    return this.props.children;
  }
}

function RenderError({ message }) {
  return (
    <div className="m-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
      <div className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4" /> This code does not render</div>
      <pre className="whitespace-pre-wrap font-mono text-[11px]">{message}</pre>
      <p className="mt-2 text-red-600">Try “Fix Render”, “Regenerate”, or edit it with “Show Code”.</p>
    </div>
  );
}

// --- choosing the drop target under the cursor --------------------------------
const TEXTY = new Set(["SPAN", "P", "H1", "H2", "H3", "H4", "H5", "H6", "SVG", "PATH", "CIRCLE", "LINE", "POLYLINE",
  "POLYGON", "RECT", "G", "I", "B", "STRONG", "EM", "SMALL", "A", "LABEL", "LI"]);

function pickTarget(target, root, up) {
  let el = target instanceof Element ? target : target?.parentElement;
  if (!el || !root.contains(el) || el === root) return root.firstElementChild;
  const small = (e) => !(e instanceof HTMLElement) || e.offsetWidth * e.offsetHeight < 1600;
  while (el.parentElement && el.parentElement !== root && (TEXTY.has(el.tagName.toUpperCase()) || small(el))) {
    el = el.parentElement;
  }
  if (up && el.parentElement && el.parentElement !== root) el = el.parentElement;
  return el;
}

function describe(el) {
  if (!el) return "the screen";
  const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
  const text = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 32);
  return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}>${text ? ` “${text}${text.length >= 32 ? "…" : ""}”` : ""}`;
}

function outerHtml(el) {
  const html = el.outerHTML.replace(/\sdata-misty-hover="[^"]*"/g, "");
  return html.length > 4000 ? html.slice(0, 4000) + "\n<!-- (truncated) -->" : html;
}

function Screen({ id, code, onError, interactive }) {
  const m = useMisty();
  const rootRef = useRef(null);
  const hoverRef = useRef(null);
  const [hoverLabel, setHoverLabel] = useState(null);
  const compiled = useMemo(() => compile(code), [code]);
  const [runtime, setRuntime] = useState({ code: null, error: null });
  const runtimeError = runtime.code === code ? runtime.error : null;

  useEffect(() => {
    onError(compiled.error || runtimeError || null);
  }, [compiled.error, runtimeError]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => {
    hoverRef.current?.removeAttribute("data-misty-hover");
    hoverRef.current = null;
    setHoverLabel(null);
  };

  const onDragOver = (e) => {
    if (!interactive || !e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const el = pickTarget(e.target, rootRef.current, e.altKey || e.shiftKey);
    if (el !== hoverRef.current) {
      hoverRef.current?.removeAttribute("data-misty-hover");
      el?.setAttribute("data-misty-hover", "");
      hoverRef.current = el;
      setHoverLabel(describe(el));
    }
  };
  const onDragLeave = (e) => {
    if (!rootRef.current.contains(e.relatedTarget)) clear();
  };
  const onDrop = (e) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    const el = hoverRef.current || pickTarget(e.target, rootRef.current, false);
    const drag = getDrag();
    const label = describe(el);
    const html = el ? outerHtml(el) : "";
    clear();
    if (drag && el) m.openBlendDialog({ ...drag, sourceId: id, targetHTML: html, targetLabel: label });
  };

  return (
    <div className="relative mx-auto mt-3 h-[720px] w-[375px] overflow-hidden rounded-[22px] bg-white shadow-[0_4px_18px_rgba(60,50,120,0.14)] ring-1 ring-black/5">
      <div
        ref={rootRef}
        className="misty-screen nodrag nowheel relative h-full w-full cursor-auto overflow-y-auto overflow-x-hidden"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClickCapture={(e) => e.target.closest("a[href]") && e.preventDefault()}
        onSubmitCapture={(e) => e.preventDefault()}
      >
        {compiled.error ? (
          <RenderError message={compiled.error} />
        ) : (
          <Boundary key={code} onError={(error) => setRuntime({ code, error })}>
            <compiled.Component />
          </Boundary>
        )}
      </div>
      {hoverLabel && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-10 max-w-[340px] -translate-x-1/2 truncate rounded-full bg-violet-600 px-3 py-1 text-[11px] text-white shadow-lg">
          Drop to blend into {hoverLabel}
        </div>
      )}
    </div>
  );
}

function originText(o) {
  if (!o) return "Uploaded source UI";
  if (o.kind === "global") return `Global blend of “${o.exampleTitle}” into “${o.parentTitle}”`;
  return `${o.aspects.map((a) => (a === "Customize" && o.custom ? o.custom : a)).join(" + ")} from a section of “${o.exampleTitle}”, dropped on ${o.targetLabel}`;
}

export default function SourceNode({ id, data, selected }) {
  const m = useMisty();
  const [panelOpen, setPanelOpen] = useState(true);
  const loading = data.status === "loading";
  const failed = data.status === "error";
  const busy = data.busy;

  return (
    <div
      className={`relative flex rounded-2xl border-t-[5px] border-[#c9bfe9] bg-[#efecf9] shadow-[0_2px_10px_rgba(60,50,120,0.10)] ${
        selected ? "ring-2 ring-violet-400" : "ring-1 ring-[#e0dbf3]"
      }`}
    >
      <Handle type="target" position={Position.Left} id="in" className="misty-bar" />
      <div className="w-[430px] px-[27px] pb-5 pt-2">
        <div className="flex items-center gap-2">
          <input
            className="nodrag min-w-0 flex-1 rounded bg-transparent px-1 text-[12px] font-medium text-[#6b64a3] outline-none focus:bg-white"
            value={data.title || ""}
            onChange={(e) => m.patchNode(id, { title: e.target.value })}
          />
          <button title="Delete node" onClick={() => m.deleteNode(id)} className="nodrag rounded p-1 text-[#9a93c9] hover:bg-white hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="truncate px-1 text-[11px] text-[#9a93c9]" title={originText(data.origin)}>{originText(data.origin)}</p>
        <h3 className="mt-1 text-center text-[16px] font-semibold text-[#3f3a7a]">Code Render</h3>
        <div className="mt-1 flex justify-center gap-5 text-[13px] text-[#3f3a7a]">
          <button disabled={loading || !!busy} onClick={() => m.fixRender(id)} className="nodrag flex items-center gap-1 hover:text-violet-700 disabled:opacity-40">
            <Wrench className="h-4 w-4" /> Fix Render
          </button>
          {data.origin && (
            <button disabled={loading || !!busy} onClick={() => m.regenerate(id)} className="nodrag flex items-center gap-1 hover:text-violet-700 disabled:opacity-40">
              <Sparkles className="h-4 w-4" /> Regenerate
            </button>
          )}
        </div>
        <div className="relative">
          <Screen id={id} code={data.code} interactive={!loading && !busy} onError={(e) => m.reportError(id, e)} />
          {loading && (
            <div className="absolute inset-0 mx-auto flex w-[375px] flex-col items-center justify-center gap-3 rounded-[22px] bg-white/80 text-[#3f3a7a] backdrop-blur-[1px]">
              {data.origin?.thumb && <img src={data.origin.thumb} className="max-h-24 max-w-[200px] rounded border border-violet-200 shadow" />}
              <div className="flex items-center gap-2 text-sm font-medium"><Spinner /> Blending… <Elapsed since={data.startedAt} /></div>
              <p className="max-w-[280px] text-center text-xs text-[#6b64a3]">{originText(data.origin)}</p>
            </div>
          )}
          {busy && !loading && (
            <div className="absolute inset-x-0 top-3 mx-auto flex w-fit items-center gap-2 rounded-full bg-[#2d2b3a] px-4 py-1.5 text-xs text-white shadow-lg">
              <Spinner className="h-3.5 w-3.5" /> {busy} <Elapsed since={data.busySince} />
            </div>
          )}
          {failed && (
            <div className="absolute inset-0 mx-auto flex w-[375px] flex-col items-center justify-center gap-3 rounded-[22px] bg-white/90 p-6 text-center">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <p className="text-sm font-medium text-red-700">The blend failed</p>
              <p className="max-h-40 overflow-auto text-xs text-red-600">{data.error}</p>
              <button onClick={() => m.regenerate(id)} className="nodrag flex items-center gap-1 rounded-md bg-[#2d2b3a] px-3 py-1.5 text-xs text-white">
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-center">
          <button onClick={() => m.showCode(id)} className="nodrag flex items-center gap-2 rounded-md bg-[#2d2b3a] px-4 py-2 text-[13px] font-medium text-white shadow hover:bg-black">
            <SquareTerminal className="h-4 w-4" /> Show Code
          </button>
        </div>
      </div>
      {data.blend && !loading && (
        <SemanticDiffPanel id={id} blend={data.blend} busy={busy} open={panelOpen} setOpen={setPanelOpen} />
      )}
      <Handle type="source" position={Position.Right} id="out" isConnectable={false} className="!h-3 !w-3 !border-0 !bg-[#c9bfe9]" />
    </div>
  );
}
