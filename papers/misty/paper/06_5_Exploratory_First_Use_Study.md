## 5. Exploratory First-Use Study

To evaluate Misty, we conducted an exploratory, first-use user study with 14 experienced frontend engineers. Our study answers three primary research questions:

1. How do developers utilize the different features in Misty?
2. To what extent do Misty’s outputs satisfy developers’ expectations of conceptual blending?
3. How does Misty and conceptual blending support developers’ workflow?

### 5.1. Participants

For our study, we recruited 14 frontend developers who knew React and Tailwind CSS. Participants worked at a large US technology company and were recruited via internal communication channel advertisements and word of mouth. Our participants varied in frontend development expertise, ranging from two to fifteen years of experience and novice to advanced knowledge of React and Tailwind CSS. Table 1 shows a detailed breakdown of participant demographics. We carried out two study sessions in person and fourteen online, based on the participants’ preferences. Study sessions lasted 60 minutes, and we compensated each participant with a $12 digital gift card.

Table 1. The participant demographics of our user studies. All participants are frontend developers with at least basic knowledge of React and Tailwind CSS, and experience in creating and improving the design of UIs.

| ID | YOE | Main Frontend Tools | React & Tailwind |
| --- | --- | --- | --- |
| P1 | 8 | React | Advanced |
| P2 | 7 | React | Novice |
| P3 | 14 | React, TailwindCSS | Advanced |
| P4 | 12 | ReactJS, SvelteJS | Proficient |
| P5 | 2 | React | Intermediate |
| P6 | 5 | React, TypeScript | Proficient |
| P7 | 13 | React, TailwindCSS | Advanced |
| P8 | 4 | SwiftUI, React | Advanced |
| P9 | 11 | React, Vue | Proficient |
| P10 | 11 | React, NextJS | Proficient |
| P11 | 11 | React, TailwindCSS | Advanced |
| P12 | 15 | React, TailwindCSS | Advanced |
| P13 | 13 | React Ecosystem | Advanced |
| P14 | 5 | SwiftUI, React | Advanced |

Since Misty uses frontend code to represent UIs, we recruited frontend engineers as our participants. Thus, they were able to fully use all features of Misty, especially the code editor, and understand the limitations of current AI models in generating frontend code (Si et al., 2025). All participants had experience creating and improving UIs by themselves, rather than only implementing designs created by designer colleagues (see more discussion in Section 4).

### 5.2. Procedure

We divided our study into the following three steps.
When participants performed the tasks, we asked them to think aloud to provide insights into their cognitive process [Footnote: Section A.1 and A.2 provide a detailed list of questions in our interview and usability questionnaire.]  (Ericsson and Simon, 1980).
We also piloted the study twice to refine the process and validate the tasks were realistic and engaging. These two pilot studies were not included in the above 14 participants.

#### 5.2.1. Step 1 (10 min): Understanding current practices on using examples

We began by exploring participants’ current practices for finding and using design examples. We asked participants about their use of examples in their work, how they find them, and examples that significantly inspired their work. We also asked about their workflow to incorporate these examples into their projects.

#### 5.2.2. Step 2 (35 minutes): Use Misty to perform frontend development tasks through conceptual blending

We then introduced participants to Misty and asked them to perform four frontend development tasks through conceptual blending:

1. Blending a full example UI into the current source UI,
2. Adding the header section of an example UI to the source UI,
3. Updating the source UI layout by blending in a hand-drawn screen sketch,
4. Looking for examples online, and open-ended improvement of the source UI through conceptual blending, until satisfied.

We designed these tasks to progress from constrained to open-ended exploration for the participants. The initial tasks familiarized the participants with Misty’s core functionalities, while the later tasks encouraged application of Misty to more subjective and open-ended design scenarios. The final open-ended task helped us understand how participants might naturally incorporate Misty into their existing workflows. This progression lets us naturally onboard our participants while assessing Misty’s usability, functionality, and potential impact across various design scenarios.
Participants iterated on each task until they were satisfied with the results. We picked three representative UI layouts and components (i.e., book lists, information cards, phone apps) as the basis of these tasks. We asked the participants to perform the first three tasks using one example, but we asked them to pick a different example for the last task to have a clean slate for open-ended exploration.

After each blending operation, participants provided (1) a 5-scale value of how much the results met their expectations, and (2) qualitative feedback on ways to improve the results. These results helped us further understand developers’ expectations and current multimodal AI models’ limitations in UI conceptual blending.

#### 5.2.3. Step 3 (15 minutes): Usability questionnaire and follow-up interview

After completing the tasks, participants completed a questionnaire on their experience using Misty. We adapted the questionnaire from the standard System Usability Scale (Brooke, 1996) and included 5-point Likert scale questions evaluating Misty on its usability, user control and agency, output quality, value for design exploration, and real-world adoption potential. After completing the questionnaire, we conducted a semi-structured interview with participants. The interview questions covered scenarios where participants would or would not use Misty, desired improvements or additional features, concerns about using Misty, and thoughts on how tools like Misty might influence their work.
