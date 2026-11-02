import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
} from "@xyflow/react";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { MistyContext } from "./context.js";
import ExampleNode from "./nodes/ExampleNode.jsx";
import SourceNode from "./nodes/SourceNode.jsx";
import BlendDialog from "./components/BlendDialog.jsx";
import CodePanel from "./components/CodePanel.jsx";
import TopBar from "./components/TopBar.jsx";
import { chat } from "./lib/llm.js";
import { SYSTEM, globalBlendPrompt, dropBlendPrompt, togglePrompt, fixPrompt } from "./lib/prompts.js";
import { parseModelJson, normaliseCategories } from "./lib/parse.js";
import { repairCode } from "./lib/repair.js";
import { swapClasses } from "./lib/classes.js";
import { toPngDataUrl } from "./lib/images.js";
import { SAMPLE_SOURCES, SAMPLE_EXAMPLES } from "./lib/samples.js";

const nodeTypes = { example: ExampleNode, source: SourceNode };
const STORE_KEY = "misty-canvas-v1";
let idCounter = Date.now() % 100000;
const newId = (p) => `${p}${++idCounter}`;

const edgeStyle = {
  blend: { stroke: "#7c3aed", strokeWidth: 2 },
  example: { stroke: "#6366f1", strokeWidth: 1.5, strokeDasharray: "6 4" },
};

