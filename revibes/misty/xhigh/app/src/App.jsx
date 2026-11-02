import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow, MarkerType,
} from "@xyflow/react";
import ExampleNode from "./nodes/ExampleNode.jsx";
import SourceNode from "./nodes/SourceNode.jsx";
import Toolbar from "./components/Toolbar.jsx";
import BlendDialog from "./components/BlendDialog.jsx";
import CodePanel from "./components/CodePanel.jsx";
import AddSourceDialog from "./components/AddSourceDialog.jsx";
import HelpCard from "./components/HelpCard.jsx";
import { Toasts } from "./components/ui.jsx";
import { MistyContext } from "./lib/context.js";
import { chat, parseJsonLoose } from "./lib/llm.js";
import { SYSTEM, globalBlendPrompt, localBlendPrompt, togglePrompt, editClassPrompt, fixPrompt } from "./lib/prompts.js";
import { repairCode, swapChangeClasses } from "./lib/repair.js";
import { compile } from "./lib/compile.js";
import { normalizeImage } from "./lib/image.js";
import { saveCanvas, loadCanvas } from "./lib/persist.js";
import { SAMPLE_EXAMPLES, SAMPLE_SOURCES } from "./lib/samples.js";

const nodeTypes = { example: ExampleNode, source: SourceNode };
const newId = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const LINEAGE = { stroke: "#9b90d6", strokeWidth: 2 };
const FROM_EXAMPLE = { stroke: "#a9b1e0", strokeWidth: 2, strokeDasharray: "6 5" };
const keyOf = (cats) => cats.map((c) => (c.enabled ? "1" : "0")).join("");

function normalizeCategories(raw) {
  let list = raw;
  if (list && !Array.isArray(list) && typeof list === "object") {
    list = Object.entries(list).map(([category, changes]) => ({ category, changes }));
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => (typeof c === "string" ? { category: c, changes: [] } : c))
    .filter((c) => c && c.category)
    .map((c) => ({
      category: String(c.category),
      enabled: true,
      changes: (Array.isArray(c.changes) ? c.changes : []).map((ch) => ({
        type: String(ch.type || "class"),
        before: String(ch.before ?? ""),
        after: String(ch.after ?? ""),
      })),
    }));
}

async function askForCode(prompt, images = []) {
  const text = await chat({ system: SYSTEM, text: prompt, images });
  const json = parseJsonLoose(text);
  if (!json.updatedCode) throw new Error("The model's answer had no updatedCode.");
  return { json, code: repairCode(json.updatedCode) };
}

async function defaultCanvas() {
  const examples = await Promise.all(
    SAMPLE_EXAMPLES.map(async (s, i) => {
      const img = await normalizeImage(s.src);
      return {
        id: `ex-sample-${i}`,
        type: "example",
        position: { x: (i % 2) * 330, y: Math.floor(i / 2) * 720 },
        data: { title: s.title, src: img.url },
      };
    })
  );
  const sources = SAMPLE_SOURCES.slice(0, 2).map((s, i) => ({
    id: `src-sample-${i}`,
    type: "source",
    position: { x: 780, y: i * 980 },
    data: { title: s.title, code: s.code, status: "ready" },
  }));
  return { nodes: [...examples, ...sources], edges: [] };
}

