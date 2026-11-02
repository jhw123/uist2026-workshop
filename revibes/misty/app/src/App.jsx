import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import ExampleNode from './nodes/ExampleNode.jsx';
import SourceNode from './nodes/SourceNode.jsx';
import BlendDialog from './components/BlendDialog.jsx';
import CodePanel from './components/CodePanel.jsx';
import Toolbar from './components/Toolbar.jsx';
import AddSourceDialog from './components/AddSourceDialog.jsx';
import { MistyContext, setDragPayload } from './lib/context.js';
import { callModel, bridgeHealth } from './lib/llm.js';
import { globalBlendPrompt, dropBlendPrompt, semanticDiffPrompt, fixRenderPrompt } from './lib/prompts.js';
import { readFile, downscale } from './lib/image.js';
import { repairCode } from './lib/repair.js';
import { compile } from './lib/render.jsx';
import { PARKS } from './lib/samples.js';

const nodeTypes = { example: ExampleNode, source: SourceNode };
const STORE = 'misty-canvas-v1';
let counter = Date.now();
const uid = (p) => `${p}-${(counter++).toString(36)}`;

const lineageEdge = (from, to) => ({
  id: uid('e'), source: from, target: to, sourceHandle: 'out', targetHandle: 'in',
  style: { stroke: '#8b7fc7', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b7fc7' },
});
const blendEdge = (from, to, label) => ({
  id: uid('e'), source: from, target: to, sourceHandle: 'out', targetHandle: 'in', animated: true, label,
  style: { stroke: '#4f86c6', strokeWidth: 2, strokeDasharray: '6 4' }, labelStyle: { fontSize: 11, fill: '#4f86c6' },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#4f86c6' },
});

function initialState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved?.nodes?.length) {
      const nodes = saved.nodes.map((n) => ({ ...n, data: { ...n.data, loading: null } }));
      return { nodes, edges: saved.edges || [] };
    }
  } catch { /* storage unavailable */ }
  return {
    nodes: [{ id: uid('src'), type: 'source', position: { x: 560, y: 130 }, data: { title: 'Work-in-progress UI', code: PARKS } }],
    edges: [],
  };
}

