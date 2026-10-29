## 4. The Misty System

To evaluate how conceptual blending can help developers prototype user interfaces, we developed Misty as a web-based system that supports interactive conceptual blending.

### 4.1. System Design Goals

Misty embodies three design goals supported by findings from a literature review of three key areas: UI/UX design processes and tools (Kumar et al., 2011; Wu et al., 2023b; Warner et al., 2023; Lu et al., 2022; Knearem et al., 2023; Lu et al., 2024a; Kim et al., 2022; Peng et al., 2024), AI for creativity support (Choi et al., 2024; Chung and Adar, 2023; Angert et al., 2023; Chen et al., 2024), and Human-AI Interaction (Horvitz, 1999; Masson et al., 2024; Shneiderman and Maes, 1997; Subramonyam et al., 2024; Amershi et al., 2019). We formulate the design goals as follows:

1. Support flexible and familiar input formats. Because users employ representations at varying levels of fidelity depending on design focus (Buxton, 2010; Norman, 2013; Huang et al., 2019) (e.g., sketches, wireframes, or high-fidelity prototypes), users should be given an input mechanism flexible enough to express intent across those representations. We identify UI examples in the form of screenshot images and hand-drawn sketches as natural mediums that agrees with common developer practices (Herring et al., 2009).
2. Preserve developer agency in creative interaction. Maintaining designer agency is crucial in AI-assisted design tools (Lu et al., 2022; Knearem et al., 2023; Li et al., 2024). By offering granular control over the blending process, we ensure that the tool remains predictable and aligned with the user’s vision, addressing key concerns raised in previous studies on AI adoption in design workflows (Lu et al., 2022; Knearem et al., 2023). Studies have also shown that users prefer visual interactions over purely textual prompts when working with AI tools (Subramonyam et al., 2024; Masson et al., 2024; Lu et al., 2024a).
3. Promote exploration, reflection, and iteration. Creative design processes are inherently iterative and reflective (Buxton, 2010; Norman, 2013), so conceptual blending should support reflection by allowing the user to visually compare different blended results and to critically evaluate choices before making further changes. This iterative approach aligns with established design practices, such as parallel prototyping (Choi et al., 2024; Dow et al., 2010; Peng et al., 2024), that help users refine ideas to arrive at more innovative solutions.

### 4.2. Interaction Affordances

Misty realizes the above design goals through three primary interaction affordances, which we now describe.

#### 4.2.1. Conceptual blending control for implicit intent disambiguation

A primary challenge in Misty’s interaction design is the disambiguation of user intent, as the space of valid results for a conceptual blending operation is potentially large. For example, when a user wants to blend an example with their source UI, they might intend to blend the color, layout, content, or a combination of these aspects. Additionally, the user might only wish to blend from specific sections of the example, rather than the entire screen.

To address this challenge, Misty provides interactions that implicitly disambiguate user intent. Concretely, Misty offers two primary blending modes, each respectively providing different levels of user control:

1. Global blending through node connection: Users connect example nodes to source nodes, triggering a global, screen-level blending operation. This mode is suitable for more exploratory phases of design and exploits the language model’s implicit world knowledge from pre-training (Achiam et al., 2023).
2. Localized blending using drag-and-drop: For more refined control, users can drag subsections of example UIs onto specific areas of the source UI. As the drag operation hovers over parts of the source UI, a highlight animation occurs which indicates affected areas and appropriately communicates expectations of the operation’s outcome to the user (Norman, 2013). Finally, upon dropping, Misty presents the user a dialog to specify which aspect(s) to blend.

While global-level conceptual blending is suitable for exploratory phases of design, it can yield a low sense of control for users with specific goals in mind. Misty’s drag-and-drop interface for targeted blending operations allows users to precisely specify which elements they wish to blend.

#### 4.2.2. Node-Based Interface and Infinite Canvas

Misty employs a node-based system interface with two primary node types: example nodes (A in Figure 1) showing example images and source nodes rendering the source UI code (B in Figure 1). During a conceptual blending operation, a user blends an example node into a source node, creating a new source node with a rendering of the updated code. This node-based approach facilitates parallel prototyping (Dow et al., 2010) via exploration, visual comparison, and iteration of design alternatives. The infinite canvas, as also found in contemporary design tools such as Figma, Sketch, and Freeform, provides a familiar setup for users (DG1). Moreover, this architecture helps the user to trace the evolution of ideas, as nodes represent different stages or variations of a design. By visually representing the design process, the node-based interface inherently supports creative thinking and iterative refinement (DG3).

