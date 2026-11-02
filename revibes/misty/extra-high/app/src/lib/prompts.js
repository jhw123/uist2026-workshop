// Prompts. The global and drag-and-drop blending prompts follow the paper's
// Appendix A.3 word for word, with its placeholders filled in. The prompts for
// toggling a semantic diff and for "Fix Render" are not printed in the paper;
// they are written here in the same style (see changes/v1.md, Assumptions).
import { PROMPT_ICONS } from "./scope.js";

export const SYSTEM =
  "You are an expert frontend developer and UI designer. You write React components styled with Tailwind CSS " +
  "for single mobile screens, and you blend design examples into existing UI code. " +
  "Reason step by step through the fields in the order requested, then answer with valid JSON only.";

const ICON_LIST = PROMPT_ICONS.join(", ");
const STOCK_NOTE =
  "there are a few stock photos for use under the folder /stock/, they are named after their orientation, like landscape0.jpg, landscape1.jpg, portrait0.jpg, etc. Do not use any other images. Do not use placeholder image paths. " +
  "(Available: /stock/landscape0.jpg to /stock/landscape5.jpg and /stock/portrait0.jpg to /stock/portrait5.jpg.)";

const FORMAT = `Return result in the below format, make sure you use json:

{
"designExplanation": // explain the design of the screenshot image, focus on layout and color, be really concise, less than 30 words
"differences": // briefly summarize the differences between the reference image and the code, focus on layout orientation, spacing, color theme, font, etc.
updatedCode: \`() => {}\` // return the whole component for the entire screen, with the updates;
// a list of objects listing the changes made, use the tailwind classes to indicate the changes
categorizedChanges: [
{
category: "", // summarize the category of the below changes, group changes together semantically, e.g. "Color: Changed light to dark theme", "Layout: Increased spacing between elements", "Visual details: Increased corner roundedness", "Image: Decreased image size", "Font: Changed font appearance", etc.
changes: [{
type: "color",
before": // the tailwind class before the change,
"after": // the tailwind class after the change
}]
}
]
}

here is a good example of the changes field:

categorizedChanges: [
{
category: "Color: Changed light to dark theme",
changes: [{
type: "color",
before: "bg-black",
after: "bg-white"
}, {
type: "color",
before: "text-white",
after: "text-gray-900"
}, {
type: "border",
before: "", // you can use empty before field to indicate addition of new classes
after: "border-2 border-gray-300/90"
}, ...] // add as many as appropriate,
},
{
category: "Font: Changed font appearance",
changes: [{
type: "color",
before: "bg-black",
after: "bg-white"
}, {
type: "font",
before: "text-sm",
after: "text-lg"
}, ...] // add as many as appropriate,
},
]

The answer must be strictly valid JSON (double-quoted keys, no comments, updatedCode as a JSON string).`;

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
- ${STOCK_NOTE}
- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".

