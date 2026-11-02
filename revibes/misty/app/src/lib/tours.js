// The guided demos, one per section of MANUAL_TEST.md. Each step says what to spotlight
// (targets), and when the person has done it (done). A step without done waits for Next.
import { pickTarget } from './dom.js';

const STORE = 'Store: featured card';
const HEALTH = 'Health: dark list';
const PROFILE = 'Profile: carousel + Edit';
const SKETCH = 'Hand-drawn sketch';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const frame = (alt) => $$('.m-example-frame').find((f) => f.querySelector('img')?.alt.startsWith(alt));
const sources = () => $$('.react-flow__node-source');
const latest = () => sources().at(-1);
const first = () => sources()[0];
const preview = (node) => node && $('[data-misty-preview]', node);
const busy = () => Boolean($('.m-busy'));
const dialog = () => $('.m-dialog');
const buttonIn = (root, text) =>
  root && $$('button', root).find((b) => b.textContent.trim().startsWith(text));
const option = (name) => $$('.m-option').find((o) => $('strong', o)?.textContent === name);

// ---- targets -------------------------------------------------------------

const el = (element, style = 'solid') => (element ? { rect: element.getBoundingClientRect(), style } : null);

// A box in the sample's own 390x780 coordinates, shown as "select here".
function region(alt, [x0, y0, x1, y1]) {
  const image = frame(alt);
  if (!image) return null;
  const r = image.getBoundingClientRect();
  return {
    style: 'region',
    rect: {
      left: r.left + (x0 / 390) * r.width,
      top: r.top + (y0 / 780) * r.height,
      width: ((x1 - x0) / 390) * r.width,
      height: ((y1 - y0) / 780) * r.height,
    },
  };
}

function textBlock(root, text) {
  if (!root) return null;
  const leaf = $$('*', root).find((e) => e.children.length === 0 && e.textContent.includes(text));
  return leaf ? el(pickTarget(leaf, root)) : null;
}

const handle = (alt, selector, node) => {
  const owner = alt ? frame(alt)?.closest('.react-flow__node') : node;
  return owner ? el($(selector, owner)) : null;
};

function darkSwitch() {
  const switches = latest() ? $$('[role=switch]', latest()) : [];
  return (
    switches.find((s) => /dark|theme/i.test(s.getAttribute('aria-label'))) ||
    switches.find((s) => /^color/i.test(s.getAttribute('aria-label'))) ||
    switches[0]
  );
}

function selectionMatches(alt, [x0, y0, x1, y1]) {
  const image = frame(alt);
  const selection = image && $('.m-crop-selection', image);
  if (!selection) return false;
  const r = image.getBoundingClientRect();
  const s = selection.getBoundingClientRect();
  const cx = (((s.left + s.width / 2 - r.left) / r.width) * 390 - x0) / (x1 - x0);
  const cy = (((s.top + s.height / 2 - r.top) / r.height) * 780 - y0) / (y1 - y0);
  return cx > -0.1 && cx < 1.1 && cy > -0.1 && cy < 1.1 && (s.width / r.width) * 390 >= (x1 - x0) * 0.35;
}

// ---- reusable runs of steps ----------------------------------------------

const waitForBlend = (what = 'Misty is writing the new code') => ({
  title: 'Blending…',
  body: `${what}. This usually takes 15 to 35 seconds.`,
  waiting: true,
  done: () => !busy(),
});

// Select a region, drag it onto the source UI, then pick aspects in the dialog.
function dragBlend({ alt, box, boxName, previewOf, targetText, targetName, aspects, why }) {
  const steps = [
    {
      title: `Select ${boxName}`,
      body: 'Drag across the dashed area on the example. If you miss, press Undo and try again.',
      why,
      targets: () => [region(alt, box)],
      done: () => selectionMatches(alt, box),
      onEnter: (ctx) => ctx.fit(),
    },
    {
      title: `Drag it onto ${targetName}`,
      body: 'Press inside your selection and drag. The area that will change pulses purple. Drop it there.',
      why: 'The highlight shows what will be affected before anything happens.',
      targets: () => [el($('.m-crop-selection', frame(alt) ?? document)), textBlock(preview(previewOf()), targetText)],
      arrow: true,
      done: () => Boolean(dialog()),
    },
    ...aspects.map((name) => ({
      title: `Choose ${name}`,
      body:
        aspects.length > 1
          ? 'You can pick more than one aspect. Each one stays selected.'
          : 'This tells Misty which aspect of the example you want.',
      targets: () => [el(option(name))],
      done: () => option(name)?.classList.contains('is-picked'),
    })),
  ];
  return steps;
}

