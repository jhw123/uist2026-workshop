import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type IsValidConnection,
  BackgroundVariant,
} from '@xyflow/react'
import ExampleNode from './components/ExampleNode'
import SourceNode from './components/SourceNode'
import BlendDialog from './components/BlendDialog'
import CodeEditor from './components/CodeEditor'
import Toolbar from './components/Toolbar'
import Guide from './components/Guide'
import { MistyContext, type DropPayload, type MistyActions } from './context'
import type { Aspect, Crop, ExampleData, LlmMode, Origin, SourceData, BlendResult } from './types'
import { SAMPLE_EXAMPLES, SAMPLE_SOURCES, FUJI_PROFILE_CODE } from './samples'
import { toDataUrl, fileToDataUrl } from './image'
import { callLlm, bridgeHealth, settings, sha, NoFixtureError } from './llm'
import { globalBlendPrompt, dndBlendPrompt, togglePrompt, fixRenderPrompt } from './prompts'
import { repairCode, parseJsonLoose, extractCodeFromParse } from './repair'

type AnyNode = Node<ExampleData, 'example'> | Node<SourceData, 'source'>

const nodeTypes = { example: ExampleNode, source: SourceNode }

let counter = 1
const nextId = (prefix: string) => `${prefix}-${counter++}-${Math.random().toString(36).slice(2, 6)}`

function exampleNode(sampleId: string, position: { x: number; y: number }): AnyNode {
  const s = SAMPLE_EXAMPLES.find((e) => e.id === sampleId)!
  return { id: nextId('ex'), type: 'example', position, data: { kind: 'example', exampleId: s.id, label: s.label, src: s.src, crop: null } }
}
function sourceNode(label: string, code: string, position: { x: number; y: number }): AnyNode {
  return {
    id: nextId('src'),
    type: 'source',
    position,
    data: { kind: 'source', label, code, baseCode: code, originalCode: code, changes: [], origin: null, status: 'idle', showChanges: false },
  }
}
function initialGraph(): { nodes: AnyNode[]; edges: Edge[] } {
  return {
    nodes: [exampleNode('health-categories', { x: 40, y: 40 }), exampleNode('music-profile', { x: 40, y: 640 }), sourceNode("Fuji's profile page", FUJI_PROFILE_CODE, { x: 520, y: 80 })],
    edges: [],
  }
}

interface Toast {
  id: number
  text: string
  kind: 'info' | 'error' | 'ok'
}

