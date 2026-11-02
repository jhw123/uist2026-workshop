import React, { useState } from 'react';
import { Paintbrush, LayoutList, Plus, MoreVertical } from 'lucide-react';

const OPTIONS = [
  { key: 'Color', icon: Paintbrush, desc: 'Apply the colors to your design' },
  { key: 'Layout', icon: LayoutList, desc: 'Arrange and structure your design elements' },
  { key: 'Content', icon: Plus, desc: 'Add the selected UI elements' },
  { key: 'Customize', icon: MoreVertical, desc: 'Specify a new blending aspect' },
];

// "Pick Blending Option" dialog shown after a drag-and-drop (Figure 1C).
export default function BlendDialog({ drop, onCancel, onNext }) {
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState('');
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const ready = picked.length > 0 && (!picked.includes('Customize') || custom.trim());

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onMouseDown={onCancel}>
      <div className="w-[340px] rounded-lg bg-[#4d5a9c] shadow-2xl p-5" onMouseDown={(e) => e.stopPropagation()}>
        <div className="text-white text-lg font-medium text-center mb-3">Pick Blending Option</div>
        <div className="flex items-center gap-2 mb-3 text-[11px] text-indigo-100">
          <img src={drop.image} alt="" className="h-12 max-w-[90px] object-contain rounded bg-white" />
          <div className="leading-snug">into <span className="text-white">{drop.targetLabel}</span></div>
        </div>
        <div className="space-y-2.5">
          {OPTIONS.map(({ key, icon: Icon, desc }) => {
            const on = picked.includes(key);
            return (
              <button key={key} onClick={() => toggle(key)}
                className={`w-full flex items-center gap-4 rounded-md px-4 py-3 text-left transition-colors ${on ? 'bg-[#2c3561] text-white ring-2 ring-white/70' : 'bg-white text-gray-900 hover:bg-indigo-50'}`}>
                <Icon size={22} className={on ? 'text-white' : 'text-[#4d6fc9]'} />
                <div>
                  <div className="text-[15px] font-medium">{key}</div>
                  <div className={`text-xs ${on ? 'text-indigo-100' : 'text-gray-600'}`}>{desc}</div>
                </div>
              </button>
            );
          })}
          {picked.includes('Customize') && (
            <input autoFocus value={custom} onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && ready) onNext(picked, custom.trim()); }}
              placeholder="e.g. typography, corner roundness, spacing"
              className="w-full rounded-md px-3 py-2 text-sm outline-none" />
          )}
        </div>
        <div className="text-[11px] text-indigo-100 mt-2">Pick one or more.</div>
        <div className="flex gap-3 mt-4">
          <button className="flex-1 rounded-md bg-[#3aa0e0] hover:bg-[#2b90d0] text-white py-2.5" onClick={onCancel}>Cancel</button>
          <button className="flex-1 rounded-md bg-[#3aa0e0] hover:bg-[#2b90d0] text-white py-2.5 disabled:opacity-50" disabled={!ready}
            onClick={() => onNext(picked, custom.trim())}>Next</button>
        </div>
      </div>
    </div>
  );
}
