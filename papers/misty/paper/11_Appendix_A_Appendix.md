## Appendix A Appendix

### A.1. Interview Questions For User Study

Here, we provide a detailed list of questions asked to participants during the user study. Please refer to Section 5 for a comprehensive description of the user study procedures.

#### A.1.1. Step 1: Understanding Current Practices on Finding Inspirations

1. How do you use inspirations in your work? If so, how do you find and use them?
2. Can you show me some examples that you learned a lot from or are very inspired by?
3. How did you incorporate these examples into your work

#### A.1.2. Step 3: Follow-Up Interview Questions

Please note that given it is an semi-structured interview, we sometimes adjusted the questions based on the participant’s questionnaire response and question answers.

1. What are scenarios you would like to use Misty?
2. How will it influence your current workflow?
3. What are scenarios you would not like to use Misty? Why?
4. What do you think about the ability to blend in examples of different fidelities?
5. If you do not only blend in examples, what are some other ways you might use conceptual blending?
6. What are some of the ways Misty can be improved? What other features do you desire?
7. How to improve Misty further to make it more useful?
8. Any concerns using Misty?
9. Misty’s features support design iteration, but are directly implemented using frontend code. As a developer, how do you feel? Will this influence your work? Will this impact designer-developer handoff?

### A.2. Usability Questionnaire For User Study

Each question is accompanied by a 1-5 likert scale.

1. The system is generally easy to use.
2. The system’s interaction is intuitive.
3. The system supports me well in expressing my intents.
4. The system’s outputs generally follow my expectations.
5. I am satisfied with the outcomes I get at the end.
6. The system can help me to iterate on UI designs faster.
7. The system helps me to explore more alternative design options than I usually would.
8. I think that I would like to use a system like Misty in my work frequently.

### A.3. Generative AI Prompts

Here, we provide two main types of prompts we used to generate conceptual blending outputs in Misty.

#### A.3.1. Global Blending

Global blending generally involves the work-in-progress code and a reference image (separately uploaded).

⬇

Here is my react and tailwind code:

${work-in-progress code}

Help me create a new component page that blends the content of the above code with the visual style, layout, and appearance of the reference image. Change only the source code corresponding to this, and no other sections.

Preserve the content in the UI of the code, follow the layout and visual style of the reference image, optionally add more content where the original code’s content cannot fill in all fields in the reference image’s layout. Do not use content from the reference image, just use its layout and visual style.

A few rules:

- First, explain in concise language the design of the reference screenshot. Use it as a basis of your generation.

- Make sure all text is legible on the background

- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Base your later generation of categorizedChanges based on these categories.

- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};

- when adding icons, pick from this list of lucide react icons, do not use others: ${list of available lucide icon names}

- there are a few stock photos for use under the folder /stock/, they are named after their orientation, like landscape0.jpg, landscape1.jpg, portrait0.jpg, etc. Do not use any other images. Do not use placeholder image paths.

- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".

Return result in the below format, make sure you use json:

{

"designExplanation": // explain the design of the screenshot image, focus on layout and color, be really concise, less than 30 words

"differences": // briefly summarize the differences between the reference image and the code, focus on layout orientation, spacing, color theme, font, etc.

updatedCode: \‘() => {}\‘ // return the whole component for the entire screen, with the updates;

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

#### A.3.2. Drag-and-drop Blending

The drag-and-drop blending prompt differ from the global blending prompt mainly in two ways. First, it provides the desired aspects users want to blend in (e.g. color, layout, content). Second, it adds the specific target code that was dropped on.

⬇

% [breaklines,fontsize=\footnotesize,breaksymbol={}]{text}

Here is my react and tailwind code:

${work-in-progress code}

blend the ${user specified blending aspect} of the reference image into ${targetCodeDropped}. Change sections of the source code corresponding to this, as well as sections that are of similar layout or screen position to this. For example, don’t just apply to one element in a list, but apply to all list elements with similar layouts. Sometimes the specific code piece does not correspond to parts of the source code, because it’s rendered HTML based on the source React code. In that case, you need to identify the original code pieces from the source and modify them.

A few rules:

- First, explain in concise language the layout of the reference screenshot. Use it as a basis of your generation.

- Make sure all text is legible on the background.

- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Pay attention to ${blendMode.filter(mode => mode !== "Customize").join(" ")}. Base your later generation of categorizedChanges based on these categories.

- Never directly pulls content from the reference to update the source code. For blending color and layout, preserve all original content in the UI for source code, only change/add the original content when it’s really necessary for following a layout. When you blend in the addition mode, generate content based on the context of the source code.

- Do not use list and .map functions to represent lists. Just generate HTML elements for each of the list items.

- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};

- when adding icons, pick from this list of lucide react icons, do not use others: ${list of avaialble lucide icons}

- there are a few stock photos for use under the folder /stock/, they are named after their orientation, like landscape0.jpg, landscape1.jpg, portrait0.jpg, etc. Do not use any other images. Do not use placeholder image paths.

- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".

- When creating a bottom navigation bar, use "absolute bottom-0" instead of "fixed bottom-0".

- Try to make colors and styles consistent and harmonious with the rest of the component.

Return result in the below format, make sure you use json:

{

"designExplanation": // explain the design of the screenshot image, focus on layout and color, be really concise, less than 30 words

"differences": // briefly summarize the differences between the reference image and the code, focus on layout orientation, spacing, color theme, font, etc.

updatedCode: \‘() => {}\‘ // return the whole component for the entire screen, with the updates;

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
