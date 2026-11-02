// What a sentence's fortune depends on: the protagonist, up to three previous
// sentences (the paper's recognition context) and the sentence itself.

const squash = (t) => t.replace(/\s+/g, " ").trim();

export function contextFor(sentences, index) {
  const prev = [];
  for (let i = index - 1; i >= 0 && prev.length < 3; i--) {
    const t = squash(sentences[i].text);
    if (t) prev.unshift(t);
  }
  return prev;
}

export function recognitionKey(protagonist, sentences, index) {
  return JSON.stringify([squash(protagonist), contextFor(sentences, index), squash(sentences[index].text)]);
}