function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { getNode, getNodes, updateNodeData, screenToFlowPosition, fitView, setViewport, getViewport } = useReactFlow();
  const [loaded, setLoaded] = useState(false);
  const [drop, setDrop] = useState(null);
  const [addingSource, setAddingSource] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeNodeId, setCodeNodeId] = useState(null);
  const [renderErrors, setRenderErrors] = useState({});
  const [toasts, setToasts] = useState([]);
  const [help, setHelp] = useState(() => { try { return !localStorage.getItem("misty-help-seen"); } catch { return true; } });
  const runs = useRef({});

  const notify = useCallback((text, kind = "info") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 3500);
  }, []);

  // ---------- load / save ----------
  useEffect(() => {
    (async () => {
      const saved = await loadCanvas();
      if (saved?.nodes?.length) {
        setNodes(saved.nodes.map((n) => (n.data?.status === "loading" || n.data?.busy
          ? { ...n, data: { ...n.data, status: n.data.status === "loading" ? "error" : n.data.status, busy: null, error: "Interrupted by a page reload. Click “Try again”." } }
          : n)));
        setEdges((saved.edges || []).map((e) => ({ ...e, animated: false })));
        if (saved.viewport) setViewport(saved.viewport);
      } else {
        const d = await defaultCanvas();
        setNodes(d.nodes);
        setEdges(d.edges);
        setTimeout(() => fitView({ padding: 0.08 }), 80);
      }
      setLoaded(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      saveCanvas({
        nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges: edges.map(({ id, source, target, sourceHandle, targetHandle, label, style, type }) => ({ id, source, target, sourceHandle, targetHandle, label, style, type })),
        viewport: getViewport(),
      });
    }, 800);
    return () => clearTimeout(t);
  }, [nodes, edges, loaded, getViewport]);

  // ---------- adding nodes ----------
  const freeSpot = useCallback((x, y, w = 320, h = 700) => {
    const all = getNodes();
    const hits = (px, py) => all.some((n) => {
      const nw = n.measured?.width ?? 430, nh = n.measured?.height ?? 840;
      return px < n.position.x + nw && px + w > n.position.x && py < n.position.y + nh && py + h > n.position.y;
    });
    for (let i = 0; i < 60 && hits(x, y); i++) y += 140;
    return { x, y };
  }, [getNodes]);

  const centerish = () => screenToFlowPosition({ x: window.innerWidth * 0.3, y: window.innerHeight * 0.25 });

  const addExample = useCallback(async (source, title, at) => {
    try {
      const img = await normalizeImage(source);
      const p = at || freeSpot(centerish().x, centerish().y, 300, 680);
      setNodes((ns) => [...ns, { id: newId("ex"), type: "example", position: p, data: { title, src: img.url } }]);
    } catch (e) {
      notify(`Could not add the image: ${e.message}`, "error");
    }
  }, [freeSpot, notify]); // eslint-disable-line react-hooks/exhaustive-deps

  const addSource = useCallback(({ title, code }) => {
    const p = freeSpot(centerish().x + 360, centerish().y, 430, 840);
    const id = newId("src");
    setNodes((ns) => [...ns, { id, type: "source", position: p, data: { title, code: repairCode(code), status: "ready" } }]);
    setAddingSource(false);
  }, [freeSpot]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- blending ----------
  const runBlend = useCallback(async (id) => {
    const node = getNode(id);
    if (!node) return;
    const o = node.data.origin;
    const image = o.kind === "local" ? o.crop : getNode(o.exampleId)?.data.src;
    const token = Math.random();
    runs.current[id] = token;
    updateNodeData(id, { status: "loading", startedAt: Date.now(), error: null, blend: null, busy: null, code: o.parentCode });
    setEdges((es) => es.map((e) => (e.target === id && e.source === o.exampleId ? { ...e, animated: true } : e)));
    try {
      if (!image) throw new Error("The example node used by this blend was deleted.");
      const prompt = o.kind === "global"
        ? globalBlendPrompt(o.parentCode)
        : localBlendPrompt(o.parentCode, o.aspects, o.custom, o.targetHTML);
      const { json, code } = await askForCode(prompt, [image]);
      if (runs.current[id] !== token) return;
      const categories = normalizeCategories(json.categorizedChanges);
      updateNodeData(id, {
        status: "ready",
        code,
        blend: {
          designExplanation: json.designExplanation || "",
          differences: json.differences || "",
          categories,
          blendedCode: code,
          variants: { [keyOf(categories)]: code },
        },
      });
    } catch (e) {
      if (runs.current[id] !== token) return;
      updateNodeData(id, { status: "error", error: e.message });
    } finally {
      if (runs.current[id] === token) {
        setEdges((es) => es.map((e) => (e.target === id ? { ...e, animated: false } : e)));
      }
    }
  }, [getNode, updateNodeData, setEdges]);

  const createBlendNode = useCallback((parent, example, origin, edgeLabel) => {
    if (parent.data.status !== "ready") {
      notify("That source node is still generating. Wait for it to finish first.");
      return;
    }
    const id = newId("src");
    const pw = parent.measured?.width ?? 430;
    const p = freeSpot(parent.position.x + pw + 150, parent.position.y, 800, 860);
    const title = `${parent.data.title} × ${example.data.title}`;
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      { id, type: "source", position: p, selected: true, data: { title, code: origin.parentCode, status: "loading", origin } },
    ]);
    setEdges((es) => [
      ...es,
      { id: `e-${parent.id}-${id}`, source: parent.id, sourceHandle: "out", target: id, targetHandle: "in", label: edgeLabel, style: LINEAGE, markerEnd: { type: MarkerType.ArrowClosed, color: "#9b90d6" } },
      { id: `e-${example.id}-${id}`, source: example.id, sourceHandle: "out", target: id, targetHandle: "in", style: FROM_EXAMPLE },
    ]);
    setTimeout(() => {
      fitView({ nodes: [{ id: parent.id }, { id }], duration: 600, padding: 0.12 });
      runBlend(id);
    }, 60);
  }, [freeSpot, fitView, runBlend, notify, setNodes, setEdges]);

  const globalBlend = useCallback((exampleId, sourceId) => {
    const ex = getNode(exampleId), src = getNode(sourceId);
    if (!ex || !src || ex.type !== "example" || src.type !== "source") return;
    createBlendNode(src, ex, {
      kind: "global", exampleId, sourceId, exampleTitle: ex.data.title, parentTitle: src.data.title,
      parentCode: src.data.code, thumb: ex.data.src,
    }, "global blend");
  }, [getNode, createBlendNode]);

  const localBlend = useCallback((d, aspects, custom) => {
    setDrop(null);
    const ex = getNode(d.exampleId), src = getNode(d.sourceId);
    if (!ex || !src) return notify("The example or source node is gone.", "error");
    createBlendNode(src, ex, {
      kind: "local", exampleId: d.exampleId, sourceId: d.sourceId, exampleTitle: ex.data.title, parentTitle: src.data.title,
      parentCode: src.data.code, aspects, custom, targetHTML: d.targetHTML, targetLabel: d.targetLabel, crop: d.crop, thumb: d.thumb,
    }, aspects.map((a) => (a === "Customize" ? custom : a.toLowerCase())).join(" + "));
  }, [getNode, createBlendNode, notify]);

  // ---------- semantic diff ----------
  const withBusy = useCallback(async (id, label, fn) => {
    updateNodeData(id, { busy: label, busySince: Date.now() });
    try {
      await fn();
    } catch (e) {
      notify(e.message, "error");
    } finally {
      updateNodeData(id, { busy: null });
    }
  }, [updateNodeData, notify]);

  const toggleCategory = useCallback((id, index) => {
    const node = getNode(id);
    const b = node?.data.blend;
    if (!b || node.data.busy) return;
    const categories = b.categories.map((c, i) => (i === index ? { ...c, enabled: !c.enabled } : c));
    const on = categories[index].enabled;
    const key = keyOf(categories);
    if (b.variants?.[key]) {
      updateNodeData(id, { code: b.variants[key], blend: { ...b, categories } });
      return;
    }
    const verb = on ? "Turning on" : "Turning off";
    withBusy(id, `${verb} “${categories[index].category}”…`, async () => {
      const { code } = await askForCode(togglePrompt({
        currentCode: node.data.code, originalCode: node.data.origin.parentCode, categories, toggled: categories[index], on,
      }));
      const cur = getNode(id).data.blend;
      updateNodeData(id, { code, blend: { ...cur, categories, variants: { ...cur.variants, [key]: code } } });
    });
  }, [getNode, updateNodeData, withBusy]);

  const resetAll = useCallback((id) => {
    const b = getNode(id)?.data.blend;
    if (!b) return;
    const categories = b.categories.map((c) => ({
      ...c, enabled: true, changes: c.changes.map((ch) => ({ ...ch, after: ch.origAfter ?? ch.after, origAfter: undefined })),
    }));
    updateNodeData(id, { code: b.blendedCode, blend: { ...b, categories, variants: { [keyOf(categories)]: b.blendedCode } } });
  }, [getNode, updateNodeData]);

  const editChange = useCallback((id, ci, chi, after) => {
    const node = getNode(id);
    const b = node?.data.blend;
    if (!b) return;
    const ch = b.categories[ci].changes[chi];
    const patchCats = () => b.categories.map((c, i) => (i !== ci ? c : {
      ...c, changes: c.changes.map((x, j) => (j !== chi ? x : { ...x, after, origAfter: x.origAfter ?? x.after })),
    }));
    const swapped = swapChangeClasses(node.data.code, ch.after, after);
    if (swapped.count > 0) {
      const variants = {};
      for (const [k, v] of Object.entries(b.variants || {})) variants[k] = swapChangeClasses(v, ch.after, after).code;
      updateNodeData(id, { code: swapped.code, blend: { ...b, categories: patchCats(), variants } });
      return;
    }
    withBusy(id, "Updating classes…", async () => {
      const { code } = await askForCode(editClassPrompt({ currentCode: node.data.code, category: b.categories[ci].category, before: ch.after, after }));
      const categories = patchCats();
      updateNodeData(id, { code, blend: { ...getNode(id).data.blend, categories, variants: { [keyOf(categories)]: code } } });
    });
  }, [getNode, updateNodeData, withBusy]);

  // ---------- code, fixing, misc ----------
  const updateCode = useCallback((id, code) => {
    const node = getNode(id);
    if (!node) return;
    const b = node.data.blend;
    updateNodeData(id, { code, ...(b ? { blend: { ...b, variants: { [keyOf(b.categories)]: code } } } : {}) });
  }, [getNode, updateNodeData]);

  const fixRender = useCallback((id) => {
    const node = getNode(id);
    if (!node) return;
    const error = renderErrors[id] || null;
    const repaired = repairCode(node.data.code);
    if (error && repaired !== node.data.code && !compile(repaired).error) {
      updateCode(id, repaired);
      notify("Applied heuristic repairs. If it still fails, click Fix Render again to ask the model.");
      return;
    }
    withBusy(id, error ? "Fixing the render error…" : "Fixing rendering issues…", async () => {
      const { code } = await askForCode(fixPrompt({ code: node.data.code, error }));
      updateCode(id, code);
    });
  }, [getNode, renderErrors, updateCode, withBusy, notify]);

  const deleteNode = useCallback((id) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    if (codeNodeId === id) setCodeNodeId(null);
  }, [setNodes, setEdges, codeNodeId]);

  const reportError = useCallback((id, err) => {
    setRenderErrors((prev) => ((prev[id] || null) === (err || null) ? prev : { ...prev, [id]: err || null }));
  }, []);

  const ctx = useMemo(() => ({
    renderErrors,
    reportError,
    patchNode: (id, patch) => updateNodeData(id, patch),
    deleteNode,
    showCode: (id) => { setCodeNodeId(id); setCodeOpen(true); },
    openBlendDialog: (d) => setDrop(d),
    regenerate: runBlend,
    toggleCategory,
    resetAll,
    editChange,
    fixRender,
  }), [renderErrors, reportError, updateNodeData, deleteNode, runBlend, toggleCategory, resetAll, editChange, fixRender]);

  // ---------- connections: example -> source starts a global blend ----------
  const isValidConnection = useCallback((c) => {
    const s = getNode(c.source), t = getNode(c.target);
    return s?.type === "example" && t?.type === "source";
  }, [getNode]);
  const onConnect = useCallback((c) => globalBlend(c.source, c.target), [globalBlend]);
  const onConnectEnd = useCallback((event, state) => {
    // dropping the connection anywhere on a source node also counts
    if (state?.isValid || state?.fromNode?.type !== "example") return;
    const pt = "changedTouches" in event ? event.changedTouches[0] : event;
    const el = document.elementFromPoint(pt.clientX, pt.clientY)?.closest(".react-flow__node");
    const target = el && getNode(el.dataset.id);
    if (target?.type === "source") globalBlend(state.fromNode.id, target.id);
  }, [getNode, globalBlend]);

  // ---------- image files: drop on canvas or paste ----------
  const onPaneDragOver = (e) => {
    if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  };
  const onPaneDrop = (e) => {
    const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    files.forEach((f, i) => addExample(f, f.name.replace(/\.\w+$/, ""), { x: p.x + i * 330, y: p.y }));
  };
  useEffect(() => {
    const onPaste = (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || /INPUT|TEXTAREA/.test(t.tagName))) return;
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
      if (file) addExample(file, "Pasted example");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addExample]);

  const reset = async () => {
    if (!window.confirm("Start over with the demo canvas? Everything on the current canvas is removed.")) return;
    const d = await defaultCanvas();
    setNodes(d.nodes);
    setEdges(d.edges);
    setCodeNodeId(null);
    setTimeout(() => fitView({ padding: 0.08 }), 80);
  };

  const codeNode = codeNodeId ? nodes.find((n) => n.id === codeNodeId) : null;

  return (
    <MistyContext.Provider value={ctx}>
      <div className="flex h-full flex-col">
        <Toolbar
          onUpload={(files) => files.forEach((f, i) => addExample(f, f.name.replace(/\.\w+$/, "")))}
          onAddSource={() => setAddingSource(true)}
          onAddSampleExample={(s) => addExample(s.src, s.title)}
          onAddSampleSource={(s) => addSource(s)}
          onReset={reset}
          onHelp={() => setHelp(true)}
          codeOpen={codeOpen}
          onToggleCode={() => setCodeOpen((o) => !o)}
        />
        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1" onDragOver={onPaneDragOver} onDrop={onPaneDrop}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              isValidConnection={isValidConnection}
              minZoom={0.1}
              maxZoom={2}
              deleteKeyCode={["Backspace", "Delete"]}
              connectionLineStyle={{ stroke: "#6d5bd0", strokeWidth: 2, strokeDasharray: "6 5" }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.6} color="#d3cfe6" />
              <Controls position="bottom-right" />
              <MiniMap position="bottom-left" pannable zoomable nodeColor={(n) => (n.type === "example" ? "#b9c2e6" : "#c9bfe9")} maskColor="rgba(246,245,251,0.7)" />
            </ReactFlow>
            {help && <HelpCard onClose={() => { setHelp(false); try { localStorage.setItem("misty-help-seen", "1"); } catch { /* ignore */ } }} />}
          </div>
          <CodePanel
            open={codeOpen}
            setOpen={setCodeOpen}
            node={codeNode}
            error={codeNode ? renderErrors[codeNode.id] : null}
            onChange={updateCode}
            notify={notify}
          />
        </div>
      </div>
      {drop && <BlendDialog drop={drop} onCancel={() => setDrop(null)} onNext={(aspects, custom) => localBlend(drop, aspects, custom)} />}
      {addingSource && <AddSourceDialog onAdd={addSource} onClose={() => setAddingSource(false)} />}
      <Toasts toasts={toasts} dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </MistyContext.Provider>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
