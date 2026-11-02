import { useState } from "react";
import { Paintbrush, LayoutList, Plus, MoreVertical, Check } from "lucide-react";
import { Modal } from "./ui.jsx";

// "Pick Blending Option" (Figure 1 C): shown after a cropped example section is
// dropped on a source UI. Several aspects can be picked at once (in §2, Fuji
// picks color, layout and content together).
const OPTIONS = [
  { key: "Color", icon: Paintbrush, text: "Apply the colors to your design" },
  { key: "Layout", icon: LayoutList, text: "Arrange and structure your design elements" },
  { key: "Content", icon: Plus, text: "Add the selected UI elements" },
  { key: "Customize", icon: MoreVertical, text: "Specify a new blending aspect" },
];

export default function BlendDialog({ drop, onCancel, onNext }) {
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState("");
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const ready = picked.length > 0 && (!picked.includes("Customize") || custom.trim());
  const ordered = OPTIONS.map((o) => o.key).filter((k) => picked.includes(k));

  return (
    <Modal onClose={onCancel} className="w-[340px] rounded-sm bg-[#4a5196] p-6 text-white shadow-2xl">
      <h2 className="text-center text-[19px] font-medium">Pick Blending Option</h2>
      <div className="mt-3 flex items-center gap-3 rounded-md bg-white/10 p-2 text-xs text-indigo-100">
        <img src={drop.thumb} className="h-12 w-12 shrink-0 rounded border border-white/30 bg-white object-contain" />
        <div className="min-w-0">
          <div>From <b>{drop.exampleTitle}</b></div>
          <div className="truncate">into <code className="text-white">{drop.targetLabel}</code></div>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {OPTIONS.map(({ key, icon: Icon, text }) => {
          const on = picked.includes(key);
          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => toggle(key)}
                className={`flex w-full items-center gap-4 rounded px-4 py-3 text-left shadow transition-colors ${
                  on ? "bg-[#2e3266] text-white ring-2 ring-white/70" : "bg-white text-gray-900 hover:bg-indigo-50"
                }`}
              >
                <Icon className={`h-6 w-6 shrink-0 ${on ? "text-white" : "text-[#4a5196]"}`} />
                <span className="flex-1">
                  <span className="block text-[17px] font-medium">{key}</span>
                  <span className={`block text-[13px] leading-snug ${on ? "text-indigo-100" : "text-gray-600"}`}>{text}</span>
                </span>
                {on && <Check className="h-5 w-5 shrink-0" />}
              </button>
              {key === "Customize" && on && (
                <input
                  autoFocus
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ready && onNext(ordered, custom)}
                  placeholder="e.g. typography, rounded corners and shadows"
                  className="mt-2 w-full rounded bg-white px-3 py-2 text-sm text-gray-900 outline-none"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex gap-4">
        <button type="button" onClick={onCancel} className="flex-1 rounded bg-[#3d9be9] py-2.5 text-[16px] font-medium hover:bg-[#2f8ad6]">
          Cancel
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => onNext(ordered, custom)}
          className="flex-1 rounded bg-[#3d9be9] py-2.5 text-[16px] font-medium hover:bg-[#2f8ad6] disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </Modal>
  );
}