const pressNext = {
  title: 'Press Next',
  body: 'Misty sends your code, the cropped section and your choices to the model.',
  targets: () => [el(buttonIn(dialog(), 'Next'))],
  done: () => busy() || !dialog(),
};

const connect = (alt, sourceNode, name) => ({
  title: 'Connect the example to your UI',
  body: `Drag from the blue bar on the ${name} to the purple bar on your UI. No dialog appears: this is a whole-screen blend.`,
  why: 'Global blending suits early exploration, when you want to see possibilities quickly.',
  targets: () => [handle(alt, '.m-handle-example'), handle(null, '.m-handle-source', sourceNode())],
  arrow: true,
  onEnter: (ctx) => ctx.fit(),
  // These scenes start with one source, so a second means the blend has begun.
  done: () => busy() || sources().length > 1,
});

const resultStep = (title, body, why) => ({
  title,
  body,
  why,
  targets: () => [el(preview(latest())), el($('.m-changes', latest() ?? document))],
  onEnter: (ctx) => ctx.fitLatest(),
});

// ---- the demos -----------------------------------------------------------

const PARKS_INTRO = {
  title: 'Two inputs to blend',
  body: 'On the left is a reference example, which is just an image. On the right is your work-in-progress UI, rendered live from code.',
  why: 'Misty only needs a screenshot of the example, never its code.',
  targets: () => [el(frame(STORE)?.closest('.m-node')), el($('.m-source', first() ?? document))],
};

