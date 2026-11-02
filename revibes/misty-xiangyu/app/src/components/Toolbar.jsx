import { useEffect, useRef, useState } from "react";
import { ImagePlus, Code2, ChevronDown, Trash2 } from "lucide-react";
import { STARTERS, SAMPLE_EXAMPLES } from "../lib/starters";
import { fileToDataUrl } from "../lib/image";
import { bridgeHealth, BRIDGE_URL } from "../lib/llm";

function Menu({ label, icon: Icon, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-gray-300 text-sm hover:bg-gray-50" onClick={() => setOpen((o) => !o)}>
        <Icon size={15} /> {label} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute z-40 top-full left-0 pt-1">
          <div className="bg-white border border-gray-200 rounded shadow-lg py-1 min-w-[240px]" onClick={() => setOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
}
const Item = ({ onClick, children }) => (
  <button className="block w-full text-left px-3 py-1.5 text-sm hover:bg-violet-50" onClick={onClick}>{children}</button>
);

export default function Toolbar({ addExample, addSource, clearCanvas }) {
  const fileRef = useRef(null);
  const [health, setHealth] = useState(undefined);

  useEffect(() => {
    const check = async () => setHealth(await bridgeHealth());
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  const onFiles = async (e) => {
    for (const f of e.target.files) await addExample(await fileToDataUrl(f), f.name);
    e.target.value = "";
  };

  const pasteCode = () => {
    const code = prompt("Paste your React + Tailwind component, written as () => { return (...) }");
    if (code) addSource(code, "Source UI");
  };

  return (
    <div className="h-12 shrink-0 flex items-center gap-3 px-4 bg-white border-b border-gray-200 z-10">
      <div className="font-bold text-violet-800 text-lg mr-2" title="Mixing Interfaces by Semantic Transformation. Plus Y.">Misty</div>
      <Menu label="Add example" icon={ImagePlus}>
        <Item onClick={() => fileRef.current.click()}>Upload screenshot or sketch…</Item>
        <div className="border-t my-1" />
        <div className="px-3 py-1 text-[11px] text-gray-400 uppercase">Samples</div>
        {SAMPLE_EXAMPLES.map((s) => (
          <Item key={s.url} onClick={() => addExample(s.url, s.name)}>{s.name}</Item>
        ))}
      </Menu>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <Menu label="Add source UI" icon={Code2}>
        {STARTERS.map((s) => (
          <Item key={s.name} onClick={() => addSource(s.code, `Source UI: ${s.name}`)}>{s.name}</Item>
        ))}
        <div className="border-t my-1" />
        <Item onClick={pasteCode}>Paste my own code…</Item>
      </Menu>
      <span className="text-xs text-gray-400 hidden xl:inline">Tip: paste or drop an image anywhere to add it as an example.</span>
      <div className="flex-1" />
      <span
        className={`text-xs px-2 py-1 rounded ${health ? "bg-green-50 text-green-700" : health === null ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-500"}`}
        title={`LLM bridge at ${BRIDGE_URL}. The paper used GPT-4o; the bridge's model answers instead.`}
      >
        {health ? `LLM bridge: ${health.backend || "ok"}${health.model ? ` (${health.model})` : ""}` : health === null ? "LLM bridge offline: run python3 llm-bridge/bridge.py claude" : "Checking LLM bridge…"}
      </span>
      <button className="flex items-center gap-1 text-sm text-gray-500 hover:text-red-600" onClick={clearCanvas} title="Clear canvas">
        <Trash2 size={15} /> Clear
      </button>
    </div>
  );
}
