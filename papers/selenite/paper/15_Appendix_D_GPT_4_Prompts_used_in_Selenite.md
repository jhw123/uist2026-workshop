## Appendix D GPT-4 Prompts used in Selenite

Here, we outline the techniques we employed to guide the GPT-4 model, developed by OpenAI (OpenAI, 2023b), within the context of Selenite. If not explicitly stated, the temperature of the model is set to 0.3 for a balance between consistency and creativity.

If not explicitly stated, the initial [System Message] [Footnote: The system message helps set the behavior of the model response, i.e., the [Assistant Message] . However, as stated by OpenAI: “… note that the system message is optional and the model’s behavior without a system message is likely to be similar to using a generic message such as ‘You are a helpful assistant’ …” ( https://platform.openai.com/docs/guides/gpt/chat-completions-api )]  was set as the following:

[System Message]

You are a helpful assistant that performs content analysis according to user requests. Follow the user’s requirements carefully and to the letter.

### D.1. Obtaining topic from a web page

The prompt that we used to obtain a concise topic given a web page (with [title] and [content of the first few paragraphs]) is a two-step prompt:

[User Message]

Step 1

Given the following information of an article:

Title:
[title]

First few paragraphs:
[content of the first few paragraphs]

What is this article about?

[Assistant Message]

This article is about ...

[User Message]

Step 2

I want to find articles similar to this one in terms of the general topic. What should I search for? Output one search phrase (in double quotes).

Additionally, we set the n parameter to 10, thereby instructing GPT-4 to produce 10 simultaneous responses. Subsequently, we determined the most commonly occurring one among these 10 as the topic for the article. While it could be assumed that a higher value for n would result in a lengthier response time from the model, our observations indicate that such delay is practically insignificant.

### D.2. Obtaining options from a web page

The prompt that we used to obtain extract options from a given web page (with [title] and [content of the web page]) is a two-step prompt:

[User Message]

Step 1

Given the following information of an article:

Title:
[title]

Is the article likely to be discussing one or more aspects of "one specific option" (e.g., a single javascript framework, for example, React, or a single baby stroller option, or a specific Airbnb listing) or "multiple options/topics"? Output in the following format:

Reasoning: your reasoning process.

Verdict: "one specific option / multiple options"

[Assistant Message]

Reasoning: model’s reasoning process...

Verdict: "one specific option / multiple options"

[User Message]

Step 2

Now, given the content of the article below, what is/are the options?

Content:

[content of the web page]

Output should be in the following format: ["option\_1", "option\_2", ...]

### D.3. Obtaining commonly-considered criteria from a web page

The prompt that we used to obtain a set of commonly considered criteria resembles something like the following (given a [topic]):

[User Message]

Step 1: Ask for an initial set of criteria

What are some common aspects, criteria, or dimensions that people consider on the topic of [topic]? Note that the criteria should be \*\*most relevant to the topic\*\*, \*\*frequently considered\*\*, and can \*\*cover a broad range of perspectives\*\*. Output should be a single bulleted list in the format of:

- Criterion: short description.

Do not output anything else.

[Assistant Message]

- [Criterion 1]: [Short description]

- [Criterion 2]: [Short description]

- [Criterion 3]: [Short description]

...

[User Message]

Step 2+: Ask for additional criteria until we get around 20.

Give me five more that are different from, more diverse than, and possibly as important as the ones listed above. Output in the same format.

### D.4. Obtaining detailed analysis of text content

The prompts that we used to obtain a detailed analysis of text content given the [text content], the list of NLI criteria, and the list of [options] on the corresponding web page is two-fold:

First, we ask GPT-4 to extract phrases from the content that describes a given criterion as well as determine each extracted phrase’s sentiment with respect to the criterion:

[User Message]

Given the following \*\*content\*\* and list of \*\*criteria\*\*:

\*\*Content\*\*:

[content]

\*\*Criteria (with definitions)\*\*:

- [NLI Criterion 1]: [description]

- [NLI Criterion 2]: [description]

...

For each criterion: 1) extract \*\*every possible\*\* utterance that \*\*mentions\*\* or \*\*explicitly describes\*\* that criterion from the content 2) perform sentiment analysis to determine if the utterance is "positive", "neutral", or "negative" with respect to that criterion. Remember to use the \*\*exact same words\*\* from the content. Do not paraphrase!

Output must follow the format below:

## criterion\_1\_name

- "extracted\_sentence\_or\_phrase\_1" -> positive,

- "extracted\_sentence\_or\_phrase\_2" -> neutral,

## criterion\_2\_name

NONE FOUND

## criterion\_3\_name

- "extracted\_sentence\_or\_phrase\_1" -> neutral,

- "extracted\_sentence\_or\_phrase\_2" -> negative,

- "extracted\_sentence\_or\_phrase\_3" -> positive,

Second, we ask GPT-4 to label each extracted phrase with a possible [option] on the web page (we framed options as “subjects” of a phrase to achieve a better empirical performance):

[User Message]

Given the following \*\*content\*\* and the \*\*phrases\*\* extracted from the content below:

\*\*Content\*\*:

[content]

\*\*Extracted phrases\*\*:

- "extracted\_phrase\_1"

- "extracted\_phrase\_2"

- "extracted\_phrase\_3"

...

For each phrase, determine the \*\*subject\*\* of the phrase based on the \*\*content\*\*. Possible subjects are: [option\_1, option\_2, option\_3, ...] Say "N/A" if you cannot determine the subject. Output should be in the following format:

"extracted phrase 1" -> "subject" or "N/A"

"extracted phrase 2" -> "subject" or "N/A"

...
