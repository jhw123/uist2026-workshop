// The prompts from Appendix A.3 of the paper, with placeholders filled in.
import { ICON_NAMES } from './icons'

const ICONS = ICON_NAMES.join(', ')

const RETURN_FORMAT = `Return result in the below format, make sure you use json:

{
"designExplanation": // explain the design of the screenshot image, focus on layout and color, be really concise, less than 30 words
"differences": // briefly summarize the differences between the reference image and the code, focus on layout orientation, spacing, color theme, font, etc.
"updatedCode": "() => {}" // return the whole component for the entire screen, with the updates, as one JSON string;
// a list of objects listing the changes made, use the tailwind classes to indicate the changes
"categorizedChanges": [
{
"category": "", // summarize the category of the below changes, group changes together semantically, e.g. "Color: Changed light to dark theme", "Layout: Increased spacing between elements", "Visual details: Increased corner roundedness", "Image: Decreased image size", "Font: Changed font appearance", etc.
"changes": [{
"type": "color",
"before": "", // the tailwind class before the change,
"after": "" // the tailwind class after the change
}]
}
]
}

here is a good example of the changes field:

"categorizedChanges": [
{
"category": "Color: Changed light to dark theme",
"changes": [{ "type": "color", "before": "bg-black", "after": "bg-white" }, { "type": "color", "before": "text-white", "after": "text-gray-900" }, { "type": "border", "before": "", "after": "border-2 border-gray-300/90" }]
},
{
"category": "Font: Changed font appearance",
"changes": [{ "type": "font", "before": "text-sm", "after": "text-lg" }]
}
]

The whole reply must be a single valid JSON object. Put the component code in the "updatedCode" string with newlines escaped. Do not wrap the reply in a code fence.`

export function globalBlendPrompt(code: string): string {
  return `Here is my react and tailwind code:

${code}

Help me create a new component page that blends the content of the above code with the visual style, layout, and appearance of the reference image. Change only the source code corresponding to this, and no other sections.

Preserve the content in the UI of the code, follow the layout and visual style of the reference image, optionally add more content where the original code's content cannot fill in all fields in the reference image's layout. Do not use content from the reference image, just use its layout and visual style.

A few rules:

- First, explain in concise language the design of the reference screenshot. Use it as a basis of your generation.

- Make sure all text is legible on the background

- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Base your later generation of categorizedChanges based on these categories.

- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};

- when adding icons, pick from this list of lucide react icons, do not use others: ${ICONS}

- there are a few stock photos for use under the folder /stock/, they are named after their orientation, like landscape0.jpg, landscape1.jpg, portrait0.jpg, etc. (available: landscape0-3.jpg, portrait0-3.jpg, square0-1.jpg). Do not use any other images. Do not use placeholder image paths.

- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".

${RETURN_FORMAT}`
}

export function dndBlendPrompt(code: string, aspects: string[], targetHtml: string, customAspect?: string): string {
  const named = aspects.filter((a) => a !== 'Customize')
  const aspectText = [...named.map((a) => a.toLowerCase()), ...(customAspect ? [customAspect] : [])].join(', ')
  return `Here is my react and tailwind code:

${code}

blend the ${aspectText} of the reference image into the following target (rendered HTML of the part of my UI the reference was dropped on):

${targetHtml}

Change sections of the source code corresponding to this, as well as sections that are of similar layout or screen position to this. For example, don't just apply to one element in a list, but apply to all list elements with similar layouts. Sometimes the specific code piece does not correspond to parts of the source code, because it's rendered HTML based on the source React code. In that case, you need to identify the original code pieces from the source and modify them.

A few rules:

- First, explain in concise language the layout of the reference screenshot. Use it as a basis of your generation.

- Make sure all text is legible on the background.

- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Pay attention to ${named.join(' ')}${customAspect ? ' ' + customAspect : ''}. Base your later generation of categorizedChanges based on these categories.

- Never directly pulls content from the reference to update the source code. For blending color and layout, preserve all original content in the UI for source code, only change/add the original content when it's really necessary for following a layout. When you blend in the addition mode (Content), generate content based on the context of the source code.

- Do not use list and .map functions to represent lists. Just generate HTML elements for each of the list items.

- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};

- when adding icons, pick from this list of lucide react icons, do not use others: ${ICONS}

- there are a few stock photos for use under the folder /stock/, they are named after their orientation, like landscape0.jpg, landscape1.jpg, portrait0.jpg, etc. (available: landscape0-3.jpg, portrait0-3.jpg, square0-1.jpg). Do not use any other images. Do not use placeholder image paths.

- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".

- When creating a bottom navigation bar, use "absolute bottom-0" instead of "fixed bottom-0".

- Try to make colors and styles consistent and harmonious with the rest of the component.

${RETURN_FORMAT}`
}

// Semantic diff toggles: the paper says toggling a category triggers another
// model call that updates the code. The exact prompt is not in the paper; this
// one is ours.
export function togglePrompt(originalCode: string, blendedCode: string, categories: { category: string; changes: { type: string; before: string; after: string }[]; enabled: boolean }[]): string {
  const list = categories
    .map((c, i) => `${i + 1}. [${c.enabled ? 'ON' : 'OFF'}] ${c.category}\n   changes: ${JSON.stringify(c.changes)}`)
    .join('\n')
  return `Here is the original react and tailwind code, before a blending operation:

${originalCode}

Here is the blended code produced by the blending operation (all change categories applied):

${blendedCode}

The blending operation made these semantic change categories. The user has toggled some of them OFF:

${list}

Update the blended code so that every category marked ON stays applied and every category marked OFF is reverted to how the original code looked for that aspect. Keep everything else in the blended code unchanged. Keep all content. Only use tailwind, react and lucide react icons; no import or export statements; a simple component definition () => {}.

Return a single valid JSON object, no code fence: { "updatedCode": "() => {...}" } with the whole component as one JSON string with newlines escaped.`
}

export function fixRenderPrompt(code: string, error: string): string {
  return `The following React + Tailwind component fails to render with this error:

${error}

Code:

${code}

Fix the code so that it renders. Keep the design and content the same. Only use tailwind, react and lucide react icons; no import or export statements; a simple component definition () => {}. Do not use .map; write each list item out.

Return a single valid JSON object, no code fence: { "updatedCode": "() => {...}" } with the whole component as one JSON string with newlines escaped.`
}