${FORMAT}`;
}

export const ASPECTS = ["Color", "Layout", "Content", "Customize"];

function joinWords(list) {
  if (list.length <= 1) return list.join("");
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

export function aspectPhrase(aspects, custom) {
  const words = aspects.filter((a) => a !== "Customize").map((a) => a.toLowerCase());
  if (aspects.includes("Customize") && custom?.trim()) words.push(custom.trim());
  return joinWords(words);
}

export function localBlendPrompt(code, aspects, custom, targetCodeDropped) {
  const blendMode = aspects;
  // Not in the paper's printed prompt: says what the dialog's "Content: Add the
  // selected UI elements" option means, which the paper calls the addition mode.
  const contentNote = aspects.includes("Content")
    ? `\n\nBecause "content" is selected, this is the addition mode: add the UI element(s) shown in the reference image (for example a button, a header or a section) as new elements in the source UI, placed at or right next to this location, with text that fits the source UI's context. Do not only restyle existing elements.`
    : "";
  return `Here is my react and tailwind code:

${code}

blend the ${aspectPhrase(aspects, custom)} of the reference image into ${targetCodeDropped}. Change sections of the source code corresponding to this, as well as sections that are of similar layout or screen position to this. For example, don't just apply to one element in a list, but apply to all list elements with similar layouts. Sometimes the specific code piece does not correspond to parts of the source code, because it's rendered HTML based on the source React code. In that case, you need to identify the original code pieces from the source and modify them.${contentNote}

A few rules:

- First, explain in concise language the layout of the reference screenshot. Use it as a basis of your generation.
- Make sure all text is legible on the background.
- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Pay attention to ${blendMode.filter((mode) => mode !== "Customize").join(" ")}${aspects.includes("Customize") && custom?.trim() ? ` ${custom.trim()}` : ""}. Base your later generation of categorizedChanges based on these categories.
- Never directly pulls content from the reference to update the source code. For blending color and layout, preserve all original content in the UI for source code, only change/add the original content when it's really necessary for following a layout. When you blend in the addition mode, generate content based on the context of the source code.
- Do not use list and .map functions to represent lists. Just generate HTML elements for each of the list items.
- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};
- when adding icons, pick from this list of lucide react icons, do not use others: ${ICON_LIST}
- ${STOCK_NOTE}
- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".
- When creating a bottom navigation bar, use "absolute bottom-0" instead of "fixed bottom-0".
- Try to make colors and styles consistent and harmonious with the rest of the component.

${FORMAT}`;
}

const CODE_RULES = `- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};
- when adding icons, pick from this list of lucide react icons, do not use others: ${ICON_LIST}
- ${STOCK_NOTE}
- When creating a bottom navigation bar, use "absolute bottom-0" instead of "fixed bottom-0".`;

function describeChanges(cats) {
  return cats
    .map((c) => {
      const list = (c.changes || [])
        .map((ch) => `${ch.type || "change"}: "${ch.before || ""}" -> "${ch.after || ""}"`)
        .join("; ");
      return `- [${c.enabled ? "ON" : "OFF"}] ${c.category}${list ? `  (class changes: ${list})` : ""}`;
    })
    .join("\n");
}

// Semantic diff toggle (paper §4.3: toggling triggers another model call).
export function togglePrompt({ currentCode, originalCode, categories, toggled, on }) {
  return `Here is my react and tailwind code:

${currentCode}

It was produced by blending a reference image into this original code:

${originalCode}

The changes of that blend are grouped into semantic categories. [ON] means the user wants the category applied, [OFF] means the user wants it reverted to the original:

${describeChanges(categories)}

The user just switched ${on ? "ON" : "OFF"} the category "${toggled.category}".
${on
    ? "Apply this category's changes to the code again (use its class changes above as the guide), and keep everything else exactly as it is now."
    : "Revert this category's changes so that those aspects of the UI look as they did in the original code, and keep every other change exactly as it is now."}
Do not change anything that does not belong to this category.

A few rules:

${CODE_RULES}

Return result in this format, make sure you use valid json:
{ "updatedCode": "() => { ... }" }`;
}

// Fine-grained edit fallback when the classes cannot be swapped in place.
export function editClassPrompt({ currentCode, category, before, after }) {
  return `Here is my react and tailwind code:

${currentCode}

In the "${category}" change, the user wants to use the tailwind classes "${after}" instead of "${before}". Update the code accordingly, only where these classes were applied for this change, and keep everything else exactly as it is.

A few rules:

${CODE_RULES}

Return result in this format, make sure you use valid json:
{ "updatedCode": "() => { ... }" }`;
}

export function fixPrompt({ code, error }) {
  return `Here is my react and tailwind code:

${code}

${error
    ? `It fails to render with this error:\n\n${error}\n\nFix the code so that it renders.`
    : "It renders, but parts of it may display incorrectly on a 375px wide mobile screen (overflowing or overlapping elements, illegible text, broken images, misaligned items). Fix such rendering problems."}
Keep the design, layout and content otherwise exactly as they are.

A few rules:

${CODE_RULES}

Return result in this format, make sure you use valid json:
{ "updatedCode": "() => { ... }" }`;
}
