import test from 'node:test';
import assert from 'node:assert/strict';
import {applyStroke, emptySlot, insertSlot, removeSlot, generationIndices, toleranceForSpeed} from '../static/core.mjs';

test('a stroke interpolates every crossed sentence, including sparse pointer events', () => {
  const controls = Array(6).fill(null);
  const changed = applyStroke(controls, [{x: .2, y: .9, t: 0}, {x: .8, y: .1, t: 600}], 6);
  assert.deepEqual(changed, [1, 2, 3, 4]);
  assert.equal(controls[0], null);
  assert.ok(controls[1].target < controls[4].target);
});

test('a tap sets exactly one sentence and erasing leaves an unconstrained gap', () => {
  const controls = Array(5).fill(null);
  assert.deepEqual(applyStroke(controls, [{x: .5, y: .3, t: 0}], 5), [2]);
  assert.equal(controls[2].target, .7);
  applyStroke(controls, [{x: .5, y: .3, t: 0}], 5, true);
  assert.equal(controls[2], null);
});

test('slow sketching creates tighter control than fast sketching', () => {
  assert.ok(toleranceForSpeed(.05) < toleranceForSpeed(2));
});

test('slot insert/delete keeps controls and surprise aligned', () => {
  const state = {slots: [emptySlot('A'), emptySlot('B')], controls: [{target: .4}, {target: .8}], surprises: [.2, .9], lastRange: [0, 1]};
  insertSlot(state, 1, emptySlot());
  assert.equal(state.slots[2].text, 'B');
  assert.equal(state.controls[1], null);
  assert.equal(state.surprises[2], .9);
  removeSlot(state, 1);
  assert.deepEqual(state.controls, [{target: .4}, {target: .8}]);
});

test('redrawing targets only the touched range and preserves author anchors', () => {
  const slots = [emptySlot('Opening'), emptySlot(), {...emptySlot('Generated'), source: 'ai'}, emptySlot('Ending')];
  assert.deepEqual(generationIndices(slots, [0, 1, 2, 3]), [1, 2]);
  assert.deepEqual(generationIndices(slots, [2]), [2]);
});
