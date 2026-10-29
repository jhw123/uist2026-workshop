**8** **DISCUSSION**


While TaleBrush is currently focused on character fortune, we
reflect lessons learned for control design and for iterative humanAI co-creation.


**8.1** **The Gulf of Human-AI Co-Creation**


Our design for interactive controls addresses challenges in the
gulf of execution and evaluation [ 109 ] between the user and the
generative AI systems. A key feature is reducing the friction in
the iterative co-creation process. First, the **control interaction** of
TaleBrush is designed to be expressive and easy. These are often
conflicting goals: simple interfaces have limited expressiveness and
expressive interfaces are not simple. However, this balance is clearly
needed for closing the gulf of execution but is missing in many
existing interactive approaches to co-creation. Second, to minimize
the gulf of evaluation, **sensemaking** of generated results should be
facilitated. Users should be able to more easily understand how the
given controls relate to what the AI generated. This is often missed
in ‘explainable’ AI approaches. The explanation does not map to
either the user’s intent or how they interface with the software.


**8.2** **Generalizing Line Sketching Control**


Beyond story generation, line sketching can potentially be adopted
for other applications that generate content with sequence attributes. This is particularly true in domains where we can operationalize and encode features of the content as drawings. For
example, poetry [ 14 ] and lyrics [ 147 ] can be visualized based on
moods or rhythms. One indicator of whether the line sketching
approach is appropriate for a generative context is if time-series
style visualizations already exist in that medium. For example, in
audio, we can visualize (and partially control) changes in volume
over time. This can be extended to support more powerful types of
guidance. For example, a composer could control rhythmic density
or melodic contour [ 2 ] of generated outputs. Similarly, a sketch line
could be used with a text-to-speech generator for flexible micro
expression control (e.g., pace or aggressiveness) [128].



**8.3** **Disagreement Between Human and AI**


In our experiments, we found situations in which the controlled
generation do not satisfy a user’s expectation, and the generated
text’s fortune level might not accord with the given controls. This
can be due to algorithmic error, either from the controlled generation or recognition. However, we found that in some cases this
was a result of an implausible request (e.g., drastic fluctuation of
fortune). Dramatic fluctuations are not often observed in real text
and the generative algorithms may not be able to generate suitable
text. To address this, we might limit how much the sketch can move
between time steps (e.g., a smoothing). Alternatively, we can leverage the ambiguity and undetermined nature of sketching [ 49, 84 ]
to communicate uncertainty in control. In our prototype, as the
user sketches, we show a wide range where the generated output
would likely fall. While these design elements manage user expectations on the tightness of the control, our user study found that
users would want more sensitive controls when they iterate over
generations with small changes in parameters. The sketch-speed
approach is one way to allow users to encode how ‘tightly’ they
want the story to fit. However, it may be worth considering alternative approaches in the future (e.g., explicitly selecting different
‘pen’ widths or experimenting with things like pen pressure).
As our user study revealed, the writer’s perception of the protagonist’s fortune can also be misaligned with how the tool recognizes
it. Adapting the machine’s fortune scale to the user’s perception can
be a way to solve this. For example, we can allow users to revise the
machine recognition results based on their perception of the text
(e.g., by moving the line the machine drew). This can be fed back to
the underlying classifier to learn the user’s scale of fortune. To enable such interactions with low user effort, it should be technically
possible to adjust models with few data instances from the user.
Recent language model tuning approaches, including soft prompt
tuning [ 87, 93 ], may support this approach. In some situations, the
user’s expectation may be mismatched due to the potential bias
in the model or training data. For example, our study participants
mentioned the model seemed to show biased behaviors, such as
generating stories more likely written in western cultures, which
might be due to skewed distribution in the variety of stories [ 9 ]. To
alleviate this problem, we can try pretraining big language models
with balanced data [ 9 ] or having a controllable module that tries to
control these biases [76, 91].


**8.4** **Further Support in Story Co-creation**

Story attributes other than the protagonist’s fortune (e.g., conflict,
settings) can also steer the story flow. To decide which attribute
to support, the writer’s specific needs should be understood first.
Based on the identified attribute, visual controls can be designed
to assure expressive and simple control for the attribute. For example, if writers want textual keywords to be used as control [ 152 ],
placing keywords along the story sequence axis can be one design
option. Alternatively, if a writer wants to convey condensed information about character interaction, diagramming a character
network graph can be a control option [ 4 ]. For example, one could
imagine drawing multiple instances of a network diagram to guide
the AI by which characters in a story should interact and how.
Alternative sketched representations are worth studying both for


TaleBrush: Sketching Stories with Generative Pretrained Language Models CHI ’22, April 29-May 5, 2022, New Orleans, LA, USA



text generation [ 103 ] and beyond. To support these, the dataset
and algorithmic pipeline would need to be expanded based on the
attribute to be controlled.
For specific story domains, such as screenwriting, generation
can be extended to adopt the łshow, not tellž approach. For such
extensions, the dataset would need to be constructed with screen
scripts while the algorithms would also need to consider the latent
fortune states throughout the story.
TaleBrush can potentially be extended to support the authoring of high-fidelity, longer text. To provide such support, the tool
would need to consider writers in the translation stage [ 44, 48 ],
where ideas and plans are transformed into detailed text. Hence,
generative tools should be able to follow the writer’s specifications.
The annotation approach would also need to be reconsidered, such
as annotating the fortune of the character after summarizing the
long text with crowdsourcing [ 141 ] or algorithms [ 8 ]. Moreover,
the control and sensemaking should be re-designed for longer text.
For example, a tool might allow the writer to first sketch an outline
and then a detailed story [ 40 ]. A more complete tool might enable
a long-term study of how co-creation impacts writing.


**8.5** **Limitation and Future Work**


In this work, we qualitatively investigated how writers would use
TaleBrush and sketching interactions. Future work can investigate
how proposed interactions impact the story writing compared to
writers’ current practices or when controlled generation is used
without sketching interactions. Moreover, we did not look into
how each function impacts story writing separately. For example,
how would the control of surprise impact the writing experience
alone? To answer such questions, more controlled user experiments
would be needed. While our annotation approach produced usable
data, we identified ways it could be improved in the future. While
collecting comparison information with the slider interface, we saw
that how calibrating sentences were annotated would impact the
annotation results. For example, if one calibrating sentence has been
annotated with maximum fortune and the annotator later realizes

that one of the task sentences has higher fortune, the annotator
would either not annotate accurate comparison information or need
to re-annotate the calibrating sentence. One possible approach is
to modify the interface so that sliders can be extended without
having maximum or minimum ends. Finally, while the training
data specified which character’s fortune should be steered, the
trained model frequently coupled multiple characters’ fortunes. For
example, in the story about Bob and Alice, it is hard to make Bob
have a good fortune and Alice have a bad one. Explicit control of
multiple characters’ fortune can be one future work direction to
handle this limitation.
