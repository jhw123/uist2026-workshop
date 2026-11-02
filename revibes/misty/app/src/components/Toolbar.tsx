import { useRef, useState } from 'react'
import { Upload, Code2, BookOpen, Trash2, Circle } from 'lucide-react'
import type { LlmMode } from '../types'
import { SAMPLE_EXAMPLES, SAMPLE_SOURCES } from '../samples'

export interface ToolbarProps {
  mode: LlmMode
  setMode: (m: LlmMode) => void
  record: boolean
  setRecord: (r: boolean) => void
  bridge: { ok: boolean; backend?: string; model?: string; text?: string } | null
  onUploadExamples: (files: FileList) => void
  onAddSampleExample: (id: string) => void
  onAddSampleSource: (id: string) => void
  onPasteSource: () => void
  showGuide: boolean
  setShowGuide: (b: boolean) => void
  onClear: () => void
}

export default function Toolbar(p: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [exMenu, setExMenu] = useState(false)
  const [srcMenu, setSrcMenu] = useState(false)
  return (
    <div className="h-12 flex items-center gap-3 px-3 bg-white border-b border-gray-200 text-sm relative z-30 whitespace-nowrap overflow-x-auto">
      <div className="font-bold text-[#5b21b6] text-base">Misty</div>
      <div className="text-gray-400 text-xs hidden xl:block">UI prototyping through interactive conceptual blending · revibe</div>

      <div className="ml-4 flex rounded-md border border-gray-300 overflow-hidden shrink-0">
        <button className={`px-3 py-1 ${p.mode === 'cached' ? 'bg-[#5b21b6] text-white' : 'hover:bg-gray-100'}`} onClick={() => p.setMode('cached')} title="Replay recorded model responses; no model calls">
          Golden path (cached)
        </button>
        <button className={`px-3 py-1 ${p.mode === 'live' ? 'bg-[#5b21b6] text-white' : 'hover:bg-gray-100'}`} onClick={() => p.setMode('live')} title="Call the model through the LLM bridge">
          Live (LLM bridge)
        </button>
      </div>
      <div className="flex items-center gap-1 text-xs text-gray-600" title={p.bridge?.text ?? 'checking…'}>
        <Circle size={10} className={p.bridge == null ? 'text-gray-300' : p.bridge.ok ? 'fill-green-500 text-green-500' : 'fill-red-500 text-red-500'} />
        {p.bridge == null ? 'bridge?' : p.bridge.ok ? `bridge: ${p.bridge.backend ?? '?'}${p.bridge.model ? ' / ' + p.bridge.model : ''}` : 'bridge offline'}
      </div>
      {p.mode === 'live' && (
        <label className="flex items-center gap-1 text-xs text-gray-600" title="Save every live response as a fixture for the cached mode (dev server only)">
          <input type="checkbox" checked={p.record} onChange={(e) => p.setRecord(e.target.checked)} /> record fixtures
        </label>
      )}

      <div className="flex-1" />

      <div className="relative">
        <button className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-100" onClick={() => setExMenu((v) => !v)}>
          <Upload size={14} /> Add example
        </button>
        {exMenu && (
          <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-md shadow-lg py-1" onMouseLeave={() => setExMenu(false)}>
            <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100" onClick={() => { fileRef.current?.click(); setExMenu(false) }}>
              Upload screenshot or sketch…
            </button>
            <div className="border-t my-1" />
            {SAMPLE_EXAMPLES.map((s) => (
              <button key={s.id} className="w-full text-left px-3 py-1.5 hover:bg-gray-100" onClick={() => { p.onAddSampleExample(s.id); setExMenu(false) }}>
                <div>{s.label}</div>
                <div className="text-[10px] text-gray-400">{s.note}</div>
              </button>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && p.onUploadExamples(e.target.files)} />
      </div>

      <div className="relative">
        <button className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-100" onClick={() => setSrcMenu((v) => !v)}>
          <Code2 size={14} /> Add source UI
        </button>
        {srcMenu && (
          <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg py-1" onMouseLeave={() => setSrcMenu(false)}>
            <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100" onClick={() => { p.onPasteSource(); setSrcMenu(false) }}>
              Paste React + Tailwind code…
            </button>
            <div className="border-t my-1" />
            {SAMPLE_SOURCES.map((s) => (
              <button key={s.id} className="w-full text-left px-3 py-1.5 hover:bg-gray-100" onClick={() => { p.onAddSampleSource(s.id); setSrcMenu(false) }}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-md border ${p.showGuide ? 'bg-[#efe9fb] border-[#c4b5fd]' : 'border-gray-300 hover:bg-gray-100'}`} onClick={() => p.setShowGuide(!p.showGuide)}>
        <BookOpen size={14} /> Guide
      </button>
      <button className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-100" onClick={p.onClear} title="Reset the canvas to the starting layout">
        <Trash2 size={14} /> Reset
      </button>
    </div>
  )
}