function Canvas() {
  const init = useMemo(initialState, []);
  const [nodes, setNodes, onNodesChange] = useNodesState(init.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(init.edges);
  const [dialog, setDialog] = useState(null); // pending drag-and-drop blend
  const [codeNodeId, setCodeNodeId] = useState(null);
  const [addSource, setAddSource] = useState(false);
  const [health, setHealth] = useState(null);
  const [toast, setToast] = useState(null);
  const rf = useReactFlow();
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const reqIds = useRef({});

  // Health check of the LLM bridge.
  useEffect(() => {
    const check = () => bridgeHealth().then(setHealth);
    check();
    const t = setInterval(check, 15000);
    return () => clearInterval(t);
  }, []);

  // Autosave (best effort; large images may not fit in browser storage).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORE, JSON.stringify({ nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })), edges }));
      } catch { /* quota exceeded or unavailable */ }
    }, 600);
    return () => clearTimeout(t);
  }, [nodes, edges]);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 6000);
  }, []);

  const getNode = (id) => nodesRef.current.find((n) => n.id === id);
  const patch = useCallback((id, p) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...(typeof p === 'function' ? p(n.data) : p) } } : n)));
  }, [setNodes]);

  // ---- Adding nodes -------------------------------------------------------
  const centerPos = (dx = 0, dy = 0) => {
    const p = rf.screenToFlowPosition({ x: window.innerWidth / 2 - 200, y: window.innerHeight / 2 - 250 });
    return { x: p.x + dx, y: p.y + dy };
  };

  const addExampleFiles = useCallback(async (files, at) => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    for (let i = 0; i < imgs.length; i++) {
      const raw = await readFile(imgs[i]);
      const { url, width, height } = await downscale(raw, 1400);
      const pos = at ? { x: at.x + i * 40, y: at.y + i * 40 } : centerPos(i * 40, i * 40);
      setNodes((ns) => [...ns, {
        id: uid('ex'), type: 'example', position: pos,
        data: { title: imgs[i].name || 'Pasted image', image: url, width, height, selection: null },
      }]);
    }
  }, [setNodes, rf]);

  const addSourceNode = useCallback((code, title) => {
    setNodes((ns) => [...ns, { id: uid('src'), type: 'source', position: centerPos(), data: { title: title || 'Work-in-progress UI', code } }]);
  }, [setNodes, rf]);

  // Paste images from the clipboard as example nodes.
  useEffect(() => {
    const onPaste = (e) => {
      if (e.target.closest?.('textarea, input, [contenteditable]')) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addExampleFiles(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addExampleFiles]);

  // ---- Blending ----------------------------------------------------------
  // Place a new result node to the right of its parent, below earlier children.
  const childPosition = (parent) => {
    const kids = edges.filter((e) => e.source === parent.id && getNode(e.target)?.data?.parentId === parent.id).length;
    const w = parent.measured?.width || 440;
    return { x: parent.position.x + w + 140, y: parent.position.y + kids * 120 };
  };

  const runModel = useCallback(async (id, blend, baseCode) => {
    const rid = (reqIds.current[id] = Math.random());
    patch(id, { loading: blend.mode === 'global' ? 'Blending the example into your UI…' : `Blending ${blend.aspects.join(', ').toLowerCase()}…`, error: null });
    try {
      const prompt = blend.mode === 'global'
        ? globalBlendPrompt(baseCode)
        : dropBlendPrompt(baseCode, blend.aspects, blend.custom, blend.targetHtml);
      const res = await callModel(prompt, blend.image);
      if (reqIds.current[id] !== rid) return;
      patch(id, {
        loading: null, code: res.updatedCode, result: res,
        catOn: res.categorizedChanges.map(() => true), cache: {}, fine: {}, edited: false,
      });
    } catch (e) {
      if (reqIds.current[id] !== rid) return;
      patch(id, { loading: null, error: e.message });
    }
  }, [patch]);

  const startBlend = useCallback((parentId, blend) => {
    const parent = getNode(parentId);
    if (!parent) return;
    const id = uid('src');
    const label = blend.mode === 'global' ? 'Global blend' : `Drag & drop: ${blend.aspects.join(' + ')}`;
    setNodes((ns) => [...ns, {
      id, type: 'source', position: childPosition(parent),
      data: { title: label, code: parent.data.code, baseCode: parent.data.code, parentId, blend, result: null },
    }]);
    setEdges((es) => [...es, lineageEdge(parentId, id)]);
    runModel(id, blend, parent.data.code);
    // Bring the parent and its new result into view.
    setTimeout(() => rf.fitView({ nodes: [{ id: parentId }, { id }], duration: 500, padding: 0.12, maxZoom: 0.9 }), 120);
  }, [setNodes, setEdges, runModel, edges, rf]);

  const onConnect = useCallback((conn) => {
    const s = getNode(conn.source), t = getNode(conn.target);
    if (!s || !t) return;
    if (s.type === 'example' && t.type === 'source') {
      setEdges((es) => [...es, blendEdge(s.id, t.id, 'global blend')]);
      startBlend(t.id, { mode: 'global', exampleId: s.id, image: s.data.image, exampleTitle: s.data.title });
    } else {
      notify('Connect an example image (left) to a source UI to blend it globally.');
    }
  }, [setEdges, startBlend, notify]);

  const isValidConnection = useCallback((c) => getNode(c.source)?.type === 'example' && getNode(c.target)?.type === 'source', []);

  // Drag-and-drop: dropped on a source node, then the user picks aspects.
  const requestDrop = useCallback((d) => setDialog(d), []);
  const confirmDrop = useCallback((aspects, custom) => {
    const d = dialog;
    setDialog(null);
    setDragPayload(null);
    if (!d) return;
    setEdges((es) => [...es, blendEdge(d.exampleId, d.sourceId, aspects.join(' + ').toLowerCase())]);
    startBlend(d.sourceId, {
      mode: 'drop', exampleId: d.exampleId, image: d.image, exampleTitle: d.exampleTitle,
      aspects, custom, targetHtml: d.targetHtml, targetLabel: d.targetLabel,
    });
  }, [dialog, setEdges, startBlend]);

  const regenerate = useCallback((id) => {
    const n = getNode(id);
    if (n?.data?.blend) runModel(id, n.data.blend, n.data.baseCode);
  }, [runModel]);

  // ---- Semantic diff -----------------------------------------------------
  const applyCategories = useCallback(async (id, catOn) => {
    const n = getNode(id);
    if (!n?.data?.result) return;
    const { result, baseCode } = n.data;
    const cache = n.data.cache || {};
    const key = catOn.map((b) => (b ? 1 : 0)).join('');
    patch(id, { catOn, fine: {} });
    if (catOn.every(Boolean)) return patch(id, { code: result.updatedCode, error: null });
    if (!catOn.some(Boolean)) return patch(id, { code: baseCode, error: null });
    if (cache[key]) return patch(id, { code: cache[key], error: null });
    const rid = (reqIds.current[id] = Math.random());
    patch(id, { loading: 'Updating the code for your selection…', error: null });
    try {
      const res = await callModel(semanticDiffPrompt(baseCode, result.updatedCode, result.categorizedChanges, catOn));
      if (reqIds.current[id] !== rid) return;
      patch(id, (d) => ({ loading: null, code: res.updatedCode, cache: { ...(d.cache || {}), [key]: res.updatedCode } }));
    } catch (e) {
      if (reqIds.current[id] !== rid) return;
      patch(id, { loading: null, error: e.message });
    }
  }, [patch]);

  const resetAll = useCallback((id) => {
    const n = getNode(id);
    if (!n?.data?.result) return;
    reqIds.current[id] = Math.random();
    patch(id, { loading: null, catOn: n.data.result.categorizedChanges.map(() => true), fine: {}, code: n.data.result.updatedCode, error: null });
  }, [patch]);

  // ---- Fix Render --------------------------------------------------------
  const fixRender = useCallback(async (id) => {
    const n = getNode(id);
    if (!n) return;
    const repaired = repairCode(n.data.code);
    const { error } = compile(repaired);
    const runtime = n.data.renderError;
    if (!error && repaired !== n.data.code && !runtime) {
      patch(id, { code: repaired });
      return notify('Fixed with the repair rules.');
    }
    if (!error && !runtime) return notify('This node renders without errors.');
    const rid = (reqIds.current[id] = Math.random());
    patch(id, { loading: 'Asking the model to repair the code…', error: null });
    try {
      const res = await callModel(fixRenderPrompt(repaired, String(error?.message || runtime)));
      if (reqIds.current[id] !== rid) return;
      patch(id, { loading: null, code: res.updatedCode });
    } catch (e) {
      if (reqIds.current[id] !== rid) return;
      patch(id, { loading: null, error: e.message });
    }
  }, [patch, notify]);

  // ---- Canvas file drops --------------------------------------------------
  const onDragOver = (e) => {
    if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  };
  const onDrop = (e) => {
    if (!e.dataTransfer.files?.length) return;
    e.preventDefault();
    addExampleFiles(e.dataTransfer.files, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const ctx = useMemo(() => ({
    patch, requestDrop, regenerate, applyCategories, resetAll, fixRender,
    openCode: (id) => setCodeNodeId(id), codeNodeId, getNode, notify,
  }), [patch, requestDrop, regenerate, applyCategories, resetAll, fixRender, codeNodeId, notify]);

  const codeNode = nodes.find((n) => n.id === codeNodeId);

  return (
    <MistyContext.Provider value={ctx}>
      <div className="w-screen h-screen flex bg-[#f6f5fb]">
        <div className="relative flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} isValidConnection={isValidConnection}
            defaultViewport={{ x: 0, y: 0, zoom: 0.8 }} minZoom={0.1} maxZoom={2}
            fitView={init.nodes.length > 1} fitViewOptions={{ padding: 0.2, maxZoom: 0.9 }}
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background gap={22} color="#d8d4ea" />
            <Controls position="bottom-left" />
            <MiniMap position="bottom-right" pannable zoomable nodeColor={(n) => (n.type === 'example' ? '#bcd3ef' : '#d9cff3')} />
          </ReactFlow>
          <Toolbar
            health={health}
            onAddExamples={(files) => addExampleFiles(files)}
            onAddSource={() => setAddSource(true)}
            onClear={() => {
              if (!confirm('Remove every node from the canvas?')) return;
              setNodes([]); setEdges([]); setCodeNodeId(null);
            }}
          />
          {toast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-gray-900 text-white text-sm px-4 py-2 shadow-lg">{toast}</div>
          )}
        </div>
        {codeNode && (
          <CodePanel
            node={codeNode}
            onChange={(code) => patch(codeNode.id, { code, edited: true })}
            onClose={() => setCodeNodeId(null)}
          />
        )}
      </div>
      {dialog && <BlendDialog drop={dialog} onCancel={() => { setDialog(null); setDragPayload(null); }} onNext={confirmDrop} />}
      {addSource && <AddSourceDialog onClose={() => setAddSource(false)} onAdd={(code, title) => { addSourceNode(code, title); setAddSource(false); }} />}
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