export default function App() {
  const init = useMemo(initialGraph, [])
  const [nodes, setNodes, onNodesChange] = useNodesState<AnyNode>(init.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(init.edges)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  const [mode, setModeState] = useState<LlmMode>(() => (new URLSearchParams(location.search).get('mode') === 'live' ? 'live' : 'cached'))
  const [record, setRecordState] = useState(() => new URLSearchParams(location.search).get('record') === '1')
  settings.mode = mode
  settings.record = record
  const setMode = (m: LlmMode) => setModeState(m)
  const setRecord = (r: boolean) => setRecordState(r)

  const [bridge, setBridge] = useState<{ ok: boolean; backend?: string; model?: string; text?: string } | null>(null)
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const h = await bridgeHealth()
      if (alive) setBridge(h)
    }
    tick()
    const t = setInterval(tick, 10000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const [dialog, setDialog] = useState<DropPayload | null>(null)
  const [editorId, setEditorId] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [showGuide, setShowGuide] = useState(true)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [hits, setHits] = useState<string[]>([])

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 5000)
  }, [])

  // --- node helpers ---------------------------------------------------------
  const getNode = (id: string) => nodesRef.current.find((n) => n.id === id)
  const patchSource = useCallback(
    (id: string, patch: Partial<SourceData> | ((d: SourceData) => Partial<SourceData>)) => {
      setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== id || n.type !== 'source') return n
          const d = n.data as SourceData
          const p = typeof patch === 'function' ? patch(d) : patch
          return { ...n, data: { ...d, ...p } } as AnyNode
        }),
      )
    },
    [setNodes],
  )

  const placeChild = (parent: AnyNode) => {
    const w = parent.measured?.width ?? 460
    const siblings = edgesRef.current.filter((e) => e.source === parent.id && getNode(e.target)?.type === 'source').length
    return { x: parent.position.x + w + 140, y: parent.position.y + siblings * 840 }
  }

  // --- the blending operation -------------------------------------------------
  const blend = useCallback(
    async (origin: Origin, opts: { customAspect?: string; replaceNodeId?: string; sourceCode?: string } = {}) => {
      const ex = getNode(origin.exampleNodeId) as Node<ExampleData> | undefined
      const src = getNode(origin.sourceNodeId) as AnyNode | undefined
      if (!ex) return toast('The example node for this blend no longer exists.', 'error')
      const code = opts.sourceCode ?? (src?.type === 'source' ? (src.data as SourceData).code : undefined)
      if (code == null) return toast('The source node for this blend no longer exists.', 'error')

      let nodeId = opts.replaceNodeId
      if (nodeId) {
        patchSource(nodeId, { status: 'pending', statusText: 'Regenerating…' })
      } else {
        nodeId = nextId('src')
        const parent = src!
        const label = origin.op === 'global' ? `Global blend ← ${ex.data.label}` : `${origin.aspects.join(' + ')} blend ← ${ex.data.label}`
        const node: AnyNode = {
          id: nodeId,
          type: 'source',
          position: placeChild(parent),
          data: { kind: 'source', label, code, baseCode: code, originalCode: code, changes: [], origin, status: 'pending', statusText: 'Blending…', showChanges: true },
        }
        setNodes((ns) => [...ns, node])
        setEdges((es) => [
          ...es,
          { id: nextId('e'), source: ex.id, target: nodeId!, animated: true, style: { strokeDasharray: '6 4', stroke: '#5b6bd6' } },
          { id: nextId('e'), source: parent.id, target: nodeId!, style: { stroke: '#7c3aed', strokeWidth: 2 } },
        ])
      }

      try {
        const full = await toDataUrl(ex.data.src)
        let prompt: string
        let images: string[]
        let meta: Record<string, unknown>
        if (origin.op === 'global') {
          prompt = globalBlendPrompt(code)
          images = [full]
          meta = { op: 'global', exampleId: ex.data.exampleId, sourceHash: await sha(code) }
        } else {
          const aspects = [...origin.aspects].sort()
          prompt = dndBlendPrompt(code, origin.aspects, origin.targetHtml, opts.customAspect)
          if (origin.crop) {
            const cropUrl = await toDataUrl(ex.data.src, origin.crop)
            prompt = `The first image is the region of the reference the user selected; the second image is the full reference screenshot, for context only. Blend from the selected region.\n\n` + prompt
            images = [cropUrl, full]
          } else {
            images = [full]
          }
          meta = {
            op: 'dnd',
            exampleId: ex.data.exampleId,
            sourceHash: await sha(code),
            aspects: opts.customAspect ? [...aspects, `custom:${opts.customAspect}`] : aspects,
            targetHash: await sha(origin.targetText),
          }
        }
        const reply = await callLlm({ op: origin.op, prompt, images, meta })
        const parsed = parseJsonLoose(reply.text) as unknown as BlendResult
        const updated = extractCodeFromParse(parsed)
        if (!updated) throw new Error('The model did not return updatedCode')
        const repaired = repairCode(updated)
        const cats = Array.isArray(parsed.categorizedChanges) ? parsed.categorizedChanges : []
        patchSource(nodeId, {
          code: repaired,
          baseCode: repaired,
          originalCode: code,
          changes: cats.map((c) => ({ category: String(c.category ?? 'Change'), changes: Array.isArray(c.changes) ? c.changes : [], enabled: true })),
          explanation: [parsed.designExplanation, parsed.differences].filter(Boolean).join(' — '),
          status: 'idle',
          statusText: undefined,
          replay: reply.source,
          showChanges: true,
        })
        if (reply.source !== 'live') setHits((h) => [...h, reply.fixtureKey])
        if (reply.source === 'cached-approximate') toast('Replayed the closest recorded response (approximate: the request differed from the recording).', 'info')
      } catch (e) {
        const msg = e instanceof NoFixtureError ? e.message : `Blend failed: ${(e as Error).message}`
        patchSource(nodeId, { status: 'error', statusText: msg })
        toast(msg, 'error')
      }
    },
    [patchSource, setEdges, setNodes, toast],
  )

  // --- actions exposed to nodes ----------------------------------------------
  const actions: MistyActions = useMemo(
    () => ({
      openBlendDialog: (p) => setDialog(p),
      runGlobalBlend: (exampleNodeId, sourceNodeId) => blend({ op: 'global', exampleNodeId, sourceNodeId }),
      runDndBlend: (p, aspects, custom) =>
        blend({ op: 'dnd', exampleNodeId: p.exampleNodeId, sourceNodeId: p.sourceNodeId, aspects, crop: p.crop, targetHtml: p.targetHtml, targetText: p.targetText }, { customAspect: custom }),
      regenerate: (nodeId) => {
        const n = getNode(nodeId) as Node<SourceData> | undefined
        if (!n?.data.origin) return
        blend(n.data.origin, { replaceNodeId: nodeId, sourceCode: n.data.originalCode })
      },
      fixRender: async (nodeId, error) => {
        const n = getNode(nodeId) as Node<SourceData> | undefined
        if (!n) return
        const err = error || n.data.renderError || ''
        if (!err) {
          const r = repairCode(n.data.code)
          patchSource(nodeId, { code: r })
          toast('The render has no error; applied the regex repair rules only.', 'info')
          return
        }
        patchSource(nodeId, { status: 'pending', statusText: 'Fixing render…' })
        try {
          const reply = await callLlm({ op: 'fix', prompt: fixRenderPrompt(n.data.code, err), meta: { op: 'fix', sourceHash: await sha(n.data.code) } })
          const code = extractCodeFromParse(parseJsonLoose(reply.text))
          if (!code) throw new Error('No updatedCode in the reply')
          const repaired = repairCode(code)
          patchSource(nodeId, (d) => ({ code: repaired, baseCode: d.changes.every((c) => c.enabled) ? repaired : d.baseCode, status: 'idle', statusText: undefined }))
          if (reply.source !== 'live') setHits((h) => [...h, reply.fixtureKey])
        } catch (e) {
          patchSource(nodeId, { status: 'error', statusText: (e as Error).message })
          toast((e as Error).message, 'error')
        }
      },
      toggleCategory: async (nodeId, index) => {
        const n = getNode(nodeId) as Node<SourceData> | undefined
        if (!n) return
        const changes = n.data.changes.map((c, i) => (i === index ? { ...c, enabled: !c.enabled } : c))
        if (changes.every((c) => c.enabled)) {
          patchSource(nodeId, { changes, code: n.data.baseCode })
          return
        }
        patchSource(nodeId, { changes, status: 'pending', statusText: 'Updating code for the toggled changes…' })
        try {
          const reply = await callLlm({
            op: 'toggle',
            prompt: togglePrompt(n.data.originalCode, n.data.baseCode, changes),
            meta: { op: 'toggle', baseHash: await sha(n.data.baseCode), enabled: changes.map((c) => c.enabled) },
          })
          const code = extractCodeFromParse(parseJsonLoose(reply.text))
          if (!code) throw new Error('No updatedCode in the reply')
          patchSource(nodeId, { code: repairCode(code), status: 'idle', statusText: undefined, replay: reply.source })
          if (reply.source !== 'live') setHits((h) => [...h, reply.fixtureKey])
          if (reply.source === 'cached-approximate') toast('Replayed the closest recorded response (approximate).', 'info')
        } catch (e) {
          const msg = e instanceof NoFixtureError ? e.message : (e as Error).message
          patchSource(nodeId, { status: 'error', statusText: msg, changes: n.data.changes })
          toast(msg, 'error')
        }
      },
      resetAll: (nodeId) => patchSource(nodeId, (d) => ({ changes: d.changes.map((c) => ({ ...c, enabled: true })), code: d.baseCode, status: 'idle', statusText: undefined })),
      setShowChanges: (nodeId, show) => patchSource(nodeId, { showChanges: show }),
      openEditor: (nodeId) => setEditorId(nodeId),
      updateCode: (nodeId, code) => patchSource(nodeId, { code }),
      setCrop: (nodeId, crop: Crop | null) => setNodes((ns) => ns.map((n) => (n.id === nodeId ? ({ ...n, data: { ...n.data, crop } } as AnyNode) : n))),
      deleteNode: (nodeId) => {
        setNodes((ns) => ns.filter((n) => n.id !== nodeId))
        setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId))
        setEditorId((id) => (id === nodeId ? null : id))
      },
      dismissError: (nodeId) => patchSource(nodeId, { status: 'idle', statusText: undefined }),
      reportRenderError: (nodeId, error) => {
        const n = getNode(nodeId) as Node<SourceData> | undefined
        if (!n || (n.data.renderError ?? null) === error) return
        patchSource(nodeId, { renderError: error })
      },
    }),
    [blend, patchSource, setEdges, setNodes, toast],
  )

  // --- global blending by connecting nodes -----------------------------------
  const isValidConnection: IsValidConnection = useCallback(
    (c) => {
      const s = getNode(c.source!)
      const t = getNode(c.target!)
      return s?.type === 'example' && t?.type === 'source'
    },
    [],
  )
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return
      actions.runGlobalBlend(c.source, c.target)
    },
    [actions],
  )

  // --- toolbar actions ---------------------------------------------------------
  const nextExamplePos = () => {
    const ex = nodesRef.current.filter((n) => n.type === 'example')
    const bottom = ex.reduce((m, n) => Math.max(m, n.position.y + (n.measured?.height ?? 560)), 0)
    return { x: 40, y: bottom + 60 }
  }
  const nextSourcePos = () => {
    const s = nodesRef.current.filter((n) => n.type === 'source' && !(n.data as SourceData).origin)
    const bottom = s.reduce((m, n) => Math.max(m, n.position.y + (n.measured?.height ?? 820)), 0)
    return { x: 520, y: bottom + 80 }
  }
  const onUploadExamples = async (files: FileList) => {
    for (const f of Array.from(files)) {
      const url = await fileToDataUrl(f)
      const id = 'upload-' + (await sha(url))
      const node: AnyNode = { id: nextId('ex'), type: 'example', position: nextExamplePos(), data: { kind: 'example', exampleId: id, label: f.name, src: url, crop: null } }
      setNodes((ns) => [...ns, node])
      nodesRef.current = [...nodesRef.current, node]
    }
  }

  const editorNode = editorId ? (getNode(editorId) as Node<SourceData> | undefined) : undefined

  return (
    <MistyContext.Provider value={actions}>
      <div className="h-full flex flex-col">
        <Toolbar
          mode={mode}
          setMode={setMode}
          record={record}
          setRecord={setRecord}
          bridge={bridge}
          onUploadExamples={onUploadExamples}
          onAddSampleExample={(id) => setNodes((ns) => [...ns, exampleNode(id, nextExamplePos())])}
          onAddSampleSource={(id) => {
            const s = SAMPLE_SOURCES.find((x) => x.id === id)!
            setNodes((ns) => [...ns, sourceNode(s.label, s.code, nextSourcePos())])
          }}
          onPasteSource={() => setPasteOpen(true)}
          showGuide={showGuide}
          setShowGuide={setShowGuide}
          onClear={() => {
            const g = initialGraph()
            setNodes(g.nodes)
            setEdges(g.edges)
            setEditorId(null)
          }}
        />
        <div className="flex-1 relative min-h-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 0.9 }}
            minZoom={0.1}
            maxZoom={2}
            deleteKeyCode="Delete"
            proOptions={{ hideAttribution: true }}
            connectionLineStyle={{ stroke: '#5b6bd6', strokeWidth: 2, strokeDasharray: '6 4' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#d4d4d8" />
            <Controls />
            <MiniMap pannable zoomable nodeColor={(n) => (n.type === 'example' ? '#9aa6e8' : '#c4b5fd')} />
          </ReactFlow>
          {showGuide && <Guide mode={mode} hits={hits} onClose={() => setShowGuide(false)} />}
          {editorNode && <CodeEditor nodeId={editorNode.id} label={editorNode.data.label} code={editorNode.data.code} onChange={actions.updateCode} onClose={() => setEditorId(null)} />}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 space-y-2 pointer-events-none">
            {toasts.map((t) => (
              <div key={t.id} className={`px-4 py-2 rounded-md shadow text-sm text-white ${t.kind === 'error' ? 'bg-red-600' : t.kind === 'ok' ? 'bg-green-600' : 'bg-gray-800'}`}>
                {t.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {dialog && (
        <BlendDialog
          onCancel={() => setDialog(null)}
          onNext={(aspects: Aspect[], custom) => {
            const p = dialog
            setDialog(null)
            actions.runDndBlend(p, aspects, custom)
          }}
        />
      )}

      {pasteOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={() => setPasteOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-[640px] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold text-[#5b21b6] mb-1">Add a work-in-progress UI</div>
            <div className="text-xs text-gray-500 mb-2">Paste a React + Tailwind component as a single expression, for example <code>() =&gt; (&lt;div className="p-4"&gt;…&lt;/div&gt;)</code>. Imports and exports are stripped.</div>
            <textarea className="w-full h-72 border border-gray-300 rounded-md p-2 font-mono text-xs" value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
            <div className="flex justify-end gap-2 mt-3">
              <button className="px-4 py-1.5 rounded-md border border-gray-300" onClick={() => setPasteOpen(false)}>
                Cancel
              </button>
              <button
                className="px-4 py-1.5 rounded-md bg-[#5b21b6] text-white disabled:bg-gray-400"
                disabled={!pasteText.trim()}
                onClick={() => {
                  setNodes((ns) => [...ns, sourceNode('Pasted UI', repairCode(pasteText), nextSourcePos())])
                  setPasteText('')
                  setPasteOpen(false)
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </MistyContext.Provider>
  )
}
