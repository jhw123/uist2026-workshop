// Prompts adapted from the paper's Appendix A.3. Changes from the paper:
// - The code is returned as a JSON string (not a backtick literal), since the
//   bridge asks for strict JSON.
// - Stock photos list the files that exist in /public/stock.

export const ICONS = `Heart Star MapPin Phone Mail Search Bell Settings User Users Home Camera Music Edit Pencil Trash2 Plus Minus X Check ChevronRight ChevronLeft ChevronDown ChevronUp ArrowLeft ArrowRight Share2 Bookmark Calendar Clock Globe Link Film Headphones Coffee Sofa Mountain Sun Moon Cloud Leaf Flower Footprints Compass Navigation Filter SlidersHorizontal Menu MoreHorizontal MoreVertical ShoppingBag ShoppingCart CreditCard Gift Tag Award Trophy Flame Zap Activity TrendingUp BarChart3 PieChart MessageCircle MessageSquare Send Play Pause SkipForward Mic Video Wifi Battery Lock Unlock Eye EyeOff Info HelpCircle AlertCircle Grid List LayoutGrid Layers Package Truck Plane Car Bike Hotel Utensils Pizza Apple Book BookOpen GraduationCap Briefcase Building Smile ThumbsUp Download Upload Folder FileText Palette Brush Feather Sparkles Store Ticket Dumbbell HeartPulse Stethoscope Pill Baby Dog Cat Tent TreePine Waves Umbrella Wind Droplet Thermometer Laptop Smartphone Tablet Monitor Watch Gamepad2 Radio Tv LogOut LogIn Circle Square Triangle Hash AtSign Shirt Scissors Wallet DollarSign Percent Target Flag Rocket Lightbulb Hourglass Timer`
  .split(' ')
  .join(', ');

export const STOCK = 'landscape0.jpg … landscape5.jpg, portrait0.jpg … portrait3.jpg, square0.jpg … square3.jpg';

const COMMON_RULES = `- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};

- when adding icons, pick from this list of lucide react icons, do not use others: ${ICONS}

- there are a few stock photos for use under the folder /stock/, they are named after their orientation, like landscape0.jpg, landscape1.jpg, portrait0.jpg, etc. (available: ${STOCK}). Do not use any other images. Do not use placeholder image paths.

- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".`;

const FORMAT = `Return result in the below format, make sure you use json (a single JSON object, with updatedCode as a JSON string):

{
"designExplanation": // explain the design of the screenshot image, focus on layout and color, be really concise, less than 30 words
"differences": // briefly summarize the differences between the reference image and the code, focus on layout orientation, spacing, color theme, font, etc.
"updatedCode": "() => {...}" // return the whole component for the entire screen, with the updates;
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
    {"type": "border", "before": "", "after": "border-2 border-gray-300/90"}] // "before": "" indicates addition of new classes; add as many as appropriate
  },
  {
  "category": "Font: Changed font appearance",
  "changes": [{"type": "color", "before": "bg-black", "after": "bg-white"},
    {"type": "font", "before": "text-sm", "after": "text-lg"}]
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

${COMMON_RULES}

- When creating a bottom navigation bar, use "absolute bottom-0" instead of "fixed bottom-0".

${FORMAT}`;
}

// aspects: e.g. ["Color", "Layout"]; custom: free text from "Customize".
export function dropBlendPrompt(code, aspects, custom, targetCodeDropped) {
  const named = aspects.filter((a) => a !== 'Customize').map((a) => a.toLowerCase());
  if (aspects.includes('Customize') && custom) named.push(custom);
  const aspectText = named.join(', ') || 'layout';
  const attention = aspects.filter((m) => m !== 'Customize').join(' ') + (custom ? ` ${custom}` : '');
  const addition = aspects.includes('Content')
    ? '\n\nThe user chose "Content": this is the addition mode. Add the selected UI elements from the reference image into the dropped location, with content generated from the context of the source code.'
    : '';
  return `Here is my react and tailwind code:

${code}

blend the ${aspectText} of the reference image into ${targetCodeDropped}. Change sections of the source code corresponding to this, as well as sections that are of similar layout or screen position to this. For example, don't just apply to one element in a list, but apply to all list elements with similar layouts. Sometimes the specific code piece does not correspond to parts of the source code, because it's rendered HTML based on the source React code. In that case, you need to identify the original code pieces from the source and modify them.${addition}

A few rules:

- First, explain in concise language the layout of the reference screenshot. Use it as a basis of your generation.

- Make sure all text is legible on the background.

- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Pay attention to ${attention}. Base your later generation of categorizedChanges based on these categories.

- Never directly pulls content from the reference to update the source code. For blending color and layout, preserve all original content in the UI for source code, only change/add the original content when it's really necessary for following a layout. When you blend in the addition mode, generate content based on the context of the source code.

- Do not use list and .map functions to represent lists. Just generate HTML elements for each of the list items.

${COMMON_RULES}

- When creating a bottom navigation bar, use "absolute bottom-0" instead of "fixed bottom-0".

- Try to make colors and styles consistent and harmonious with the rest of the component.

${FORMAT}`;
}

// Semantic diff toggle (paper §4.3: toggling triggers another model call).
export function semanticDiffPrompt(originalCode, blendedCode, categories, states) {
  const list = categories
    .map((c, i) => `${states[i] ? 'KEEP' : 'REVERT'}: ${c.category}\n   changes: ${JSON.stringify(c.changes || [])}`)
    .join('\n');
  return `Here is the original react and tailwind code of a UI:

${originalCode}

A blending operation produced this updated code:

${blendedCode}

The changes between them were summarized into these semantic categories. The user toggled each category on (KEEP) or off (REVERT):

${list}

Produce a new version of the code that keeps every change in the KEEP categories and reverts every change in the REVERT categories back to how the original code looked. Do not make any other changes. Make sure all text is legible on the background.

- only use tailwind, react, and react icons. Do not include any import or export statements, just use a simple component definition () => {};
- Only use images under /stock/ that already appear in either version.

Return a single JSON object:
{"updatedCode": "() => {...}"}`;
}

export function fixRenderPrompt(code, error) {
  return `This react and tailwind component fails to render with the error:

${error}

Code:

${code}

Fix the code so it renders, changing as little as possible. Do not include any import or export statements, just use a simple component definition () => {}. Only use react, tailwind classes, and lucide react icons from this list: ${ICONS}.

Return a single JSON object: {"updatedCode": "() => {...}"}`;
}
