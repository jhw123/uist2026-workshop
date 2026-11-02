import { useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { X, Undo2, Check, GripHorizontal } from 'lucide-react'
import type { ExampleData, Crop } from '../types'
import { useMisty } from '../context'
import { toDataUrl } from '../image'

export type ExampleNodeType = Node<ExampleData, 'example'>

export default function ExampleNode({ id, data }: NodeProps<ExampleNodeType>) {
  const misty = useMisty()
  const imgRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [pending, setPending] = useState<Crop | null>(null) // drawn but not yet confirmed with Done
  const [thumb, setThumb] = useState<string | null>(null)
  const thumbImg = useRef<HTMLImageElement | null>(null)

  const rel = (e: React.MouseEvent) => {
    const r = imgRef.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || data.crop) return
    const p = rel(e)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    setPending(null)
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return
    const p = rel(e)
    setDrag({ ...drag, x1: p.x, y1: p.y })
  }
  const onMouseUp = () => {
    if (!drag) return
    const c = toCrop(drag)
    setDrag(null)
    if (c.w > 0.02 && c.h > 0.02) setPending(c)
  }

  // Prepare a drag thumbnail of the confirmed crop (used as the HTML5 drag image).
  useEffect(() => {
    let alive = true
    if (data.crop) {
      toDataUrl(data.src, data.crop).then((u) => {
        if (!alive) return
        setThumb(u)
        const im = new Image()
        im.src = u
        thumbImg.current = im
      })
    } else {
      setThumb(null)
      thumbImg.current = null
    }
    return () => {
      alive = false
    }
  }, [data.crop, data.src])

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-misty-example', JSON.stringify({ exampleNodeId: id, crop: data.crop }))
    e.dataTransfer.effectAllowed = 'copy'
    if (thumbImg.current && thumbImg.current.complete) {
      const w = Math.min(160, thumbImg.current.naturalWidth)
      e.dataTransfer.setDragImage(thumbImg.current, w / 2, 20)
    }
  }

  const shown = pending ?? (drag ? toCrop(drag) : null)
  const confirmed = data.crop

  return (
    <div className="misty-node bg-[#dfe3f7] rounded-xl shadow-md border border-[#c4cae8] w-[320px] select-none">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[#3b4a8a] font-semibold text-sm">Reference Example</span>
        <button className="nodrag text-gray-500 hover:text-red-500" title="Remove" onClick={() => misty.deleteNode(id)}>
          <X size={14} />
        </button>
      </div>
      <div className="px-3 pb-2">
        <div className="text-[11px] text-gray-600 mb-1 truncate" title={data.label}>
          {data.label}
        </div>
        <div
          ref={imgRef}
          className={`nodrag relative rounded-md overflow-hidden bg-white ${confirmed ? '' : 'cursor-crosshair'}`}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          title={confirmed ? 'Drag the dashed selection onto a source UI' : 'Draw a rectangle to select a region to blend'}
        >
          <img src={data.src} alt={data.label} className="w-full block pointer-events-none" draggable={false} />
          {!confirmed && !pending && !drag && (
            <span
              className="misty-crop-handle nodrag absolute top-1 right-1 bg-[#5b6bd6]/90 text-white rounded px-1.5 py-0.5 text-[10px] flex items-center gap-1"
              draggable
              onDragStart={onDragStart}
              onMouseDown={(e) => e.stopPropagation()}
              title="Drag the whole example onto a source UI"
            >
              <GripHorizontal size={10} /> drag whole
            </span>
          )}
          {shown && !confirmed && (
            <div
              className="absolute border-2 border-dashed border-[#5b6bd6] bg-[#5b6bd6]/20 pointer-events-none"
              style={pct(shown)}
            />
          )}
          {confirmed && (
            <div
              className="misty-crop-handle absolute border-2 border-dashed border-[#5b6bd6] bg-[#5b6bd6]/25 flex items-start justify-end"
              style={pct(confirmed)}
              draggable
              onDragStart={onDragStart}
              title="Drag this selection onto a source UI"
            >
              <span className="m-1 bg-[#5b6bd6] text-white rounded px-1 py-0.5 text-[10px] flex items-center gap-1">
                <GripHorizontal size={10} /> drag
              </span>
            </div>
          )}
        </div>
        {(pending || confirmed) && (
          <div className="flex justify-center gap-3 mt-3">
            <button
              className="nodrag flex items-center gap-1 bg-[#7d8ccf] hover:bg-[#6b7ac0] text-white text-xs px-4 py-1.5 rounded-md"
              onClick={() => {
                setPending(null)
                misty.setCrop(id, null)
              }}
            >
              <Undo2 size={12} /> Undo
            </button>
            {!confirmed && (
              <button
                className="nodrag flex items-center gap-1 bg-[#7d8ccf] hover:bg-[#6b7ac0] text-white text-xs px-4 py-1.5 rounded-md"
                onClick={() => {
                  misty.setCrop(id, pending)
                  setPending(null)
                }}
              >
                <Check size={12} /> Done
              </button>
            )}
          </div>
        )}
        {!pending && !confirmed && (
          <div className="text-[10px] text-gray-500 mt-2 text-center">
            Connect the handle to a source UI for a global blend · draw a region to blend part of it
          </div>
        )}
        {thumb && <img src={thumb} alt="" className="hidden" />}
      </div>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-[#5b6bd6]" />
    </div>
  )
}

function toCrop(d: { x0: number; y0: number; x1: number; y1: number }): Crop {
  const x = Math.min(d.x0, d.x1)
  const y = Math.min(d.y0, d.y1)
  return { x, y, w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) }
}

function pct(c: Crop) {
  return { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }
}
