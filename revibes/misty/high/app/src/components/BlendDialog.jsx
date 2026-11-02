import React, { useEffect, useRef, useState } from "react";
import { Paintbrush, LayoutList, Plus, MoreVertical, Check } from "lucide-react";

const OPTIONS = [
  { key: "Color", icon: Paintbrush, desc: "Apply the colors to your design" },
  { key: "Layout", icon: LayoutList, desc: "Arrange and structure your design elements" },
  { key: "Content", icon: Plus, desc: "Add the selected UI elements" },
  { key: "Customize", icon: MoreVertical, desc: "Specify a new blending aspect" },
];

/** "Pick Blending Option" (C in Figure 1), shown after dropping an example section. */
export default function BlendDialog({ request, onCancel, onNext }) {
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState("");
  const customRef = useRef(null);

  useEffect(() => {
    setPicked([]);
    setCustom("");
  }, [request]);

  useEffect(() => {
    if (picked.includes("Customize")) customRef.current?.focus();
  }, [picked]);

  useEffect(() => {
    const k = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onCancel]);

  if (!request) return null;
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const canNext = picked.length > 0 && (!picked.includes("Customize") || custom.trim() || picked.length > 1);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/20" onMouseDown={onCancel}>
      <div className="w-[290px] rounded-lg bg-[#4f5a9c] p-5 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-center text-lg font-medium text-white">Pick Blending Option</h2>
        <div className="mb-3 flex items-center gap-2 rounded-md bg-white/10 p-2">
          <img src={request.imageUrl} alt="" className="h-12 w-12 rounded bg-white object-contain" />
          <div className="min-w-0 text-[11px] leading-snug text-indigo-100">
            <div>
              From <span className="font-medium text-white">{request.exampleName}</span>
            </div>
            <div className="truncate" title={request.targetLabel}>
              into <span className="font-medium text-white">{request.targetLabel || "the screen"}</span>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {OPTIONS.map(({ key, icon: Icon, desc }) => {
            const on = picked.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`relative flex w-full items-center gap-4 rounded-md px-4 py-3 text-left transition ${
                  on ? "bg-[#2f3566] text-white ring-2 ring-white/70" : "bg-white text-gray-900 hover:bg-indigo-50"
                }`}
              >
                <Icon size={22} className={on ? "text-white" : "text-[#4f5a9c]"} />
                <div>
                  <div className="text-[16px] font-medium">{key}</div>
                  <div className={`text-[12px] leading-tight ${on ? "text-indigo-100" : "text-gray-600"}`}>{desc}</div>
                </div>
                {on && <Check size={16} className="absolute right-2 top-2 text-white" />}
              </button>
            );
          })}
          {picked.includes("Customize") && (
            <textarea
              ref={customRef}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="e.g. the rounded image corners, the typography, the card shadow"
              className="h-16 w-full resize-none rounded-md border-0 p-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-white"
            />
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-indigo-100/80">Pick one or more aspects to blend.</p>
        <div className="mt-3 flex gap-3">
          <button className="flex-1 rounded-md bg-sky-500 py-2.5 text-white hover:bg-sky-600" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="flex-1 rounded-md bg-sky-500 py-2.5 text-white hover:bg-sky-600 disabled:opacity-40"
            disabled={!canNext}
            onClick={() => onNext({ aspects: picked, custom: custom.trim() })}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
