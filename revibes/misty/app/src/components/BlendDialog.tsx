import { useState } from 'react'
import { Paintbrush, LayoutGrid, Plus, MoreVertical } from 'lucide-react'
import type { Aspect } from '../types'

const OPTIONS: { id: Aspect; title: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'Color', title: 'Color', desc: 'Apply the colors to your design', icon: <Paintbrush size={18} /> },
  { id: 'Layout', title: 'Layout', desc: 'Arrange and structure your design elements', icon: <LayoutGrid size={18} /> },
  { id: 'Content', title: 'Content', desc: 'Add the selected UI elements', icon: <Plus size={18} /> },
  { id: 'Customize', title: 'Customize', desc: 'Specify a new blending aspect', icon: <MoreVertical size={18} /> },
]

export default function BlendDialog({ onCancel, onNext }: { onCancel: () => void; onNext: (aspects: Aspect[], custom?: string) => void }) {
  const [sel, setSel] = useState<Aspect[]>([])
  const [custom, setCustom] = useState('')
  const toggle = (a: Aspect) => setSel((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]))
  const ok = sel.length > 0 && (!sel.includes('Customize') || custom.trim().length > 0)
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-[#4a5aa8] text-white rounded-xl shadow-2xl w-[300px] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-center font-semibold mb-3">Pick Blending Option</div>
        <div className="space-y-2">
          {OPTIONS.map((o) => {
            const on = sel.includes(o.id)
            return (
              <button
                key={o.id}
                onClick={() => toggle(o.id)}
                className={`w-full text-left rounded-md px-3 py-2 flex gap-3 items-start transition ${on ? 'bg-[#2f3b7a] text-white ring-2 ring-white/60' : 'bg-white text-gray-900 hover:bg-gray-100'}`}
              >
                <span className={`mt-0.5 ${on ? 'text-white' : 'text-[#4a5aa8]'}`}>{o.icon}</span>
                <span>
                  <div className="font-semibold text-sm">{o.title}</div>
                  <div className={`text-[11px] ${on ? 'text-white/80' : 'text-gray-500'}`}>{o.desc}</div>
                </span>
              </button>
            )
          })}
          {sel.includes('Customize') && (
            <input
              autoFocus
              className="w-full rounded-md px-3 py-2 text-sm text-gray-900 bg-white"
              placeholder="e.g. typography, spacing, icon style"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
        </div>
        <div className="flex justify-between mt-4">
          <button className="bg-[#3b9ddd] hover:bg-[#2f8bc8] text-white px-5 py-2 rounded-md text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="bg-[#3b9ddd] hover:bg-[#2f8bc8] disabled:bg-gray-400 text-white px-5 py-2 rounded-md text-sm"
            disabled={!ok}
            onClick={() => onNext(sel, sel.includes('Customize') ? custom.trim() : undefined)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
