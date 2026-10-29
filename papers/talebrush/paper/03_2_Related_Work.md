**2** **RELATED WORK**


We review research on four main areas related to TaleBrush: 1)
writing support tools, 2) story generation, 3) visual expressions of
stories, and 4) sketching.


**2.1** **Writing Support Tools**

Many tools support different aspects of writing. These range from
spelling and grammar correction [ 85, 115 ], to thesauruses [ 45 ],
to crowd-powered editors [ 11, 108 ]. As writing tasks and styles
are often domain-specific, tools can be similarly specialized: email
message phrasing [ 23 ], help requests in professional contexts [ 69 ],
mental support [ 114 ], affectionate messaging [ 80 ], education [ 22 ],
and journalism [ 95 ]. Of specific interest to us are tools for creative
writing tasks. These run the gamut from suggesting metaphors [ 46 ]
to helping with song lyrics [ 147 ]. Commercial tools such as Dramatica or Plottr are largely human-driven and help the author structure
their plot or narrative [19, 43].
To produce content, some tools connect the author to other humans or support collective story writing by writing stories with
the crowd. These systems can structure creative leadership [ 77 ]
and decision-making [ 78 ], or even simulate the characters with
crowds [ 63 ]. Newer tools have adopted novel machine learning (ML)
and natural language processing (NLP) techniques [ 153 ]. Among
those techniques, ML’s generative functions offer a powerful alternative approach. These systems append or suggest generated texts
to the writer’s text using sophisticated language models [ 24, 28, 29,
129, 143 ]. In theory, these algorithms can act as writing support
tools. However, limited controls and interactionsÐlargely rephrasing prompts and contextsÐconstrain their applicability. Our goal
with TaleBrush is to leverage these language models but provide
an alternative control strategy using both text and abstract visual
representations and interactions.


**2.2** **Machine Story Generation**

Story generation is one of the grand challenges in artificial intelligence (AI) with multiple practical applications. These range from
entertainment [ 124 ] and education [ 98, 124 ] to our target, writing
support [ 24, 28 ]. Early approaches included the use of story block
templates that could be put together sequentially [ 30 ]. With computational techniques, autonomous story generation became feasible.
One technique is computational planning, where the computer does
symbolic planning to accomplish a given goal [ 86, 101, 113, 125, 146 ].



Case-based reasoning techniques enable story generation by adapting stored stories to new contexts [ 47, 117, 123, 135, 139 ]. Alternative strategies involve character-based simulation, where characters
and the world are simulated to unfold the story with the given facts
and underlying beliefs [25, 94].
Advances in ML, largely in language models, have introduced
more opportunities in story generation [ 5, 6, 53, 64, 70, 89, 90,
99, 136, 145 ]. Specifically, Transformer-based Language Models
(LMs) [ 21, 119, 140 ] probabilistically sample continuing stories [ 41 ]
or infilling sentences [ 5, 35, 67, 70, 89, 104, 111, 145 ] based on the
given story context. While imperfect in generating coherent text,
they hold promise for improved story generation.
Controllability is a key requirement for all these approaches.
However, LM models, in particular, utilize structures that are much
harder to inspect and explain. For the algorithms to be useful
and usable, new control mechanisms are needed [ 28 ]. The most
basic, and perhaps obvious, controls are driven by natural language prompts [ 36 ] (e.g., łTell me a happy storyž). To better guide
LMs, researchers investigated ways to automatically learn these
prompts [ 87, 88, 93, 131 ]. Other language-based approaches for control involve specifying keywords to prime the generated text [ 40,
70, 134, 152 ]. Alternative approaches, like Intent-Guided Authoring
(IGA), provide some degree of control over output sentences [ 134 ].
The author can use a number of pre-specified tags (e.g., cause or
effect) to describe the desired relationship of output to input. Researchers also introduced algorithms that generate stories while
considering the character goals or abilities [ 3, 136 ]. Control codes,
such as genre (e.g., is the story fantasy or science fiction?), can also
provide some guidance. Technically, this approach has been enabled
by training models with control codes [ 54, 75 ], or manipulating intermediate representation layers of LMs [ 26, 31 ]. Researchers have
also introduced the approach of first acquiring keywords about the
code, and generating the story based on them [82].
As LMs grow with more parameters, adopting these approaches
became more challenging, as most LM parameters need to be tuned.
To overcome this, researchers train smaller models that guide the
large LMs with control codes [ 83 ]. While many approaches apply
the control to the whole story (e.g., ‘the entire story should be
science fiction’), a few approaches demonstrated how different parameters can be applied to different parts of the story [ 90, 120, 154 ].
However, they did not consider the interaction of the user control
generation algorithms. Building on this prior work, we extend both
the technical and interaction sides of controllable story generation.
We designed our story generation model to be controlled with realvalued sequence inputs from line sketching interaction. There has
been a relevant thread of work called visual story telling [ 10, 60 ś
62, 66, 144 ], that writes stories about visual scenes (e.g., a photo
of a dog running becomes łA dog was chasing down a rabbitž). In
contrast, TaleBrush uses sketches of an abstract attribute of the
story (e.g., the protagonist’s fortune).