function aspectLabel(aspects, custom) {
  const a = aspects.filter((x) => x !== "Customize");
  if (aspects.includes("Customize") && custom) a.push(`“${custom.slice(0, 24)}${custom.length > 24 ? "…" : ""}”`);
  return a.join(" + ");
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const rf = useReactFlow();
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const [loaded, setLoaded] = useState(false);
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);
  const [dialog, setDialog] = useState(null);
  const [editorNodeId, setEditorNodeId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [renderErrors, setRenderErrors] = useState({});
  const [toasts, setToasts] = useState([]);
  const seqRef = useRef({}); // latest request per node, to drop stale answers

  const toast = useCallback((text, kind = "info") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 4500);
  }, []);

  const getNode = (id) => nodesRef.current.find((n) => n.id === id);

  const updateNode = useCallback(
    (id, patch) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== id) return n;
          const p = typeof patch === "function" ? patch(n.data) : patch;
          const next = { ...n, data: { ...n.data, ...p } };
          return next;
        })
      );
    },
    [setNodes]
  );

  // ---------- creating nodes ----------
  const centre = () => {
    const el = document.querySelector(".react-flow");
    const r = el?.getBoundingClientRect() || { left: 0, top: 0, width: 1200, height: 800 };
    return rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  // Shift a new node right until it does not overlap existing nodes.
  const freeSpot = (pos, w, h) => {
    const boxes = nodesRef.current.map((n) => ({
      x: n.position.x,
      y: n.position.y,
      w: n.measured?.width || (n.type === "example" ? 330 : 440),
      h: n.measured?.height || 880,
    }));
    let p = { ...pos };
    for (let i = 0; i < 60; i++) {
      const hit = boxes.find((b) => p.x < b.x + b.w + 40 && p.x + w + 40 > b.x && p.y < b.y + b.h && p.y + h > b.y);
      if (!hit) return p;
      p = { x: hit.x + hit.w + 60, y: p.y };
    }
    return p;
  };

  const addExample = useCallback(
    async (src, name, position) => {
      try {
        const { url } = await toPngDataUrl(src, 1200);
        const id = newId("ex");
        const pos = position || freeSpot((() => { const c = centre(); return { x: c.x - 160, y: c.y - 420 }; })(), 330, 860);
        setNodes((ns) => [...ns, { id, type: "example", position: pos, data: { kind: "example", imageUrl: url, name } }]);
        if (!position) setTimeout(() => rf.fitView({ nodes: [{ id }], padding: 0.3, maxZoom: 1, duration: 300 }), 50);
        return id;
      } catch (e) {
        toast(`Could not load the image: ${e.message}`, "error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNodes, toast]
  );

  const addSource = useCallback(
    (code, title, position) => {
      const id = newId("src");
      const pos = position || freeSpot((() => { const c = centre(); return { x: c.x - 220, y: c.y - 440 }; })(), 440, 880);
      setNodes((ns) => [...ns, { id, type: "source", position: pos, data: { kind: "source", code, title, status: "idle" } }]);
      setTimeout(() => rf.fitView({ nodes: [{ id }], padding: 0.3, maxZoom: 1, duration: 300 }), 50);
      return id;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNodes]
  );

  const deleteNode = useCallback(
    (id) => {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      if (editorNodeId === id) setEditorNodeId(null);
    },
    [setNodes, setEdges, editorNodeId]
  );

  const childPosition = (parent) => {
    const w = parent.measured?.width || (parent.data.origin ? 800 : 420);
    const kids = edgesRefCount(parent.id);
    return { x: parent.position.x + w + 200, y: parent.position.y + kids * 120 };
  };
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const edgesRefCount = (pid) => edgesRef.current.filter((e) => e.source === pid && e.data?.kind === "blend").length;

  // ---------- blending ----------
  const performBlend = useCallback(
    async (childId, op) => {
      const seq = (seqRef.current[childId] || 0) + 1;
      seqRef.current[childId] = seq;
      updateNode(childId, {
        status: "loading",
        error: null,
        loadingText: op.type === "global" ? "Blending the whole example into your UI…" : `Blending ${aspectLabel(op.aspects, op.custom).toLowerCase() || "aspects"}…`,
      });
      try {
        const prompt =
          op.type === "global"
            ? globalBlendPrompt(op.baseCode)
            : dropBlendPrompt(op.baseCode, op.aspects, op.custom, op.targetHtml || "the whole screen");
        const text = await chat({ system: SYSTEM, prompt, images: [op.imageUrl] });
        if (seqRef.current[childId] !== seq) return;
        const parsed = parseModelJson(text);
        if (!parsed.updatedCode) throw new Error("The model's answer had no updatedCode.");
        const { code, notes } = repairCode(parsed.updatedCode);
        const categories = normaliseCategories(parsed.categorizedChanges);
        updateNode(childId, {
          status: "ready",
          code,
          blendedCode: code,
          baseCode: op.baseCode,
          categories,
          designExplanation: parsed.designExplanation ? String(parsed.designExplanation) : "",
          differences: parsed.differences ? (typeof parsed.differences === "string" ? parsed.differences : JSON.stringify(parsed.differences)) : "",
          edited: false,
          repairNotes: notes,
        });
      } catch (e) {
        if (seqRef.current[childId] !== seq) return;
        updateNode(childId, { status: "error", errorTitle: "Blending failed", error: e.message });
        toast(e.message, "error");
      }
    },
    [updateNode, toast]
  );

  const startBlend = useCallback(
    (parentId, exampleId, op) => {
      const parent = getNode(parentId);
      const example = getNode(exampleId);
      if (!parent || !example) return;
      if (parent.data.status === "loading") return toast("Wait for this node to finish blending first.");
      const childId = newId("src");
      const label = op.type === "global" ? "Global blend" : `${aspectLabel(op.aspects, op.custom)} blend`;
      const fullOp = { ...op, parentId, exampleId, exampleName: example.data.name, baseCode: parent.data.code };
      setNodes((ns) => [
        ...ns.map((n) => ({ ...n, selected: false })),
        {
          id: childId,
          type: "source",
          position: freeSpot(childPosition(parent), 800, 900),
          selected: true,
          data: {
            kind: "source",
            title: parent.data.title,
            subtitle: `${label} · ${example.data.name}`,
            code: parent.data.code,
            status: "loading",
            origin: fullOp,
          },
        },
      ]);
      setEdges((es) => [
        ...es.filter((e) => !(e.source === exampleId && e.target === parentId && e.data?.kind === "pending")),
        {
          id: newId("e"),
          source: parentId,
          target: childId,
          label,
          data: { kind: "blend", exampleId },
          style: edgeStyle.blend,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#7c3aed" },
          labelStyle: { fontSize: 11, fill: "#4c1d95" },
          labelBgStyle: { fill: "#f5f3ff" },
        },
      ]);
      performBlend(childId, fullOp);
      return childId;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setNodes, setEdges, performBlend, toast]
  );

  // Global blending through node connection.
  const onConnect = useCallback(
    (conn) => {
      const s = getNode(conn.source);
      const t = getNode(conn.target);
      if (s?.type === "example" && t?.type === "source") {
        startBlend(t.id, s.id, { type: "global", imageUrl: s.data.imageUrl });
      }
    },
    [startBlend]
  );
  const isValidConnection = useCallback((c) => {
    const s = getNode(c.source);
    const t = getNode(c.target);
    return s?.type === "example" && t?.type === "source";
  }, []);

  // Localized blending using drag-and-drop.
  const beginDrag = useCallback((d) => {
    dragRef.current = d;
    setDrag(d);
  }, []);
  const endDrag = useCallback(() => {
    // dragend fires after drop; keep the info the dialog needs
    setTimeout(() => {
      dragRef.current = null;
      setDrag(null);
    }, 0);
  }, []);
  const onDropOnSource = useCallback(
    (sourceId, target) => {
      const d = dragRef.current;
      if (!d) return;
      const ex = getNode(d.exampleId);
      setDialog({
        sourceId,
        exampleId: d.exampleId,
        exampleName: ex?.data?.name || "example",
        imageUrl: d.imageUrl,
        targetHtml: target.html,
        targetLabel: target.label,
      });
    },
    []
  );
  const onDialogNext = useCallback(
    ({ aspects, custom }) => {
      const r = dialog;
      setDialog(null);
      if (!r) return;
      startBlend(r.sourceId, r.exampleId, {
        type: "drop",
        imageUrl: r.imageUrl,
        aspects,
        custom,
        targetHtml: r.targetHtml,
        targetLabel: r.targetLabel,
      });
    },
    [dialog, startBlend]
  );

  const regenerate = useCallback(
    (id) => {
      const n = getNode(id);
      if (!n?.data.origin) return;
      const ex = getNode(n.data.origin.exampleId);
      const op = { ...n.data.origin };
      if (op.type === "global" && ex) op.imageUrl = ex.data.imageUrl;
      updateNode(id, { origin: op });
      performBlend(id, op);
    },
    [performBlend, updateNode]
  );

  // ---------- semantic diff ----------
  const runToggleUpdate = useCallback(
    async (id, categories) => {
      const n = getNode(id);
      if (!n) return;
      const d = n.data;
      const allOn = categories.every((c) => c.on && c.changes.every((ch) => ch.on && ch.current === ch.after));
      const allOff = categories.every((c) => !c.on);
      if (!d.edited && allOn) return updateNode(id, { categories, code: d.blendedCode, status: "ready" });
      if (!d.edited && allOff) return updateNode(id, { categories, code: d.baseCode, status: "ready" });
      const seq = (seqRef.current[id] || 0) + 1;
      seqRef.current[id] = seq;
      updateNode(id, { categories, status: "updating" });
      try {
        const text = await chat({
          system: SYSTEM,
          prompt: togglePrompt({ baseCode: d.baseCode, blendedCode: d.blendedCode, currentCode: d.code, categories }),
        });
        if (seqRef.current[id] !== seq) return;
        const parsed = parseModelJson(text);
        if (!parsed.updatedCode) throw new Error("The model's answer had no updatedCode.");
        updateNode(id, { code: repairCode(parsed.updatedCode).code, status: "ready" });
      } catch (e) {
        if (seqRef.current[id] !== seq) return;
        updateNode(id, { status: "ready" });
        toast(`Could not update the code: ${e.message}`, "error");
      }
    },
    [updateNode, toast]
  );

  const toggleCategory = useCallback(
    (id, catId, on) => {
      const n = getNode(id);
      const cats = n.data.categories.map((c) => (c.id === catId ? { ...c, on } : c));
      runToggleUpdate(id, cats);
    },
    [runToggleUpdate]
  );

  // Fine-grained control: one class change. Swap classes directly when possible.
  const applyChange = useCallback(
    (id, catId, chId, mutate) => {
      const n = getNode(id);
      let ch0;
      const cats = n.data.categories.map((c) =>
        c.id !== catId ? c : { ...c, changes: c.changes.map((ch) => (ch.id === chId ? ((ch0 = ch), mutate(ch)) : ch)) }
      );
      const ch1 = cats.find((c) => c.id === catId).changes.find((x) => x.id === chId);
      const from = ch0.on ? ch0.current : ch0.before;
      const to = ch1.on ? ch1.current : ch1.before;
      const swapped = swapClasses(n.data.code, from, to);
      if (swapped !== null) {
        updateNode(id, { categories: cats, code: swapped, edited: true });
      } else {
        runToggleUpdate(id, cats);
      }
    },
    [runToggleUpdate, updateNode]
  );
  const toggleChange = useCallback((id, catId, chId, on) => applyChange(id, catId, chId, (ch) => ({ ...ch, on })), [applyChange]);
  const editChange = useCallback((id, catId, chId, value) => applyChange(id, catId, chId, (ch) => ({ ...ch, current: value })), [applyChange]);
  const setCategoryOpen = useCallback(
    (id, catId, open) => updateNode(id, (d) => ({ categories: d.categories.map((c) => (c.id === catId ? { ...c, open } : c)) })),
    [updateNode]
  );
  const resetAll = useCallback(
    (id) => {
      seqRef.current[id] = (seqRef.current[id] || 0) + 1;
      updateNode(id, (d) => ({
        code: d.blendedCode,
        edited: false,
        status: "ready",
        categories: d.categories.map((c) => ({ ...c, on: true, changes: c.changes.map((ch) => ({ ...ch, on: true, current: ch.after })) })),
      }));
    },
    [updateNode]
  );

  // ---------- Fix Render ----------
  const renderErrorsRef = useRef(renderErrors);
  renderErrorsRef.current = renderErrors;
  const reportRenderError = useCallback((id, err) => {
    setRenderErrors((m) => (m[id] === (err || undefined) ? m : { ...m, [id]: err || undefined }));
  }, []);

  const fixRender = useCallback(
    async (id) => {
      const n = getNode(id);
      if (!n) return;
      const err = renderErrorsRef.current[id];
      const { code, notes } = repairCode(n.data.code);
      if (code !== n.data.code && notes.length) {
        updateNode(id, { code });
        toast(`Fixed with heuristic rules: ${notes.join("; ")}. Press Fix Render again to ask the model.`);
        return;
      }
      const prev = n.data.status;
      const seq = (seqRef.current[id] || 0) + 1;
      seqRef.current[id] = seq;
      updateNode(id, { status: "loading", loadingText: "Fixing the render…", error: null });
      try {
        const text = await chat({ system: SYSTEM, prompt: fixPrompt(n.data.code, err) });
        if (seqRef.current[id] !== seq) return;
        const parsed = parseModelJson(text);
        if (!parsed.updatedCode) throw new Error("The model's answer had no updatedCode.");
        updateNode(id, { code: repairCode(parsed.updatedCode).code, status: prev === "error" ? "ready" : prev || "idle", edited: !!n.data.origin });
      } catch (e) {
        if (seqRef.current[id] !== seq) return;
        updateNode(id, { status: prev === "loading" ? "idle" : prev || "idle" });
        toast(`Fix Render failed: ${e.message}`, "error");
      }
    },
    [updateNode, toast]
  );

  // ---------- code editor ----------
  const openEditor = useCallback((id) => {
    setEditorNodeId(id);
    setEditorOpen(true);
  }, []);
  const onCodeChange = useCallback(
    (id, code) => updateNode(id, (d) => ({ code, edited: d.origin ? true : d.edited })),
    [updateNode]
  );

  // ---------- files: drop or paste images onto the canvas ----------
  const onCanvasDrop = useCallback(
    async (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      let p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      for (const f of files) {
        const url = URL.createObjectURL(f);
        await addExample(url, f.name, p);
        p = { x: p.x + 40, y: p.y + 40 };
      }
    },
    [rf, addExample]
  );
  useEffect(() => {
    const onPaste = async (e) => {
      if (e.target.closest?.(".cm-editor, input, textarea")) return;
      const items = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith("image/"));
      for (const it of items) {
        const f = it.getAsFile();
        if (f) await addExample(URL.createObjectURL(f), "Pasted image");
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addExample]);

  // ---------- persistence ----------
  const seed = useCallback(async () => {
    const ex = SAMPLE_EXAMPLES[0];
    const { url } = await toPngDataUrl(ex.file, 1200);
    const sId = newId("src");
    const eId = newId("ex");
    setNodes([
      { id: eId, type: "example", position: { x: 0, y: 40 }, data: { kind: "example", imageUrl: url, name: ex.name } },
      { id: sId, type: "source", position: { x: 440, y: 0 }, data: { kind: "source", code: SAMPLE_SOURCES.parks.code, title: SAMPLE_SOURCES.parks.title, status: "idle" } },
    ]);
    setEdges([]);
    setTimeout(() => rf.fitView({ padding: 0.2 }), 50);
  }, [setNodes, setEdges, rf]);

  useEffect(() => {
    (async () => {
      let saved = null;
      try {
        saved = await idbGet(STORE_KEY);
      } catch {}
      if (saved?.nodes?.length) {
        setNodes(
          saved.nodes.map((n) =>
            n.data.status === "loading" || n.data.status === "updating"
              ? { ...n, data: { ...n.data, status: n.data.origin && !n.data.blendedCode ? "error" : "ready", errorTitle: "Interrupted", error: "The page was reloaded during a model call. Press Regenerate." } }
              : n
          )
        );
        setEdges(saved.edges || []);
        if (saved.viewport) setTimeout(() => rf.setViewport(saved.viewport), 30);
      } else {
        await seed();
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const clean = nodes.map(({ id, type, position, data }) => ({ id, type, position, data }));
      idbSet(STORE_KEY, { nodes: clean, edges, viewport: rf.getViewport() }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [nodes, edges, loaded, rf]);

  const resetCanvas = useCallback(async () => {
    if (!confirm("Clear the canvas and start again with the sample nodes?")) return;
    await idbDel(STORE_KEY).catch(() => {});
    setEditorNodeId(null);
    setRenderErrors({});
    await seed();
  }, [seed]);

  const ctx = useMemo(
    () => ({
      updateNode,
      deleteNode,
      beginDrag,
      endDrag,
      drag,
      onDropOnSource,
      toggleCategory,
      toggleChange,
      editChange,
      setCategoryOpen,
      resetAll,
      fixRender,
      regenerate,
      openEditor,
      editorNodeId: editorOpen ? editorNodeId : null,
      renderErrors,
      reportRenderError,
    }),
    [updateNode, deleteNode, beginDrag, endDrag, drag, onDropOnSource, toggleCategory, toggleChange, editChange, setCategoryOpen, resetAll, fixRender, regenerate, openEditor, editorNodeId, editorOpen, renderErrors, reportRenderError]
  );

  const editorNode = nodes.find((n) => n.id === editorNodeId && n.type === "source");

  return (
    <MistyContext.Provider value={ctx}>
      <div className="bg-[#f7f6fb]" style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}>
        <TopBar
          onAddExample={addExample}
          onAddSource={(code, title) => {
            const id = addSource(code, title);
            return id;
          }}
          onOpenEditor={openEditor}
          onReset={resetCanvas}
        />
        <div style={{ position: "relative", flex: 1, minHeight: 0 }} onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()} onDrop={onCanvasDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            connectionRadius={80}
            minZoom={0.1}
            maxZoom={2}
            fitView
            deleteKeyCode={["Delete", "Backspace"]}
            connectionLineStyle={{ stroke: "#6366f1", strokeWidth: 2, strokeDasharray: "6 4" }}
          >
            <Background gap={22} size={1.4} color="#c9c3dd" />
            <Controls position="bottom-left" />
            <MiniMap position="bottom-right" pannable zoomable className="!bottom-2 !right-12" nodeColor={(n) => (n.type === "example" ? "#a5b4fc" : "#c4b5fd")} />
          </ReactFlow>
          <CodePanel
            key={editorNodeId || "none"}
            node={editorNode}
            open={editorOpen}
            onOpen={() => setEditorOpen(true)}
            onClose={() => setEditorOpen(false)}
            onChange={onCodeChange}
          />
          <div className="pointer-events-none absolute left-1/2 top-3 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto max-w-xl rounded-md px-3 py-2 text-sm shadow-lg ${t.kind === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"}`}
              >
                {t.text}
              </div>
            ))}
          </div>
        </div>
        <BlendDialog request={dialog} onCancel={() => setDialog(null)} onNext={onDialogNext} />
      </div>
    </MistyContext.Provider>
  );
}