export const TOURS = [
  {
    id: 'figure1',
    source: 'Figure 1',
    title: 'Blend a layout into your UI',
    summary: 'The paper’s main example, then every way to refine the result.',
    meta: '1 blend',
    scene: { examples: [STORE], source: 'parks' },
    steps: [
      PARKS_INTRO,
      ...dragBlend({
        alt: STORE,
        box: [20, 112, 370, 512],
        boxName: 'the Featured card',
        previewOf: first,
        targetText: 'Steep Ravine',
        targetName: 'the first park card',
        aspects: ['Layout'],
        why: 'Choosing a region tells Misty where in the example to look.',
      }),
      pressNext,
      waitForBlend(),
      resultStep(
        'Your content, in the example’s layout',
        'Look for cards redesigned after the Featured card, with every park name still there. Results vary between runs. Your original node stays on the canvas, so you can compare the two.',
        'Each blend creates a new node, which supports trying alternatives side by side.'
      ),
      {
        title: 'Applied Changes is the semantic diff',
        body: 'Instead of a list of code edits, changes are grouped by what they mean. Each group can be turned on or off.',
        why: 'One idea, such as a new theme, can touch many lines of code. Grouping keeps it understandable.',
        targets: () => [el($('.m-changes', latest() ?? document))],
      },
      {
        title: 'Open the class changes',
        body: 'Press this to see the exact Tailwind classes behind a category.',
        targets: () => [el($('.m-details-toggle', latest() ?? document))],
        done: () => Boolean($('.m-class-list', latest() ?? document)),
      },
      {
        title: 'Change one value',
        body: 'Edit a value on the right of an arrow and press Enter, for example changing a color. The UI updates at once, with no model call.',
        why: 'This is the most hands-on level of control short of editing the code.',
        targets: () => [el($('.m-class-input', latest() ?? document))],
      },
      {
        title: 'Undo it with Reset All',
        body: 'Reset All restores the blend as it first came back. It also discards manual code edits.',
        targets: () => [el(buttonIn(latest(), 'Reset All'))],
      },
    ],
  },
  {
    id: 'fuji-global',
    source: 'Section 2',
    title: 'Keep the layout, drop the dark theme',
    summary: 'Fuji’s global blend, then undoing a single idea with a toggle.',
    meta: '2 model calls',
    scene: { examples: [HEALTH], source: 'fuji' },
    steps: [
      connect(HEALTH, first, 'dark example'),
      waitForBlend(),
      resultStep(
        'A dark version of Fuji’s profile',
        'Fuji’s name, bio, contact details and interests are all kept, in the visual style of the example.',
        'Seeing your own content in a new style is what makes the blend easy to judge.'
      ),
      {
        title: 'Turn off the dark theme',
        body: 'Like Fuji, you may want the new layout but not the dark colors. Switch off this one change.',
        targets: () => [el(darkSwitch()?.closest('.m-category'))],
        done: () => darkSwitch() && !darkSwitch().checked,
      },
      waitForBlend('Misty is rewriting the code without that change'),
      resultStep(
        'Light again, with the new layout',
        'The theme went back, and the other changes stayed. Check that nothing else moved, because the model rewrites the code for each toggle.'
      ),
      {
        title: 'Switch it back on',
        body: 'This one is instant. Misty remembers every combination it has already generated.',
        targets: () => [el(darkSwitch()?.closest('.m-category'))],
        done: () => darkSwitch()?.checked,
      },
    ],
  },
  {
    id: 'fuji-targeted',
    source: 'Section 2',
    title: 'Carousel and Edit button',
    summary: 'Targeted blends: restyle one section, then add a brand new element.',
    meta: '2 blends',
    scene: { examples: [PROFILE], source: 'fuji' },
    steps: [
      ...dragBlend({
        alt: PROFILE,
        box: [18, 358, 388, 610],
        boxName: 'the row of tiles',
        previewOf: first,
        targetText: 'Lofi Music',
        targetName: 'the Interests list',
        aspects: ['Layout'],
        why: 'A targeted blend gives you more control than a whole-screen one.',
      }),
      pressNext,
      waitForBlend(),
      resultStep(
        'Interests, restyled',
        'Each interest gets a tile and a short generated description. Known gap: the paper shows a horizontal scrolling row with photos, and our runs produced a two-column grid.',
        'Details are invented from your content, never copied from the example.'
      ),
      ...dragBlend({
        alt: PROFILE,
        box: [146, 258, 244, 302],
        boxName: 'the red Edit button',
        previewOf: latest,
        targetText: 'Phone',
        targetName: 'the contact details',
        aspects: ['Color', 'Layout', 'Content'],
        why: 'Fuji’s design had no Edit button. A blend can add elements as well as restyle them.',
      }),
      pressNext,
      waitForBlend(),
      resultStep(
        'A new Edit button',
        'Look for a red button near the contact details, with everything else unchanged. Blends can chain, each building on the last.'
      ),
    ],
  },
  {
    id: 'header',
    source: 'Study task 2',
    title: 'Add a header',
    summary: 'Bring one section across, with content that suits your app.',
    meta: '1 blend',
    scene: { examples: [STORE], source: 'parks' },
    steps: [
      ...dragBlend({
        alt: STORE,
        box: [0, 0, 390, 56],
        boxName: 'the Products header',
        previewOf: first,
        targetText: 'Nearby',
        targetName: 'the filter chips',
        aspects: ['Content'],
        why: 'Content adds the selected element to your UI.',
      }),
      pressNext,
      waitForBlend(),
      resultStep(
        'A header that fits',
        'The title should suit the parks, such as “Saved Trails”, rather than copying “Products”.',
        'Misty takes the structure from the example and writes the words from your own content.'
      ),
    ],
  },
  {
    id: 'sketch',
    source: 'Study task 3',
    title: 'Blend a hand-drawn sketch',
    summary: 'Turn a rough drawing into a working layout.',
    meta: '1 blend',
    scene: { examples: [SKETCH], source: 'parks' },
    steps: [
      {
        title: 'A sketch works too',
        body: 'This is a rough drawing of a search bar, a big image, three cards, list rows and a tab bar.',
        why: 'Sketches help when you have an idea but can’t find an example of it.',
        targets: () => [el(frame(SKETCH)?.closest('.m-node'))],
      },
      connect(SKETCH, first, 'sketch'),
      waitForBlend(),
      resultStep(
        'From drawing to UI',
        'Compare it with the sketch. The structure should match, the parks keep their content, and it should look finished rather than hand-drawn.'
      ),
    ],
  },
  {
    id: 'own',
    source: 'Study task 4',
    title: 'Use your own screenshot',
    summary: 'Open-ended exploration, with an image you bring.',
    meta: '1 blend',
    needsImage: true,
    scene: { examples: [], source: 'parks' },
    steps: [
      {
        title: 'Add an example',
        body: 'Open this menu and upload a screenshot or a photo of a sketch. You can also drop a file on the canvas or paste an image.',
        why: 'Any image works, which is what makes Misty practical in real work.',
        targets: () => [el(buttonIn($('.m-toolbar'), 'Add Example'))],
        done: () => $$('.m-example-frame').length > 0,
      },
      {
        title: 'Blend it your way',
        body: 'Drag from its blue bar to your UI for a global blend, or select a section and drag it onto the UI.',
        targets: () => [el($('.m-example-frame')?.closest('.m-node')), el($('.m-source', first() ?? document))],
        onEnter: (ctx) => ctx.fit(),
        done: () => busy(),
      },
      waitForBlend(),
      resultStep('How close did it get?', 'From here, keep blending into the result until you’re happy, using anything from the other demos.'),
    ],
  },
  {
    id: 'customize',
    source: 'Custom aspects',
    title: 'Customize and Regenerate',
    summary: 'Name your own aspect, and ask for another attempt.',
    meta: '2 blends',
    scene: { examples: [STORE], source: 'parks' },
    steps: [
      ...dragBlend({
        alt: STORE,
        box: [20, 568, 370, 698],
        boxName: 'the Ways to save tiles',
        previewOf: first,
        targetText: 'Sunset Ridge',
        targetName: 'a park card',
        aspects: ['Customize'],
        why: 'Color, layout and content won’t cover everything you might notice in an example.',
      }),
      {
        title: 'Name the aspect',
        body: 'Type something like “the corner roundness of the tiles”. Next stays off until you do.',
        targets: () => [el($('.m-custom-input'))],
        done: () => Boolean($('.m-custom-input')?.value.trim()),
      },
      pressNext,
      waitForBlend(),
      resultStep(
        'Only what you asked for',
        'Corners should change and little else. Custom aspects were the most precise blends in our testing.'
      ),
      {
        title: 'Try Regenerate',
        body: 'The same blend runs again and updates this node in place. Results vary, sometimes in surprising ways.',
        why: 'Participants in the paper’s study often found unexpected results inspiring.',
        targets: () => [el(buttonIn(latest(), 'Regenerate'))],
        done: () => busy(),
      },
      waitForBlend(),
      resultStep('A different take', 'Compare it with what you remember. Regenerate as often as you like.'),
    ],
  },
  {
    id: 'code',
    source: 'Code editor',
    title: 'Edit the code directly',
    summary: 'The live editor, and recovering from broken code.',
    meta: 'No model unless repair needs it',
    scene: { examples: [], source: 'parks' },
    steps: [
      {
        title: 'Open the code',
        body: 'Every source node is just React and Tailwind, which you can take back to your project.',
        targets: () => [el($('.m-show-code', first() ?? document))],
        done: () => Boolean($('.m-dock')),
      },
      {
        title: 'Change some visible text',
        body: 'Click into the code and change a park name. The UI updates as you type.',
        why: 'Participants said small tweaks like font and spacing are often quicker by hand.',
        targets: () => [el($('.m-dock-editor'))],
      },
      {
        title: 'Now break it on purpose',
        body: 'Type a stray < inside the markup. An error appears here and under the UI.',
        targets: () => [el($('.m-dock-editor'))],
        done: () => Boolean($('.m-render-error')),
      },
      {
        title: 'Press Fix Render',
        body: 'Syntax rules try first, and the model repairs anything they can’t.',
        targets: () => [el($('.m-link.is-alert'))],
        done: () => !$('.m-render-error') && !busy(),
      },
      {
        title: 'Take the code with you',
        body: 'Copy puts the component on your clipboard, ready for your own project. Close the editor to finish.',
        targets: () => [el($('.m-dock header'))],
        done: () => !$('.m-dock'),
      },
    ],
  },
  {
    id: 'cancel',
    source: 'Recovery',
    title: 'Change your mind',
    summary: 'Back out of a blend before it starts.',
    meta: 'No model calls',
    scene: { examples: [STORE], source: 'parks' },
    steps: [
      ...dragBlend({
        alt: STORE,
        box: [20, 112, 370, 512],
        boxName: 'the Featured card',
        previewOf: first,
        targetText: 'Bear Mountain',
        targetName: 'a park card',
        aspects: [],
      }),
      {
        title: 'Press Cancel',
        body: 'Pressing Esc or clicking outside the dialog does the same. Nothing is sent to the model.',
        targets: () => [el(buttonIn(dialog(), 'Cancel'))],
        done: () => !dialog(),
      },
      {
        title: 'Nothing changed',
        body: 'No new node, and your selection is still there to try again. If a blend ever fails, the reason appears under its node, and Regenerate retries it.',
        targets: () => [el($('.m-source', first() ?? document))],
      },
    ],
  },
];

// The most recent failure on screen, so a demo can say what went wrong.
export const latestError = () => $('.m-error', latest() ?? document)?.textContent ?? null;
