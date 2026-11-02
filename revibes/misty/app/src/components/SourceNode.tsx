import React, { useContext, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { LiveProvider, LivePreview, LiveContext } from 'react-live'
import * as Lucide from 'lucide-react'
import { Wrench, Sparkles, Terminal, RotateCcw, ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react'
import type { SourceData } from '../types'
import { useMisty } from '../context'
import { normalizeText } from '../llm'

export type SourceNodeType = Node<SourceData, 'source'>

// Everything generated code may reference: React, hooks and every lucide icon.
const SCOPE: Record<string, unknown> = {
  React,
  useState: React.useState,
  useEffect: React.useEffect,
  useRef: React.useRef,
  useMemo: React.useMemo,
  useCallback: React.useCallback,
  ...Object.fromEntries(Object.entries(Lucide).filter(([k]) => /^[A-Z]/.test(k))),
}

function ErrorWatcher({ nodeId }: { nodeId: string }) {
  const { error } = useContext(LiveContext)
  const misty = useMisty()
  useEffect(() => {
    misty.reportRenderError(nodeId, error ?? null)
  }, [error, nodeId, misty])
  if (!error) return null
  return (
    <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-2 max-h-24 overflow-auto whitespace-pre-wrap">
      {error}
    </div>
  )
}

export default function SourceNode({ id, data }: NodeProps<SourceNodeType>) {
  const misty = useMisty()
  const frameRef = useRef<HTMLDivElement>(null)
  const hovered = useRef<Element | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const isBlend = !!data.origin

  const clearHover = () => {
    hovered.current?.classList.remove('misty-drop-target')
    hovered.current = null
  }

  const pickTarget = (x: number, y: number): Element | null => {
    const frame = frameRef.current
    if (!frame) return null
    let el = document.elementFromPoint(x, y)
    if (!el || !frame.contains(el)) return null
    // climb out of svg internals and tiny inline pieces so a meaningful block is highlighted
    while (el && el !== frame && (el.closest('svg') || ['SPAN', 'P', 'IMG', 'H1', 'H2', 'H3', 'H4', 'SMALL', 'STRONG', 'EM', 'I', 'B'].includes(el.tagName))) {
      el = el.parentElement
    }
    if (!el || el === frame) el = frame.firstElementChild
    return el
  }

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-misty-example')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
    const el = pickTarget(e.clientX, e.clientY)
    if (el !== hovered.current) {
      clearHover()
      if (el) {
        el.classList.add('misty-drop-target')
        hovered.current = el
      }
    }
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (frameRef.current && e.relatedTarget && frameRef.current.contains(e.relatedTarget as globalThis.Node)) return
    clearHover()
    setDragOver(false)
  }
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData('application/x-misty-example')
    if (!raw) return
    e.preventDefault()
    const el = pickTarget(e.clientX, e.clientY) ?? hovered.current
    clearHover()
    setDragOver(false)
    if (!el) return
    const payload = JSON.parse(raw) as { exampleNodeId: string; crop: null | { x: number; y: number; w: number; h: number } }
    const clone = el.cloneNode(true) as Element
    clone.classList.remove('misty-drop-target')
    clone.querySelectorAll('.misty-drop-target').forEach((n) => n.classList.remove('misty-drop-target'))
    const html = clone.outerHTML.slice(0, 2500)
    misty.openBlendDialog({
      exampleNodeId: payload.exampleNodeId,
      sourceNodeId: id,
      crop: payload.crop,
      targetHtml: html,
      targetText: normalizeText(el.textContent ?? '').slice(0, 300),
    })
  }

  return (
    <div className="misty-node flex bg-[#efe9fb] rounded-xl shadow-md border border-[#d8ccf4]">
      <div className="w-[430px] p-4 flex flex-col items-center relative">
        <div className="w-full flex items-center justify-between">
          <span className="text-[#5b21b6] font-semibold">Code Render</span>
          <span className="text-[11px] text-gray-500 truncate max-w-[200px]" title={data.label}>
            {data.label}
          </span>
          <button className="nodrag text-gray-500 hover:text-red-500" title="Remove" onClick={() => misty.deleteNode(id)}>
            <X size={14} />
          </button>
        </div>
        {isBlend && (
          <div className="flex gap-4 mt-2 text-[#5b21b6] text-sm">
            <button className="nodrag flex items-center gap-1 hover:underline disabled:opacity-40" disabled={data.status === 'pending'} onClick={() => misty.fixRender(id, data.renderError ? String(data.renderError) : '')} title="Ask the model to repair code that does not render">
              <Wrench size={15} /> Fix Render
            </button>
            <button className="nodrag flex items-center gap-1 hover:underline disabled:opacity-40" disabled={data.status === 'pending'} onClick={() => misty.regenerate(id)} title="Run the same blend again">
              <Sparkles size={15} /> Regenerate
            </button>
          </div>
        )}
        <div
          ref={frameRef}
          className={`misty-phone nodrag nowheel mt-3 rounded-md shadow-inner border ${dragOver ? 'border-[#7c3aed]' : 'border-gray-200'}`}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <LiveProvider code={data.code} scope={SCOPE} noInline={false}>
            <LivePreview className="h-full" />
            <div className="absolute left-2 right-2 bottom-2 pointer-events-none">
              <ErrorWatcher nodeId={id} />
            </div>
          </LiveProvider>
          {data.status === 'pending' && (
            <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center gap-2 text-[#5b21b6]">
              <Loader2 className="animate-spin" size={28} />
              <div className="text-sm font-medium">{data.statusText ?? 'Blending…'}</div>
            </div>
          )}
          {data.status === 'error' && (
            <div className="absolute inset-x-2 top-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded p-2">
              {data.statusText}
            </div>
          )}
        </div>
        {data.explanation && (
          <div className="w-full text-[11px] text-gray-500 mt-2 line-clamp-2" title={data.explanation}>
            {data.explanation}
          </div>
        )}
        <button
          className="nodrag mt-3 flex items-center gap-2 bg-[#1f1f2e] hover:bg-black text-white text-sm px-4 py-2 rounded-md"
          onClick={() => misty.openEditor(id)}
        >
          <Terminal size={14} /> Show Code
        </button>
        {data.changes.length > 0 && !data.showChanges && (
          <button
            className="nodrag absolute -right-3 top-1/2 bg-white border border-[#d8ccf4] rounded-full p-1 text-[#5b21b6] shadow"
            title="Show applied changes"
            onClick={() => misty.setShowChanges(id, true)}
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {data.changes.length > 0 && data.showChanges && (
        <div className="w-[380px] border-l border-[#d8ccf4] p-4 relative">
          <button
            className="nodrag absolute -left-3 top-1/2 bg-white border border-[#d8ccf4] rounded-full p-1 text-[#5b21b6] shadow"
            title="Hide applied changes"
            onClick={() => misty.setShowChanges(id, false)}
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center justify-between">
            <span className="text-[#5b21b6] font-semibold">Applied Changes</span>
            <button className="nodrag flex items-center gap-1 text-[#5b21b6] text-xs hover:underline" onClick={() => misty.resetAll(id)}>
              <RotateCcw size={13} /> Reset All
            </button>
          </div>
          <div className="mt-3 space-y-4">
            {data.changes.map((c, i) => {
              const [head, ...rest] = c.category.split(':')
              const desc = rest.join(':').trim() || head
              const label = rest.length ? head.trim() : 'Change'
              return (
                <div key={i} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
                    <div className="text-sm text-[#5b21b6]">{desc}</div>
                    <details className="mt-1">
                      <summary className="nodrag text-[10px] text-gray-400 cursor-pointer">{c.changes.length} class changes</summary>
                      <ul className="text-[10px] text-gray-500 font-mono mt-1 space-y-0.5">
                        {c.changes.map((ch, j) => (
                          <li key={j}>
                            <span className="text-gray-400">{ch.type}:</span> {ch.before || '∅'} → {ch.after || '∅'}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                  <button
                    className="nodrag flex items-center gap-2 shrink-0"
                    disabled={data.status === 'pending'}
                    onClick={() => misty.toggleCategory(id, i)}
                    title="Toggle this change on or off (asks the model to update the code)"
                  >
                    <span className={`w-10 h-6 rounded-full p-0.5 flex ${c.enabled ? 'bg-white justify-end border border-gray-300' : 'bg-gray-300 justify-start'}`}>
                      <span className={`w-5 h-5 rounded-full ${c.enabled ? 'bg-gray-800' : 'bg-white'}`} />
                    </span>
                    <span className="text-xs text-gray-600 w-6">{c.enabled ? 'On' : 'Off'}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-[#7c3aed]" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-[#7c3aed]" />
    </div>
  )
}
