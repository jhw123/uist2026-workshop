import { useState } from "react";
import { Brush, LayoutList, Plus, MoreVertical } from "lucide-react";

const OPTIONS = [
  { key: "Color", icon: Brush, desc: "Apply the colors to your design" },
  { key: "Layout", icon: LayoutList, desc: "Arrange and structure your design elements" },
  { key: "Content", icon: Plus, desc: "Add the selected UI elements" },
  { key: "Customize", icon: MoreVertical, desc: "Specify a new blending aspect" },
];

// "Pick Blending Option" dialog (C in Figure 1), shown after a drop.
// Several aspects can be picked together (the scenario picks color, layout and content).
export default function BlendDialog({ info, onCancel, onNext }) {
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState("");
  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const ok = picked.length > 0 && (!picked.includes("Customize") || custom.trim());

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-indigo-800 rounded-lg shadow-2xl w-[330px] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-white text-lg text-center mb-3">Pick Blending Option</h2>
        <div className="flex gap-2 items-center mb-4 bg-indigo-900/50 rounded p-2">
          <img src={info.image} className="w-14 h-14 object-contain bg-white rounded" />
          <p className="text-[11px] text-indigo-100 leading-snug line-clamp-3 font-mono break-all">
            into: {info.targetHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "selected element"}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {OPTIONS.map(({ key, icon: Icon, desc }) => {
            const on = picked.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`flex items-center gap-4 text-left rounded-md px-4 py-3 transition ${on ? "bg-gray-800 text-white ring-2 ring-white/70" : "bg-white text-gray-900 hover:bg-indigo-50"}`}
              >
                <Icon size={22} className={on ? "text-white" : "text-blue-500"} />
                <span>
                  <span className="block text-lg font-medium">{key}</span>
                  <span className={`block text-sm ${on ? "text-gray-300" : "text-gray-600"}`}>{desc}</span>
                </span>
              </button>
            );
          })}
          {picked.includes("Customize") && (
            <textarea
              autoFocus
              className="rounded p-2 text-sm"
              rows={2}
              placeholder="e.g. the rounded corners and shadows"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
          )}
        </div>
        <div className="flex justify-between gap-4 mt-5">
          <button className="flex-1 bg-sky-400 text-white text-lg py-2 rounded hover:bg-sky-500" onClick={onCancel}>Cancel</button>
          <button className="flex-1 bg-sky-400 text-white text-lg py-2 rounded hover:bg-sky-500 disabled:opacity-50" disabled={!ok} onClick={() => onNext(picked, custom.trim())}>Next</button>
        </div>
      </div>
    </div>
  );
}
