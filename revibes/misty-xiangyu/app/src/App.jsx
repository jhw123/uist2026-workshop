import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from "@xyflow/react";
import { MistyContext } from "./context";
import ExampleNode from "./nodes/ExampleNode";
import SourceNode from "./nodes/SourceNode";
import BlendDialog from "./components/BlendDialog";
import CodePanel from "./components/CodePanel";
import Toolbar from "./components/Toolbar";
import { STARTERS, SAMPLE_EXAMPLES } from "./lib/starters";
import { toPngDataUrl, fileToDataUrl } from "./lib/image";
import { globalBlendPrompt, dragDropPrompt, semanticDiffPrompt, fixRenderPrompt } from "./lib/prompts";
import { runBlend, runCodeUpdate } from "./lib/llm";

const nodeTypes = { example: ExampleNode, source: SourceNode };
const STORAGE_KEY = "misty-canvas-v1";
let idCounter = Date.now();
const newId = (p) => `${p}-${(idCounter++).toString(36)}`;

function Canvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [dialog, setDialog] = useState(null); // pending drag-and-drop blend
  const [codeNodeId, setCodeNodeId] = useState(null);
  const [notice, setNotice] = useState("");
  const rf = useReactFlow();
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const diffTimers = useRef({});
  const reqSeq = useRef({});

  const getNode = (id) => nodesRef.current.find((n) => n.id === id);

  const updateNodeData = useCallback(
    (id, patch) =>
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...(typeof patch === "function" ? patch(n.data) : patch) } } : n))
      ),
    [setNodes]
  );

  // ---------- adding nodes ----------
  const freePosition = () => {
    const ns = nodesRef.current;
    if (!ns.length) return { x: 0, y: 0 };
    const maxY = Math.max(...ns.map((n) => n.position.y + (n.measured?.height || 800)));
    const minX = Math.min(...ns.map((n) => n.position.x));
    return { x: minX, y: maxY + 80 };
  };

  const addExample = useCallback(
    async (src, name, position) => {
      try {
        const img = await toPngDataUrl(src);
        const id = newId("ex");
        setNodes((ns) => [
          ...ns,
          { id, type: "example", position: position || freePosition(), data: { name: name || "Reference Example", image: img.url, aspect: img.height / img.width } },
        ]);
      } catch (e) {
        setNotice(String(e.message || e));
      }
    },
    [setNodes]
  );

  const addSource = useCallback(
    (code, name, position) => {
      const id = newId("src");
      setNodes((ns) => [...ns, { id, type: "source", position: position || freePosition(), data: { label: name || "Source UI", code } }]);
      return id;
    },
    [setNodes]
  );

  // ---------- blending ----------
  const runOp = useCallback(
    async (nodeId) => {
      const n = getNode(nodeId);
      if (!n) return;
      const { op, parentCode } = n.data;
      const seq = (reqSeq.current[nodeId] = (reqSeq.current[nodeId] || 0) + 1);
      updateNodeData(nodeId, { status: "loading", error: null });
      try {
        const prompt =
          op.type === "global"
            ? globalBlendPrompt(parentCode)
            : dragDropPrompt(parentCode, op.aspects, op.customText, op.targetHtml);
        const res = await runBlend(prompt, op.image);
        if (reqSeq.current[nodeId] !== seq) return;
        updateNodeData(nodeId, {
          status: "idle",
          code: res.code,
          blendedCode: res.code,
          categories: res.categories,
          designExplanation: res.designExplanation,
          differences: res.differences,
          panelOpen: true,
        });
      } catch (e) {
        if (reqSeq.current[nodeId] !== seq) return;
        updateNodeData(nodeId, { status: "error", error: String(e.message || e) });
      }
    },
    [updateNodeData]
  );

  // Creates the new source node for a blend, wired to its parent and example.
  const createBlendNode = useCallback(
    (targetId, exampleId, op) => {
      const target = getNode(targetId);
      if (!target) return;
      const id = newId("blend");
      const siblings = edgesRef.current.filter((e) => e.source === targetId && e.data?.lineage).length;
      const w = target.measured?.width || 420;
      const position = { x: target.position.x + w + 140, y: target.position.y + siblings * 900 };
      const label = op.type === "global" ? "Global blend" : `Blend: ${op.aspects.join(", ")}`;
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: "source",
          position,
          data: { label, code: target.data.code, parentId: targetId, parentCode: target.data.code, exampleId, op, status: "loading" },
        },
      ]);
      setEdges((es) => [
        ...es,
        { id: newId("e"), source: targetId, target: id, label, data: { lineage: true }, style: { stroke: "#7c3aed", strokeWidth: 2 } },
        { id: newId("e"), source: exampleId, target: id, animated: true, style: { stroke: "#a78bfa", strokeDasharray: "6 4" } },
      ]);
      setTimeout(() => runOp(id), 0);
    },
    [setNodes, setEdges, runOp]
  );

  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  // Global blending through node connection (4.2.1)
  const onConnect = useCallback(
    (params) => {
      const a = getNode(params.source);
      const b = getNode(params.target);
      if (a?.type !== "example" || b?.type !== "source") return;
      createBlendNode(b.id, a.id, { type: "global", image: a.data.image });
    },
    [createBlendNode]
  );

  const isValidConnection = useCallback((c) => {
    const a = getNode(c.source);
    const b = getNode(c.target);
    return a?.type === "example" && b?.type === "source";
  }, []);

  // Localized blending: called on drop, opens the Pick Blending Option dialog
  const openBlendDialog = useCallback((info) => {
    const ex = getNode(info.exampleId);
    if (!ex) return;
    setDialog({ ...info, image: ex.data.crop?.url || ex.data.image });
  }, []);

  const confirmBlendDialog = (aspects, customText) => {
    const d = dialog;
    setDialog(null);
    createBlendNode(d.targetId, d.exampleId, { type: "dnd", image: d.image, aspects, customText, targetHtml: d.targetHtml });
  };

  // ---------- semantic diff ----------
  const applyDiff = useCallback(
    (nodeId, categories) => {
      const n = getNode(nodeId);
      if (!n) return;
      updateNodeData(nodeId, { categories });
      clearTimeout(diffTimers.current[nodeId]);
      const allChanges = categories.flatMap((c) => c.changes.map((x) => ({ ...x, on: c.enabled && x.enabled !== false })));
      const edited = allChanges.some((x) => x.editedAfter != null && x.editedAfter !== x.after);
      const allOn = categories.every((c) => c.enabled) && allChanges.every((x) => x.on);
      const allOff = categories.every((c) => !c.enabled);
      if (!edited && allOn) {
        reqSeq.current[nodeId] = (reqSeq.current[nodeId] || 0) + 1;
        return updateNodeData(nodeId, { code: n.data.blendedCode, status: "idle" });
      }
      if (allOff) {
        reqSeq.current[nodeId] = (reqSeq.current[nodeId] || 0) + 1;
        return updateNodeData(nodeId, { code: n.data.parentCode, status: "idle" });
      }
      // Batch quick successive toggles into one model call.
      diffTimers.current[nodeId] = setTimeout(async () => {
        const seq = (reqSeq.current[nodeId] = (reqSeq.current[nodeId] || 0) + 1);
        updateNodeData(nodeId, { status: "updating", error: null });
        try {
          const cur = getNode(nodeId);
          const code = await runCodeUpdate(semanticDiffPrompt(cur.data.parentCode, cur.data.blendedCode, categories));
          if (reqSeq.current[nodeId] !== seq) return;
          updateNodeData(nodeId, { code, status: "idle" });
        } catch (e) {
          if (reqSeq.current[nodeId] !== seq) return;
          updateNodeData(nodeId, { status: "error", error: String(e.message || e) });
        }
      }, 700);
    },
    [updateNodeData]
  );

  const resetDiff = useCallback(
    (nodeId) => {
      const n = getNode(nodeId);
      if (!n?.data.categories) return;
      clearTimeout(diffTimers.current[nodeId]);
      reqSeq.current[nodeId] = (reqSeq.current[nodeId] || 0) + 1;
      const categories = n.data.categories.map((c) => ({
        ...c,
        enabled: true,
        changes: c.changes.map((x) => ({ ...x, enabled: true, editedAfter: undefined })),
      }));
      updateNodeData(nodeId, { categories, code: n.data.blendedCode, status: "idle", error: null });
    },
    [updateNodeData]
  );

  // ---------- Fix Render ----------
  const fixRender = useCallback(
    async (nodeId) => {
      const n = getNode(nodeId);
      if (!n) return;
      const seq = (reqSeq.current[nodeId] = (reqSeq.current[nodeId] || 0) + 1);
      updateNodeData(nodeId, { status: "updating", error: null });
      try {
        const code = await runCodeUpdate(fixRenderPrompt(n.data.code, n.data.renderError));
        if (reqSeq.current[nodeId] !== seq) return;
        updateNodeData(nodeId, (d) => ({ code, status: "idle", blendedCode: d.blendedCode === d.code ? code : d.blendedCode }));
      } catch (e) {
        if (reqSeq.current[nodeId] !== seq) return;
        updateNodeData(nodeId, { status: "error", error: String(e.message || e) });
      }
    },
    [updateNodeData]
  );

  const duplicateNode = useCallback(
    (nodeId) => {
      const n = getNode(nodeId);
      if (!n) return;
      addSource(n.data.code, `${n.data.label} (copy)`, { x: n.position.x, y: n.position.y + (n.measured?.height || 800) + 60 });
    },
    [addSource]
  );

  // ---------- persistence ----------
  const loaded = useRef(false);
  useEffect(() => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {}
    if (saved?.nodes?.length) {
      setNodes(saved.nodes.map((n) => (n.data.status === "loading" || n.data.status === "updating" ? { ...n, data: { ...n.data, status: "error", error: "Interrupted by a page reload. Press Regenerate." } } : n)));
      setEdges(saved.edges || []);
      loaded.current = true;
    } else {
      seedCanvas().then(() => (loaded.current = true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seedCanvas = async () => {
    addSource(STARTERS[0].code, "Source UI: Find parks", { x: 520, y: 0 });
    await addExample(SAMPLE_EXAMPLES[0].url, "Reference Example", { x: 0, y: 0 });
    await addExample(SAMPLE_EXAMPLES[3].url, "Sketch", { x: -420, y: 0 });
    setTimeout(() => rf.fitView({ padding: 0.15 }), 100);
  };

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes: nodes.map(({ selected, dragging, ...n }) => n), edges }));
      } catch {
        setNotice("The canvas is too large to save in the browser; it will be lost on reload.");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [nodes, edges]);

  const clearCanvas = async () => {
    if (!confirm("Clear the canvas and start over with the starter nodes?")) return;
    setNodes([]);
    setEdges([]);
    setCodeNodeId(null);
    nodesRef.current = [];
    await seedCanvas();
  };

  // Paste an image from the clipboard as a new example node
  useEffect(() => {
    const onPaste = async (e) => {
      if (e.target.closest?.("textarea, input, .misty-editor")) return;
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
      if (file) addExample(await fileToDataUrl(file), "Pasted example");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addExample]);

  // Drop image files on the canvas as example nodes
  const onCanvasDragOver = (e) => {
    if (e.dataTransfer.types.includes("Files")) e.preventDefault();
  };
  const onCanvasDrop = async (e) => {
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    let pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    for (const f of files) {
      await addExample(await fileToDataUrl(f), f.name, pos);
      pos = { x: pos.x + 40, y: pos.y + 40 };
    }
  };

  const ctx = useMemo(
    () => ({ updateNodeData, openBlendDialog, runOp, applyDiff, resetDiff, fixRender, duplicateNode, openCode: setCodeNodeId, codeNodeId }),
    [updateNodeData, openBlendDialog, runOp, applyDiff, resetDiff, fixRender, duplicateNode, codeNodeId]
  );

  const codeNode = nodes.find((n) => n.id === codeNodeId && n.type === "source");

  return (
    <MistyContext.Provider value={ctx}>
      <div className="h-full w-full flex flex-col bg-slate-50">
        <Toolbar addExample={addExample} addSource={addSource} clearCanvas={clearCanvas} />
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 relative" onDragOver={onCanvasDragOver} onDrop={onCanvasDrop}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              nodeTypes={nodeTypes}
              minZoom={0.1}
              maxZoom={2}
              fitView
              deleteKeyCode={["Delete"]}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={22} color="#cbd5e1" />
              <Controls />
              <MiniMap pannable zoomable nodeColor={(n) => (n.type === "example" ? "#c7d2fe" : "#ddd6fe")} />
            </ReactFlow>
            {notice && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-amber-100 border border-amber-300 text-amber-900 text-sm px-4 py-2 rounded shadow flex gap-3">
                {notice}
                <button className="font-semibold" onClick={() => setNotice("")}>×</button>
              </div>
            )}
          </div>
          <CodePanel node={codeNode} onClose={() => setCodeNodeId(null)} onChange={(code) => updateNodeData(codeNode.id, { code })} />
        </div>
        {dialog && <BlendDialog info={dialog} onCancel={() => setDialog(null)} onNext={confirmBlendDialog} />}
      </div>
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
