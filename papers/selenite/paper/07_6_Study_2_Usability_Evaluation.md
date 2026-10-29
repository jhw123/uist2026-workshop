## 6. Study 2: Usability Evaluation

|  | Mental demand | Physical demand | Temporal demand | Performance | Effort | Frustration |
| --- | --- | --- | --- | --- | --- | --- |
| Selenite | $3.0~(3.03\pm 1.76)$\* | $1.0~(0.51\pm 1.74)$ | $2.5~(2.26\pm 1.68)$\* | $8.5~(8.47\pm 1.32)$\* | $3.5~(4.08\pm 1.88)$\* | $0.5~(0.33\pm 1.51)$ |
| Baseline | $6.5~(6.43\pm 2.07)$\* | $1.0~(0.79\pm 1.98)$ | $4.0~(4.29\pm 2.08)$\* | $6.5~(6.54\pm 1.73)$\* | $6.0~(5.98\pm 2.23)$\* | $1.0~(0.89\pm 1.91)$ |

Table 3. Study 2 participants’ responses to NASA TLX questions (on a scale from 0 to 10) in study 2. Format: median (mean $\pm$ standard deviation). Statistically significant differences (p < 0.05) through t-tests are marked with an \*.

| Question category | Statement | Response |
| --- | --- | --- |
| Comprehensibility | I would consider my interactions with the tool to be understandable and clear. | $6~(6.33\pm 1.10)$ |
| Learnability | I would consider it easy for me to learn how to use this tool. | $7~(6.71\pm 1.04)$ |
| Enjoyability | I enjoyed the features provided by the tool. | $6~(6.13\pm 1.72)$ |
| Applicability | Using this tool would make solving sensemaking problems more efficient and effective. | $6~(6.28\pm 1.39)$ |
| Recommendability | If possible, I would recommend the tool to my friends and colleagues. | $6~(6.23\pm 0.94)$ |

Table 4. Study 2 participants’ responses to System Usability Scale questions (on a scale of 1 to 7, where 1 represents “strongly disagree” and 7 represents “strongly agree”) in study 2 regarding their Selenite experience. Format: median (mean $\pm$ standard deviation)

We also conducted an initial usability study to evaluate if the features provided by Selenite are usable and if the approach of providing global as well as contextual grounding can allow users to read, navigate, and comprehend information more efficiently.
Specifically, we were interested in the following quantitative research questions:

- [RQ1] Does using Selenite speed up people’s process of reading and understanding information?
- [RQ2] Does using Selenite help people achieve a more comprehensive understanding of an information space?
- [RQ3] Can Selenite help people obtain new information in addition to their existing knowledge?

### 6.1. Methodology

We recruited 12 participants (five female, seven male) aged 21-40 ($\mu$ = 28.9, $\sigma$= 5.2) through social media. Participants were required to be 18 or older and fluent in English.
All participants reported that they regularly engage in the process of seeking and sifting through large volumes of online information, whether for professional or personal purposes, on a weekly basis.

The study was a within-subjects design, where participants were presented with two tasks and were asked to complete each one under a different condition, counterbalanced for order. For each task, participants were given a topic that they needed to investigate and two web pages relevant to the topic that they were required to read and process. The two topics were *“best baby strollers”*
and *“best robot vacuums.”* [Footnote: To ensure realism and participant engagement, the tasks were selected based on actual topics that the formative study participants reported investigating. Rather than letting participants search for their own pages to read from the get-go, we provided them with a predefined set of pages to enable a fair comparison of the results (e.g., speed, etc.).
Requiring participants to use predefined pages (each contains, on average, 15 screenfuls of content) for the first portion of the study also helps ensure that the two tasks are of roughly equal difficulty in terms of reading and cognitive processing effort. As described in the results, there was no significant difference by task.]
The provided two web pages for each topic were all product comparison pages used in the previous study (see section 5.1).
For each task, participants were
asked to read through the two required pages, either by themselves without any aid (a *control* condition simulating how people normally read) or with Selenite (*experimental* condition). While reading, they were instructed to write down *as many* criteria as they learned and thought were important for the topic as well as the reason why they were important as if they needed to thoroughly explain the topic to a friend later. Then, participants were instructed to optionally search (using Google) and gather additional information that they still wanted to learn about but weren’t able to from reading the two required pages.
We imposed a 25-minute limit per task to keep participants from getting caught up in one of the tasks. However, they were instructed to inform the researcher that they felt like they could make no further progress, i.e., having learned as much as they could about the given topic.