**2.3** **Visualizing and Visually Expressing Stories**


To allow users to specify sequential attributes of the story and
capture how texts are generated with controls, TaleBrush adopts
abstract visual representations. Visual techniques have been used to
show high-level attributes of documents [ 73 ] and stories (e.g., [ 17 ]).


CHI ’22, April 29-May 5, 2022, New Orleans, LA, USA Chung et al.



Digital humanities researchers have used visualizations to understand storiesśa form of łdistant readingž [ 71 ]. Through łdistant
readingž, diverse story components can be visualized. These range
from character interactions [ 12, 15, 72, 110, 151 ], event progression [ 59, 92, 137, 138 ], character emotions and sentiment [ 7, 12, 32,
57, 107, 121, 127 ]. As some stories can be non-linear in their telling,
researchers have found ways of representing broader narrative
structures [ 79, 130 ]. Our goal is not simply to represent the story
through the visualization but to allow for manipulation through that
representation. However, not all visualization formats are naturally
amenable to direct manipulation (beyond the standard interaction
techniques [155]).
With TaleBrush, we focus on visual encodings that can both
express high-level changes in the story’s progression but also be
manipulable. Kurt Vonnegut’s story arcs fit these requirements.
The arcs were used by Vonnegut to express canonical story types
with diagrams that show how a protagonist’s fortune changed in
the story [ 142 ]. For example, in Figure 2, Cinderella’s fortune is
expressed with a curve that rises, drastically falls, and then rises
again. Writers have since leveraged this type of visual expression
to plan out story writing [ 34, 100, 122 ]. TaleBrush leverages this
approach to allow for drawing a property, such as fortune, over
time as a way of guiding the generative process.


**2.4** **Sketching Interactions**


To visually express sequential attributes of stories, TaleBrush uses
sketching interaction. Sketching is a flexible and lightweight way
to convey the user’s high-level intentions [ 38 ] with its roughness,
uncertainty, and ambiguity [ 16, 49, 84 ]. Because of these features,
various sketching tools have been built to embody these characteristics [ 49 ] or act as mechanisms to transform rough ideas into
precise representations (e.g., visual renderings [ 84 ]). This interaction style has some similarity to TaleBrush, but without the direct
mapping between objects (e.g., draw a cat to get a photorealistic cat).
In the case of TaleBrush, we are creating a sketch in the abstract
time-series space that will generate a corresponding story in the
‘concrete’ text space.
While sketching is most often used in a ‘direct’ way (e.g., drawing
a sketch), it also has been used for constructing examples (e.g., for
image [ 39, 65 ] or 3D model search [ 81, 112 ]). More relevant to our
approach are tools for sketching time-series ‘queries’ for finding
relevant items in time-series datasets. These can be used to find
everything from fixed patterns [ 74 ] to constrained inputs [ 58, 126 ]
to free sketches [ 37, 42, 96, 132, 148, 157 ]. However, most systems
here assume the existence of matching datasets. In our case, the
dataset does not yet exist. Thus, our approach does not sit cleanly
in the regular taxonomy of visualization interaction [ 55, 155 ]. With
TaleBrush, we leverage recent work on interactive visualization
tools for data generation. However, these are largely focused on
numerical approaches rather than text (e.g., generating a dataset
that matches a sketched histogram [97]).
