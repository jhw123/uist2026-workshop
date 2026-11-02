const assert = require('node:assert/strict');
const {test} = require('node:test');
require('./logic.js');
const {progress, nextIndex, phraseSegments} = globalThis.SeleniteLogic;

test('previously read criteria can still be skipped on the current page', () => {
  const first = {labels: {p0: {criteria: ['Price']}}, read: ['p0']};
  const second = {labels: {p0: {criteria: ['Price', 'Comfort']}}, read: []};
  const topic = {criteria: [{name: 'Price'}, {name: 'Comfort'}, {name: 'Safety'}], pages: {first, second}};
  assert.deepEqual(progress(topic, second), {
    cared: ['Price'], skipped: ['Price', 'Comfort'], covered: ['Price', 'Comfort'], unseen: ['Safety']
  });
  second.read.push('p0');
  assert.deepEqual(progress(topic, second).skipped, []);
});

test('next and previous traverse all mentions and wrap', () => {
  assert.equal(nextIndex(3, undefined, 1), 0);
  assert.equal(nextIndex(3, 0, 1), 1);
  assert.equal(nextIndex(3, 2, 1), 0);
  assert.equal(nextIndex(3, undefined, -1), 2);
  assert.equal(nextIndex(3, 0, -1), 2);
});

test('overlapping and repeated phrases keep all criterion associations', () => {
  const text = 'easy fold and easy fold';
  const phrases = [{quote: 'easy fold', criterion: 'Portability'}, {quote: 'fold', criterion: 'Ease'}];
  const segments = phraseSegments(text, phrases);
  assert.equal(segments.length, 4);
  assert.deepEqual(segments[1].phrases.map(item => item.criterion), ['Portability', 'Ease']);
  assert.equal(text.slice(segments[3].start, segments[3].end), 'fold');
});
