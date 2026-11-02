import { X } from 'lucide-react'
import { FIXTURES } from '../llm'

export const STEPS = [
  { n: 1, title: 'Global blend', text: 'Drag from the handle on the right of the Health Categories example to the handle on the left of Fuji\'s profile. A new Code Render appears with the dark list style.' },
  { n: 2, title: 'Semantic diff', text: 'In the new node\'s Applied Changes panel, toggle the dark-theme category Off. The code is updated and the light theme returns, other changes stay.' },
  { n: 3, title: 'Targeted blend: Layout', text: 'On the Music profile example, draw a rectangle around the Top 100 carousel, press Done, then drag the selection onto the Interests list of the latest render. Choose Layout, then Next.' },
  { n: 4, title: 'Targeted blend: add an element', text: 'On the Music profile example, Undo the selection, draw one around the red Edit button, press Done, and drag it onto the contact info of the latest render. Choose Color, Layout and Content, then Next.' },
  { n: 5, title: 'Refine', text: 'Open Show Code to tweak the result by hand, use Regenerate for another take, or Fix Render if the code fails to render.' },
]

export default function Guide({ mode, hits, onClose }: { mode: string; hits: string[]; onClose: () => void }) {
  const counts = FIXTURES.reduce<Record<string, number>>((a, f) => ((a[f.op] = (a[f.op] ?? 0) + 1), a), {})
  return (
    <div className="absolute left-3 top-3 w-80 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-lg z-20 text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="font-semibold text-[#5b21b6]">Golden path (the paper’s scenario)</span>
        <button className="text-gray-400 hover:text-black" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <ol className="px-3 py-2 space-y-2">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-2">
            <span className="shrink-0 w-5 h-5 rounded-full bg-[#38bdf8] text-white text-[11px] flex items-center justify-center">{s.n}</span>
            <div>
              <div className="font-medium">{s.title}</div>
              <div className="text-xs text-gray-600">{s.text}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-500">
        {mode === 'cached' ? (
          <>
            Cached mode replays {FIXTURES.length} recorded responses ({Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(', ')}). Replays so far: {hits.length}. Actions off the path fall back to the closest recording and are marked approximate; if none fits, switch to Live.
          </>
        ) : (
          <>Live mode sends each blend to the LLM bridge. Every call takes several seconds and uses your plan.</>
        )}
      </div>
    </div>
  )
}
