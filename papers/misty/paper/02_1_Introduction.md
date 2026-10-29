## 1. Introduction

> I can’t speak, afraid to jinx it
>   
> I don’t even dare to wish it
>   
> But your eyes are flying saucers from another planet
>   
> Now I’m all for you like Janet
>   
> Can this be a real thing? Can it?
>
> Taylor Swift, *Snow on the Beach* (2023)

When prototyping user interfaces (UIs), developers routinely turn to reference examples—such as sketches, screenshots, or existing design languages—as sources of inspiration. These examples aid developers in ideation (Herring et al., 2009; Bunian et al., 2021; Chen et al., 2019; Lu et al., 2024a), help them to avoid design fixation (Dow et al., 2010), and spur creative exploration (O’Donovan et al., 2015; Ritchie et al., 2011). As with other forms of creative expression, developers then selectively iterate and blend various elements from these examples—such as layout or color—in this case, to design and produce a novel, distinctive UI.

This imaginative cognitive process of *conceptual blending* plays a fundamental role in the construction of meaning in everyday life, and it is so natural to the way we reason that we are often not even consciously aware that we are blending. “The essence of the operation,” as described by Fauconnier and Turner, “is to construct a partial match between two input mental spaces, to project selectively from those inputs into a novel ‘blended’ mental space, which then dynamically develops emergent structure” (Fauconnier and Turner, 2003). For example, when singer-and-songwriter Taylor Swift tells us “your eyes are flying saucers from another planet,” we intuit that the eyes are not literally flying saucers, but instead readily project selectively the two inputs—eyes and flying saucers—to blend that their gaze has a mesmerizing and otherworldly quality (Santika and Syafryadin, 2023).

While it’s unsurprising that other research has demonstrated the utility of conceptual blending in computational creativity support for various domains (Câmara Pereira, 2007; Zbikowski, 2018), there are nevertheless limited tools for blending user interfaces. Blending visual inspirations is common in UI creation, but designers and developers often have to manually implement these blends from scratch (Herring et al., 2009). How then, can we bring conceptual blending into our tools for user interface creation?

Towards addressing this gap, we created a web prototype system, Misty [Footnote: Misty is an acronym for Mixing Interfaces by Semantic Transformation. Plus Y, because why not.] , that embodies and operationalizes conceptual blending. With Misty, users can upload example UI screenshots or hand-drawn sketches, specify specific regions and aspects of interest, blend them into their work-in-progress UIs, and use a *semantic diff* to make additional refinements to the blend (Figure 1). We postulated that because generative AI models encode certain characteristics of human ingenuity (Lakoff, 2014; Tong et al., 2024), these latest multi-modal AI models would have within them some capacity to automatically interpret and apply conceptual blending. In Misty, we evaluated conceptual blending in developing individual mobile UI screens.

To evaluate Misty, we conducted a user study with 14 frontend developers. The study results revealed three key insights: First, participants found Misty’s varied levels of input granularity valuable, supporting different stages of the design process from early ideation to detailed refinement. Second, while the current AI models showed limitations in generating perfect conceptual blends, participants appreciated our semantic diff and the code editor to tweak generation results, often using imperfections as springboards for further ideation. Third and finally, conceptual blending through Misty enhanced UI prototyping workflows by supporting both focused iteration on single designs and broad exploration of diverse alternatives.

The contributions of this paper are:

- A novel UI prototyping approach, conceptual blending, which integrates diverse, meaningful aspects of reference examples into the user’s current UI.
- Misty, a system that supports conceptual blending, where UI developers interactively blend example images into work-in-progress code.
- User studies that demonstrated the value of Misty to kickstart and inspire UI development, and dissolve designer—developer boundaries.
