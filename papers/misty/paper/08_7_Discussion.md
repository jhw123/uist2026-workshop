## 7. Discussion

##### Implications for responsible AI in conceptual blending tools

Artists and creators have expressed concern over content ownership as generative AI models advance (Srinivasan and Uchino, 2021; Flick and Worrall, 2022). Conceptual blending, while prevalent in creative tasks, is essentially borrowing content and styles from existing examples that users do not necessarily own. Conceptual blending tools have to be responsibly deployed with careful ethical considerations around ownership, permissions, and their use in blending derivatives.

UI/UX design and development pose unique challenges for these ethical considerations in conceptual blending. Since software users do not adapt quickly to new interface and interaction patterns, designers often need to incorporate established patterns that users are already familiar with (Norman, 2013). As a result, usability—instead of novelty or creativity—is often prioritized in UI/UX prototyping. For this reason, the boundary of unethical appropriation in UI/UX design is often ambiguous. Moreover, designers and developers open-source component libraries for others to reuse and re-purpose.

Misty currently does not have safety guardrails around what inputs the system can accept and what outputs the system can generate. As a result, Misty can generate inappropriate user interfaces if such blends are requested by the developer. There are continuing conversations on how to balance developer freedom around flexible intent specification and when (and whether) to deny the generation of certain user interfaces.

These are only some challenges that the generative UI community is grappling with that would need to be resolved in this evolving landscape of Generative AI technology. It would be valuable to prioritize responsible AI and copyright ethics to improve the design of Misty. Insights from this design approach, and its influence on user interaction with the tool would contribute to HCI and Responsible AI.

##### Augmenting refinement with bespoke widgets

In Misty, we demonstrated the feasibility and utility of “semantic diff” using a simple toggle widget Figure 1. However, there exists an expressive yet underexplored design space of bespoke widgets that make semantically meaningful adjustments beyond direct attribute edits. For example, a *layout density slider* can tweak screen element layouts from “sparse” to “dense”, triggering simultaneous updates of CSS spacing attributes without breaking the harmony of the layout. A *color scheme grid* can generate the entire page’s color scheme—instead of single color pickers—along axes such as “monochrome” to “multicolored” and “dark” to “light” themes. We can also imagine a screen *content verbosity slider* from “concise” to “verbose”, together updating multiple pieces of text on screen.

To successfully materialize these bespoke widgets, Misty would need to incorporate additional context, such as system states and user intentions. Previous work has also discussed the potential value of serializing and saving these bespoke widgets for reuse (Cheng et al., 2024a).

Nevertheless, introducing these bespoke widgets to future tools similar to Misty can support more semantic, iterative refinement that improves developer productivity.

##### Expanding conceptual blending in Misty

Our implementation of Misty is based on simple UI screens with limited interactivity. During our user study, participants expressed interest in expanding Misty to conceptual blending of interactive prototypes. Interactive UI prototypes contain many dimensions that are relevant for conceptual blending: user interactions, animations, and screen states. Tools like CoCapture (Chen et al., 2021) have made progress towards blending interactivity, and Keyframer (Tseng et al., 2024) has investigated the use of Generative AI for authoring animations. However, blending interactivity continues to pose design challenges. Blending static screenshots and sketches are relatively simple, yet it is not obvious how to specify sections and aspects—for example, of a video—for blending. Design principles from research in programming by demonstration can provide a useful starting point (Cypher and Halbert, 1993).

We also plan to expand Misty to support more “unusual blends”, such as blending of non-UI media types—pictures, videos, and even music—into UI screens. These conceptual blends might be able to borrow inspirations based on aesthetic or mood. For example, an audio clip containing somber tones could result in the generation of a user interface with dark and muted colors. Similarly, a photograph from a science fiction film might result in a user interface that mimics the affordances appropriate to that sci-fi genre. As other forms of art are rich in metaphor and figurative language, it would be amusing to consider how Generative AI can meaningfully interpret such unusual blends to construct surprising user interfaces.
