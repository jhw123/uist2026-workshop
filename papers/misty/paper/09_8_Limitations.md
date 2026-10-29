## 8. Limitations

### 8.1. User Study Limitations

Our study participants were frontend developers recruited from a single US-based technology company. Other roles, such as UI/UX designers, may have different experiences with conceptual blending using Misty than developers. US-centric participants may also limit our understanding of how different culture design preferences might affect usage patterns and UI outputs. The first-use study format and controlled task environment may not always reflect how Misty would be used in real-world scenarios. A longitudinal study of Misty being used in the wild can be a valuable future work to answer these questions.

### 8.2. System and Technical Limitations

Misty works with static, single-screen mobile UI. It does not support the conceptual blending of interactive prototypes and UI animations. Understanding multi-screen, interactive UI prototypes with AI has been an active research area (Wu et al., 2023a; Lu et al., 2024a; Zhang et al., 2025). UI motion design protocols such as Lottie Files (LottieFiles, 2024) also make conceptual blending of UI animations easier. We expect to build Misty on top of these work to extend its blending capabilities.

Misty only supports accessibility incidentally (Wobbrock et al., 2011; Apple Inc., 2024a; Stephanidis et al., 1998; Swearngin et al., 2024). Misty can incorporate accessibility design best practices (Apple Inc., 2024a)—for example, by including post-hoc checking mechanisms to ensure accessibility—such as the ones in DesignChecker (Huh and Pavel, 2024). Adopting an ability-based design approach, Misty can also generate blending outputs based on user abilities, to serve diverse users’ needs.

Misty also does not consider cross-cultural design (Plocher et al., 2021; Hofstede, 2009; Bourges-Waldegg and Scrivener, 1998; Kellogg and Thomas, 1993) in conceptual blending. Research has shown that users from different cultures have diverse preferences for AI capabilities, control, and connections (Ge et al., 2024). Cultural contexts also influence how AI models and users influence each other’s decision making (Lee and Joshi, 2020). Misty could adopt more culturally-aware AI models in generating blending outputs (Suzuki, 2023; Robinson, 2020). Co-designing and testing Misty with users from different cultures can also help us see how their preferences and desired outputs may differ (Heaton, 2002).

### 8.3. Responsible AI Considerations in UI Prototyping

Practitioners and researchers have been incorporating Responsible AI and AI ethics into technical systems (Amershi et al., 2019; Wright et al., 2020; Shneiderman, 2020; Wang et al., 2023a; Varanasi and Goyal, 2023; Ali et al., 2023). Systems and toolkits have been proposed in HCI research to support Responsible AI in design and development workflows (Munechika et al., 2022; Cabrera et al., 2019; Wexler et al., 2019; Wang et al., 2022).

The boundary of “ethical” and “unethical copying” in UI/UX is fluid. Much of today’s UI design and development builds upon established design patterns to prioritize usability over creativity (Talton et al., 2012; Lu et al., 2024a). Also, open-source communities promote re-using and re-purposing pre-built UI components (Bach and Twidale, 2010; Zilouchian Moghaddam et al., 2012; Apple Inc., 2024b; Shadcn, 2024).

Before AI adoption in design tools, we already witnessed increased homogenization of website design (Goree et al., 2021). AI-enabled prototyping workflows, like Misty, can amplify this trend (Anderson et al., 2024). Automated prototyping tools raise questions about authorship and intellectual property. They risk copyright infringement and can spread biased design choices. Guidelines and ethical oversight can ensure these tools support creative freedom and minimize harm.

In Misty, we evaluated the experience of conceptual blending to understand its impact on UI prototyping workflows. Misty does not currently have safeguards. Design opportunities exist for Misty to prioritize Responsible AI considerations. For example, researchers can visualize an AI model’s conceptual blending outputs, to help users understand the output distributions. Combined with visual analytics (Wexler et al., 2019; Munechika et al., 2022), this could help users discover and understand AI model biases. Furthermore, in-situ support similar to Farsight (Wang et al., 2024) could increase users’ Responsible AI awareness in prototyping and adopting blending outputs. Future research in this direction can lead to research insights for conceptual blending in UI prototyping.
