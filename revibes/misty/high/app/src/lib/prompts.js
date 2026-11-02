// Prompts from Appendix A.3 of the paper, kept word for word where the paper gives them.
// Our edits are marked [revibe]: the paper's output format puts updatedCode in backticks,
// which is not valid JSON, so we ask for a JSON string; and we list the stock photo names
// that exist in this rebuild.
import { ICON_NAMES } from "./icons.js";
import { STOCK_NAMES } from "./stock.js";

const ICONS = () => ICON_NAMES.join(", ");
const STOCK_LINE = () =>
  `- there are a few stock photos for use under the folder /stock/, they are named after their orientation, like landscape0.jpg, landscape1.jpg, portrait0.jpg, etc. Do not use any other images. Do not use placeholder image paths. [revibe] The available files are: ${STOCK_NAMES.join(", ")}. Use them as "/stock/<name>".`;

const FORMAT = `Return result in the below format, make sure you use json:

{

"designExplanation": // explain the design of the screenshot image, focus on layout and color, be really concise, less than 30 words

"differences": // briefly summarize the differences between the reference image and the code, focus on layout orientation, spacing, color theme, font, etc.

"updatedCode": "() => {}" // return the whole component for the entire screen, with the updates; [revibe] as one JSON string, with newlines and quotes escaped

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

[revibe] Your whole answer must be a single valid JSON object (no comments, no markdown).`;

export const SYSTEM =
  "You are Misty, a UI prototyping assistant that performs conceptual blending of example UI images into React + Tailwind CSS code. Answer with JSON only.";

/** A.3.1 Global blending */
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

- when adding icons, pick from this list of lucide react icons, do not use others: ${ICONS()}

${STOCK_LINE()}

- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".

${FORMAT}`;
}

/** Words for the aspects picked in the "Pick Blending Option" dialog. */
export function aspectPhrase(aspects, custom) {
  const words = [];
  if (aspects.includes("Color")) words.push("color");
  if (aspects.includes("Layout")) words.push("layout");
  if (aspects.includes("Content")) words.push("content");
  if (aspects.includes("Customize") && custom?.trim()) words.push(custom.trim());
  if (words.length === 0) return "color and layout";
  if (words.length === 1) return words[0];
  return words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
}

/** A.3.2 Drag-and-drop blending */
export function dropBlendPrompt(code, aspects, custom, targetCodeDropped) {
  const blendMode = [...aspects];
  const attention = blendMode.filter((mode) => mode !== "Customize").join(" ") + (custom?.trim() ? ` ${custom.trim()}` : "");
  const addition = aspects.includes("Content")
    ? `\n[revibe] The user picked "Content" (addition mode): add the UI elements shown in the reference image at the drop target, as new elements.`
    : "";
  return `Here is my react and tailwind code:

${code}

blend the ${aspectPhrase(aspects, custom)} of the reference image into ${targetCodeDropped}. Change sections of the source code corresponding to this, as well as sections that are of similar layout or screen position to this. For example, don't just apply to one element in a list, but apply to all list elements with similar layouts. Sometimes the specific code piece does not correspond to parts of the source code, because it's rendered HTML based on the source React code. In that case, you need to identify the original code pieces from the source and modify them.${addition}

A few rules:

- First, explain in concise language the layout of the reference screenshot. Use it as a basis of your generation.

- Make sure all text is legible on the background.

- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Pay attention to ${attention}. Base your later generation of categorizedChanges based on these categories.

- Never directly pulls content from the reference to update the source code. For blending color and layout, preserve all original content in the UI for source code, only change/add the original content when it's really necessary for following a layout. When you blend in the addition mode, generate content based on the context of the source code.

- Do not use list and .map functions to represent lists. Just generate HTML elements for each of the list items.

- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};

- when adding icons, pick from this list of lucide react icons, do not use others: ${ICONS()}

${STOCK_LINE()}

- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".

- When creating a bottom navigation bar, use "absolute bottom-0" instead of "fixed bottom-0".

- Try to make colors and styles consistent and harmonious with the rest of the component.

${FORMAT}`;
}

/**
 * Semantic diff toggle. The paper says toggling "triggers another API call to GPT-4o to
 * update the code" but does not give this prompt; this one is ours.
 */
export function togglePrompt({ baseCode, blendedCode, currentCode, categories }) {
  const lines = categories
    .map((c) => {
      const det = c.changes
        .map((ch) => `    - ${ch.type}: "${ch.before}" → "${ch.on ? ch.current : ch.before}"${ch.on ? "" : " (this single change is OFF)"}`)
        .join("\n");
      return `- [${c.on ? "ON" : "OFF"}] ${c.category}${det ? "\n" + det : ""}`;
    })
    .join("\n");
  return `A UI blending operation changed the ORIGINAL code below into the BLENDED code. The changes were grouped into semantic categories. The user has now toggled some categories (or single changes) on or off. The CURRENT code is what the user sees now (it may include their own manual edits).

ORIGINAL code (before the blend):

${baseCode}

BLENDED code (all categories on):

${blendedCode}

CURRENT code:

${currentCode}

Categories of change, with their state:

${lines}

Starting from the CURRENT code, produce updated code in which every category marked ON looks as it does in the BLENDED code, and every category marked OFF is reverted to how the ORIGINAL code looked for that aspect. Single changes marked OFF are reverted too; a change whose target class differs from the BLENDED code uses the new class given above. Keep everything else in the CURRENT code exactly as it is, including content and manual edits. Make sure all text stays legible on the background.

Rules: only use tailwind, react, and lucide react icons; no import or export statements; a simple component definition () => {}. Only use images that already appear in the code or under /stock/.

Return a single valid JSON object: {"updatedCode": "() => { ... }"} with the whole component as one JSON string.`;
}

/** "Fix Render" button (Figure 1 D). Our prompt; the paper does not give one. */
export function fixPrompt(code, error) {
  return `This React + Tailwind component does not render correctly${error ? `. The renderer reports this error:\n\n${error}\n` : " (the user pressed Fix Render: fix syntax errors, runtime errors, and visual problems such as overflowing or illegible text)."}

${code}

Fix the problem while changing as little as possible. Rules: only use tailwind, react, and lucide react icons (${ICONS()}); no import or export statements; a simple component definition () => {}; images only from /stock/ (${STOCK_NAMES.join(", ")}).

Return a single valid JSON object: {"updatedCode": "() => { ... }"} with the whole component as one JSON string.`;
}