Each study session started by obtaining consent and having participants fill out a demographic survey. Participants were then given a 5-minute tutorial showcasing the various features of Selenite and a 5-minute practice session before starting. At the end of the study, the researcher conducted a NASA TLX survey and a questionnaire, eliciting feedback on their experience in both conditions.
Each study session took around one hour, using a designated Macbook Pro computer with the latest version of Chrome and Selenite installed, and was conducted remotely via Zoom.
Each participant was compensated with $15 USD. The study was approved by our institution’s IRB.

### 6.2. Results

All participants were able to complete all tasks in both conditions, and nobody went over the pre-imposed time limit. Below, we present primarily quantitative evidence to evaluate the usability
of Selenite with respect to our research questions.

First, we were interested in understanding if Selenite can help participants read and process information faster compared to the baseline condition (RQ1). To examine this, we measured the time it took for them to finish reading all the materials in each task. A two-way repeated measures ANOVA was conducted to examine the within-subject effects of the condition (baseline vs. Selenite) and task on completion time. There was a statistically significant effect of condition (F(1, 20) = 102.5, p < 0.01) such that participants completed tasks significantly faster (36.3%) with Selenite (Mean = 840.3 seconds, SD = 102.7 seconds) than in the baseline condition (Mean = 1319.3 seconds, SD = 120.0 seconds). There was no significant effect of task (F(1, 20) = 0.40, p = 0.53), indicating the two tasks were indeed of roughly equal difficulty. These results suggest that Selenite helped participants read and comprehend information more efficiently.
We discuss additional qualitative insights into why Selenite was more efficient in the following open-ended case study (section 7.2).

In addition, we were interested in understanding if Selenite can help participants achieve a more comprehensive understanding of a topic (RQ2). To measure this, we first compared the *quantity* of criteria that participants externalized under each condition. As a pre-filtering step, two researchers rated all the criteria that participants externalized as either *valid* or *invalid* blind to the conditions. Valid criteria are considered as ones that are *relevant* to the topic and *backed by specific evidence* that can be traced back to the content, consistent with those standards used by prior work in judging the quality of subjective evidence (Chang et al., 2020). After resolving conflicts (which were minimal) between the two researchers and filtering out the criteria that were invalid, we found that the average total number of valid criteria increased by 90.4% when using Selenite (Mean = 12.93, SD = 3.90) compared to the baseline condition (Mean = 6.79, SD = 4.07), which is statistically significant (p < 0.01) under a t-test. Thus, using Selenite appeared to enable participants to identify and learn significantly more criteria about a topic compared to people’s current way of reading information.

In addition to quantity, we also examined the *quality* of the criteria by comparing the ones that participants externalized with the groundtruth criteria curated in the previous accuracy and coverage evaluation — we can calculate the precision (calculated as $n\_{\textbf{Hit}}/n\_{\textbf{Total}}$) and recall (calculated as $n\_{\textbf{Hit}}/n\_{\textbf{Groundtruth}}$) of participants’ criteria that *hit* the groundtruth (where $n\_{\textbf{Total}}$ is the total number of valid criteria participants externalized, and $n\_{\textbf{Groundtruth}}$ is the number of groundtruth criteria for each task). On average, participants in the Selenite condition achieved significantly higher precision (98.8% vs. 78.4%, p < 0.05) and recall (73.0% vs. 30.4%, p < 0.05) in both tasks. Thus, using Selenite appeared to have enabled participants to improve the quality of their understanding of an information space in terms of its criteria.

Furthermore, to understand if Selenite can help participants obtain new information in addition to what they have already learned from reading the two required pages (RQ3), we examined:
1) the number of additional searches that they performed in the Selenite condition (Mean = 2.01, SD = 1.39), which turned out to be significantly more (p < 0.05) than the baseline condition (Mean = 0.33, SD = 0.62);
2) the number of additional pages visited in the Selenite condition (Mean = 2.76, SD = 2.32), which turned out to be significantly more (p < 0.05) than the baseline condition (Mean = 0.42, SD = 0.74); and
3) the number of additional criteria that participants externalized in the Selenite condition (Mean = 1.58, SD = 0.91), which turned out to be significantly more (p < 0.05) than the baseline condition (Mean = 0.33, SD = 0.22). These results suggest that Selenite did encourage and help participants to seek additional information beyond their existing perspective.

Last but not least, participants filled out a NASA TLX (Hart and Staveland, 1988) cognitive load scale and a System Usability Scale (SUS) (Lewis, 2018) questionnaire for each condition. SUS Likert items were integer-coded on a scale from 1 (strongly disagree) to 7 (strongly agree). The median response values are presented in Tables 3 and 4. Notably, participants perceived Selenite to have significantly lowered workload across mental, temporal, and effort demands as well as significantly increased perceived performance based on paired t-tests). This suggests that using Selenite can reduce the cognitive load and interaction costs when reading and understanding information, even when users had to learn and get used to a new user interface.
