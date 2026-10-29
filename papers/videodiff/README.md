# VideoDiff: Human-AI Video Co-Creation with Alternatives

Mina Huh, Dingzeyu Li, Kim Pimmel, Hijung Valentina Shin, Amy Pavel and Mira Dontcheva. CHI 2025. [doi:10.1145/3706598.3713417](https://doi.org/10.1145/3706598.3713417)

## What is here

- `paper/`: the paper split into 14 Markdown files and 11 figure images, made from the arXiv HTML version, which arXiv renders from the authors' LaTeX source. Each top-level section is one Markdown file; math is written as LaTeX and tables as Markdown tables. Figures are the original image files.

- `materials/`: two narrated videos with their transcripts, so the system can run without a Whisper API key. See `materials/README.md`.

Give `paper/` to the coding agent. This README stays outside it so the agent sees only the paper.

## Source and license

Text and figures are from [arXiv 2502.10190v1](https://arxiv.org/abs/2502.10190v1), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The authors hold the copyright.

## Changes from the original

- Reformatted into one Markdown file per section.
- Running headers, footers and page numbers removed.
- Figures or tables that their own section never mentions were moved to the section that first refers to them:
  - Figure 1 (teaser), placed before the abstract in the source, moved into Section 1, which refers to it.
  - Table 4 (participant demographics for all studies) moved from Appendix A into Section 3, which refers to it.
- Nothing was reworded or shortened. Footnotes are marked [Footnote: ...] and the authors' figure descriptions are labelled as such.

## Known issues

- Figures 8 and 9 (study results charts) are drawn in LaTeX and are cropped from the PDF.

## Files

- `00_Front_Matter.md`
- `01_Abstract.md`
- `02_1_Introduction.md`
- `03_2_Related_work.md`
- `04_3_Formative_study.md`
- `05_4_VideoDiff.md`
- `06_5_User_Evaluation.md`
- `07_6_Exploratory_Case_Studies.md`
- `08_7_Discussion.md`
- `09_8_Conclusion.md`
- `10_Appendix_A_PARTICIPANTS.md`
- `11_Appendix_B_Augmentation_Prompts.md`
- `12_Appendix_C_User_Study_Examples.md`
- `13_References.md`
