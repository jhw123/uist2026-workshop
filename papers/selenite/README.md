# Selenite: Scaffolding Online Sensemaking with Comprehensive Overviews Elicited from Large Language Models

Michael Xieyang Liu, Tongshuang Wu, Tianying Chen, Franklin Mingzhe Li, Aniket Kittur and Brad A. Myers. CHI 2024. [doi:10.1145/3613904.3642149](https://doi.org/10.1145/3613904.3642149)

## What is here

- `paper/`: the paper split into 18 Markdown files and 5 figure images, made from the arXiv HTML version, which arXiv renders from the authors' LaTeX source. Each top-level section is one Markdown file; math is written as LaTeX and tables as Markdown tables. Figures are the original image files.

Give `paper/` to the coding agent. This README stays outside it so the agent sees only the paper.

## Source and license

Text and figures are from [arXiv 2310.02161v4](https://arxiv.org/abs/2310.02161v4), licensed [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/). The authors hold the copyright.

## Changes from the original

- Reformatted into one Markdown file per section.
- Running headers, footers and page numbers removed.
- Figures or tables that their own section never mentions were moved to the section that first refers to them:
  - Figure 2 (overview of Selenite's stages) moved from Section 3 into Section 4, which refers to it.
  - Table 6 (groundtruth criteria) moved from Appendix B into Section 5, which refers to it.
- Nothing was reworded or shortened. Footnotes are marked [Footnote: ...] and the authors' figure descriptions are labelled as such.

## Files

- `00_Front_Matter.md`
- `01_Abstract.md`
- `02_1_Introduction.md`
- `03_2_Related_Work.md`
- `04_3_Formative_Study_Design_Goals.md`
- `05_4_The_Selenite_System.md`
- `06_5_Study_1_Intrinsic_Evaluation.md`
- `07_6_Study_2_Usability_Evaluation.md`
- `08_7_Study_3_Open_ended_Case_Study.md`
- `09_8_Discussion.md`
- `10_9_Limitations_Future_Work.md`
- `11_10_Conclusion.md`
- `12_Appendix_A_Unfamiliar_Topics_Participants_Explored_in_the_Fo.md`
- `13_Appendix_B_Study_1_Details.md`
- `14_Appendix_C_Topics_Explored_in_Study_3.md`
- `15_Appendix_D_GPT_4_Prompts_used_in_Selenite.md`
- `16_Appendix_E_Other_Implementation_Details.md`
- `17_References.md`
