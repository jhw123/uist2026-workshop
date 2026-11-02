(() => {
  const progress = (topic, page) => {
    const namesFor = current => Object.values(current?.labels || {}).flatMap(label => label.criteria);
    const readFor = current => Object.entries(current?.labels || {}).filter(([id]) => current.read.includes(id)).flatMap(([, label]) => label.criteria);
    const cared = [...new Set(Object.values(topic.pages).flatMap(readFor))];
    const present = new Set(namesFor(page));
    const currentRead = new Set(readFor(page));
    const covered = [...new Set(Object.values(topic.pages).flatMap(namesFor))];
    return {cared, skipped: [...present].filter(name => !currentRead.has(name)), covered,
      unseen: topic.criteria.map(item => item.name).filter(name => !covered.includes(name))};
  };
  const nextIndex = (length, previous, direction) => previous === undefined
    ? (direction > 0 ? 0 : length - 1) : (previous + direction + length) % length;
  const phraseSegments = (text, phrases) => {
    const ranges = [];
    phrases.forEach(phrase => {
      if (!phrase.quote) return;
      let start = text.indexOf(phrase.quote);
      while (start >= 0) {
        ranges.push({start, end: start + phrase.quote.length, phrase});
        start = text.indexOf(phrase.quote, start + phrase.quote.length);
      }
    });
    const boundaries = [...new Set(ranges.flatMap(range => [range.start, range.end]))].sort((left, right) => left - right);
    return boundaries.slice(0, -1).map((start, index) => ({start, end: boundaries[index + 1],
      phrases: ranges.filter(range => range.start <= start && range.end >= boundaries[index + 1]).map(range => range.phrase)}))
      .filter(segment => segment.phrases.length);
  };
  globalThis.SeleniteLogic = {progress, nextIndex, phraseSegments};
})();
