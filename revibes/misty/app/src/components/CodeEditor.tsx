import { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { X } from 'lucide-react'

export default function CodeEditor({ nodeId, label, code, onChange, onClose }: { nodeId: string; label: string; code: string; onChange: (nodeId: string, code: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(code)
  const timer = useRef<number | null>(null)
  useEffect(() => setValue(code), [code, nodeId])
  return (
    <div className="absolute top-0 right-0 bottom-0 w-[520px] bg-white border-l border-gray-200 shadow-2xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-[#efe9fb]">
        <div className="text-sm">
          <span className="font-semibold text-[#5b21b6]">Code editor</span>
          <span className="text-gray-500 ml-2">{label}</span>
        </div>
        <button className="text-gray-500 hover:text-black" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="text-[11px] text-gray-500 px-3 py-1 border-b border-gray-100">
        React + Tailwind, a single component expression <code>() =&gt; {'{...}'}</code>. Edits re-render the node live.
      </div>
      <div className="flex-1 min-h-0">
        <CodeMirror
          value={value}
          height="100%"
          extensions={[javascript({ jsx: true })]}
          onChange={(v) => {
            setValue(v)
            if (timer.current) window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => onChange(nodeId, v), 350)
          }}
        />
      </div>
    </div>
  )
}
