// Prompts. The global and drag-and-drop prompts follow the paper's Appendix
// A.3 nearly word for word. Changes: the stock photo names are .svg, and
// updatedCode is asked for as a JSON string so the answer parses as JSON.
// The semantic diff and Fix Render prompts are not given in the paper; they
// are our own.
import { ICON_NAMES } from "./icons";

const ICON_LIST = ICON_NAMES.join(", ");

const STOCK_RULE = `- there are a few stock photos for use under the folder /stock/, they are named after their orientation: landscape0.svg, landscape1.svg, landscape2.svg, landscape3.svg, portrait0.svg, portrait1.svg, portrait2.svg, square0.svg, square1.svg. Do not use any other images. Do not use placeholder image paths.`;

const FORMAT = `Return result in the below format, make sure you use json:
{
"designExplanation": // explain the design of the screenshot image, focus on layout and color, be really concise, less than 30 words
"differences": // briefly summarize the differences between the reference image and the code, focus on layout orientation, spacing, color theme, font, etc.
"updatedCode": "() => {...}" // a JSON string: return the whole component for the entire screen, with the updates;
// a list of objects listing the changes made, use the tailwind classes to indicate the changes
"categorizedChanges": [
{
"category": "", // summarize the category of the below changes, group changes together semantically, e.g. "Color: Changed light to dark theme", "Layout: Increased spacing between elements", "Visual details: Increased corner roundedness", "Image: Decreased image size", "Font: Changed font appearance", etc.
"changes": [{
"type": "color",
"before": // the tailwind class before the change,
"after": // the tailwind class after the change
}]
}
]
}

here is a good example of the changes field:
"categorizedChanges": [
{
"category": "Color: Changed light to dark theme",
"changes": [{"type": "color", "before": "bg-black", "after": "bg-white"},
{"type": "color", "before": "text-white", "after": "text-gray-900"},
{"type": "border", "before": "", "after": "border-2 border-gray-300/90"}] // you can use empty before field to indicate addition of new classes; add as many as appropriate
},
{
"category": "Font: Changed font appearance",
"changes": [{"type": "color", "before": "bg-black", "after": "bg-white"},
{"type": "font", "before": "text-sm", "after": "text-lg"}] // add as many as appropriate
}
]`;

export function globalBlendPrompt(code) {
  return `Here is my react and tailwind code:

${code}

Help me create a new component page that blends the content of the above code with the visual style, layout, and appearance of the reference image. Change only the source code corresponding to this, and no other sections.

Preserve the content in the UI of the code, follow the layout and visual style of the reference image, optionally add more content where the original code's content cannot fill in all fields in the reference image's layout. Do not use content from the reference image, just use its layout and visual style.

A few rules:
- First, explain in concise language the design of the reference screenshot. Use it as a basis of your generation.
- Make sure all text is legible on the background
- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Base your later generation of categorizedChanges based on these categories.
- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};
- when adding icons, pick from this list of lucide react icons, do not use others: ${ICON_LIST}
${STOCK_RULE}
- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".

${FORMAT}`;
}

// aspects: subset of ["Color", "Layout", "Content", "Customize"]
export function dragDropPrompt(code, aspects, customText, targetHtml) {
  const named = aspects
    .filter((a) => a !== "Customize")
    .map((a) => (a === "Content" ? "content (addition mode: add the selected UI elements)" : a.toLowerCase()));
  if (aspects.includes("Customize") && customText) named.push(customText);
  const aspectText = named.join(", ") || "design";
  return `Here is my react and tailwind code:

${code}

blend the ${aspectText} of the reference image into ${targetHtml}. Change sections of the source code corresponding to this, as well as sections that are of similar layout or screen position to this. For example, don't just apply to one element in a list, but apply to all list elements with similar layouts. Sometimes the specific code piece does not correspond to parts of the source code, because it's rendered HTML based on the source React code. In that case, you need to identify the original code pieces from the source and modify them.

A few rules:
- First, explain in concise language the layout of the reference screenshot. Use it as a basis of your generation.
- Make sure all text is legible on the background.
- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Pay attention to ${aspects.filter((m) => m !== "Customize").join(" ")}${customText ? " " + customText : ""}. Base your later generation of categorizedChanges based on these categories.
- Never directly pulls content from the reference to update the source code. For blending color and layout, preserve all original content in the UI for source code, only change/add the original content when it's really necessary for following a layout. When you blend in the addition mode, generate content based on the context of the source code.
- Do not use list and .map functions to represent lists. Just generate HTML elements for each of the list items.
- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};
- when adding icons, pick from this list of lucide react icons, do not use others: ${ICON_LIST}
${STOCK_RULE}
- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".
- When creating a bottom navigation bar, use "absolute bottom-0" instead of "fixed bottom-0".
- Try to make colors and styles consistent and harmonious with the rest of the component.

${FORMAT}`;
}

// Our own prompt: re-apply only the semantic diff entries the user kept on.
export function semanticDiffPrompt(originalCode, blendedCode, categories) {
  const lines = categories
    .map((c) => {
      const head = `- [${c.enabled ? "ON" : "OFF"}] ${c.category}`;
      const ch = (c.changes || [])
        .map((x) => {
          const on = c.enabled && x.enabled !== false;
          const after = x.editedAfter ?? x.after;
          const edited = x.editedAfter != null && x.editedAfter !== x.after ? ` (user edited; originally "${x.after}")` : "";
          return `    - [${on ? "ON" : "OFF"}] ${x.type}: "${x.before}" -> "${after}"${edited}`;
        })
        .join("\n");
      return ch ? `${head}\n${ch}` : head;
    })
    .join("\n");
  return `Here is my ORIGINAL react and tailwind code:

${originalCode}

Here is a BLENDED version of the same component, made by blending in a reference design:

${blendedCode}

The blend made the following semantic changes, grouped by category. Each category and each individual change is marked ON (keep it) or OFF (revert it). Where the user edited a change, use the edited "after" value.

${lines}

Produce a new version of the component that keeps every change marked ON (with any edited values) and reverts every change marked OFF to how the ORIGINAL code looked. Everything not covered by these changes should stay as in the BLENDED version. Keep the content of the UI.

Rules:
- only use tailwind, react, and lucide icons from this list: ${ICON_LIST}. Do not include any import or export statements, just use a simple component definition () => {};
- only use images that already appear in the code.

Return JSON: {"updatedCode": "() => {...}" }`;
}

// Our own prompt for the Fix Render button.
export function fixRenderPrompt(code, error) {
  return `Here is my react and tailwind component code:

${code}

${error ? `It fails to render with this error:\n${error}\n\nFix the code so it renders.` : "It renders, but fix any broken layout, overflowing or illegible text, and misaligned elements."} Keep the design and content otherwise unchanged.

Rules:
- only use tailwind, react, and lucide icons from this list: ${ICON_LIST}. Do not include any import or export statements, just use a simple component definition () => {};
- only use images that already appear in the code.

Return JSON: {"updatedCode": "() => {...}" }`;
}
