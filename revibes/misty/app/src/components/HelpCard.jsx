import { X } from "lucide-react";

// A short how-to, shown on first launch and from the toolbar.
export default function HelpCard({ onClose }) {
  return (
    <div className="absolute left-4 top-4 z-10 w-[340px] rounded-xl bg-white/95 p-4 text-[13px] text-gray-700 shadow-xl ring-1 ring-[#e0dbf3] backdrop-blur">
      <div className="mb-2 flex items-center">
        <h3 className="flex-1 font-semibold text-[#3f3a7a]">Blending examples into your UI</h3>
        <button onClick={onClose} className="rounded p-1 hover:bg-gray-100"><X className="h-4 w-4" /></button>
      </div>
      <ol className="list-decimal space-y-1.5 pl-4">
        <li><b>Global blend:</b> drag from the handle on the right of a <i>Reference Example</i> onto a <i>Code Render</i> node. Misty creates a new node that restyles your UI after the example.</li>
        <li><b>Targeted blend:</b> draw a box on an example, press <i>Done</i>, then drag the box onto part of a source UI (it highlights; hold Shift for a larger area). Pick Color, Layout, Content or Customize.</li>
        <li><b>Refine:</b> switch categories in <i>Applied Changes</i> on or off, or open one to change individual classes and colors.</li>
        <li><b>Edit code:</b> “Show Code” opens the editor on the right. “Fix Render” repairs broken output; “Regenerate” reruns a blend.</li>
      </ol>
      <p className="mt-2 text-[12px] text-gray-500">Add your own examples (screenshots or photos of sketches) with “Add example image”, drag-and-drop, or paste. Add your code with “Add source code”.</p>
    </div>
  );
}