We additionally embed a live code editor, expandable and collapsable to the right side of the screen, for editing the code underlying any source node. In this way, developers can apply manual tweaks as desired (DG2). Note that code editors are only for source nodes and *not* example nodes. Crucially, Misty does not require access to the underlying code for example images, different from previous research prototypes (Kumar et al., 2011; Warner et al., 2023). Users need only upload example *images*, which may be more easily obtained than code.

#### 4.2.3. Dynamic UI for Semantic Refinement

After a blending operation, Misty presents a summary of its changes organized into “semantic diffs”—groups of semantic changes to the source UI describing the outcome of a conceptual blending operation. Semantic diffs extend the idea of program diffs (Hunt and MacIlroy, 1976) by organizing changes based on their semantic impact on the UI, not on their character-level changes to the underlying code.

As a motivating example, consider the impact of converting a UI to dark mode: while conceptually a simple change, its realization might require multiple distinct edits to various CSS styles corresponding to different UI components.
Misty summarizes the combination of these edits into a dynamic widget whose content is generated on-the-fly based on the meaning of the change. Crucially, the generated widget affords both coarse-grained control (enabling or disabling dark mode), or fine-grained control (varying individual colors). This approach provides the user with a high-level, conceptual understanding of the blending outcome, while also preserving user control at different levels of granularity.

This implementation of semantic diffing, inspired by recent work in dynamic UI generation (Tseng et al., 2024; Cheng et al., 2024a; Vaithilingam et al., 2024), ensures that users maintain agency throughout the blending process (DG2). It allows for rapid exploration of design alternatives while preserving the ability to make precise adjustments, thus supporting both divergent and convergent thinking in the design process (DG3).

##### Combined affordances.

The above affordances, when combined, create a spectrum of user agency ranging from full agent automation (global blending) to full direct manipulation (dynamic UI widgets and manual code editing) (Shneiderman and Maes, 1997) in which the user can flexibly switch between levels of control (DG2). Global blending allows broad exploration in early stages, while granular controls (localized blending and semantic diff) allow refinement of specific aspects of the design at a later stage (DG3).
By offering this range of interaction options, Misty maintains the users’ sense of agency and control throughout the process (Satyanarayan and Jones, 2024) (DG2).

### 4.3. Implementation Details

Misty is implemented in React, React Flow, Tailwind CSS, and React Live, with OpenAI’s GPT-4o as the underlying large multimodal model servicing prompt requests. We employ few-shot prompting (Brown et al., 2020) with chain-of-thought reasoning (Wei et al., 2022) to improve response quality (see Section A.3 for full details on the prompts used).
To detect and repair malformed React syntax, Misty employs heuristic rules implemented using regular expressions. However, in cases where these heuristics are insufficient, we note that users may opt to either re-generate the code or use the code editor to apply manual repairs.

To enable conceptual blending in Misty, we used GPT-4o (Achiam et al., 2023). GPT-4o’s capabilities in code generation, multimodal input processing, and broad world knowledge make it suitable for context-aware conceptual blending across various UI design domains.

We asked the AI model to generate semantic diff summaries together with each blending outputs. Afterwards, when the user toggle on/off each semantic diff options, Misty triggers another API call to GPT-4o to update the code.

### 4.4. System Limitations

Our implementation of Misty focuses on UI content and visuals.
These aspects are foundational elements of UIs; in the future, we plan to build on these static aspects and expand conceptual blending to UI interactivity. Conceptual blending for interactive UX prototypes presents its own unique challenges and opportunities, as it involves dynamic states and transitions between multiple screens.

While GPT-4o and other large pre-trained multimodal models are capable and low-cost backbones for prototyping, it is likely that a custom model fine-tuned specifically for conceptual blending would offer more precise results that better follow user expectations. Recent technical advancements have shown great promise in creating a customized model in this direction (Wu et al., 2024; Shin et al., 2021). However, developing such a model is beyond the scope of our current study. We identify this as a direction for future work (see Section 7).
