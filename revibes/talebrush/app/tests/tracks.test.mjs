import test from 'node:test';
import assert from 'node:assert/strict';
import {applyStroke,insertSlot,removeSlot} from '../static/core.mjs';
import {upgradeDraft,migrateSaved,activeTrack,trackView,addCharacter,removeCharacter,renameCharacter,addDimension,removeDimension,invalidateScores,scoredPairs,recordPlannedRange} from '../static/tracks.mjs';

const legacy=()=>({title:'Saved story',protagonist:'Mike',slots:[{id:'a',text:'Mike arrived.',source:'human',fortune:.6},{id:'b',text:'',source:'human',fortune:null}],controls:[null,{target:.2,tolerance:.1}],surprises:[.2,null],lastRange:[1],showSurprise:true});

test('migration preserves the old draft, fortune arc and every history snapshot',()=>{
  const old=legacy(),saved={draft:old,history:[{id:'h',label:'Original',draft:legacy()}]};
  const upgraded=migrateSaved(saved);
  assert.equal(upgraded.draft.characters[0].name,'Mike');
  assert.equal(upgraded.draft.dimensions.length,4);
  assert.deepEqual(activeTrack(upgraded.draft).values,[.6,null]);
  assert.equal(activeTrack(upgraded.draft).controls[1].target,.2);
  assert.equal(upgraded.history[0].draft.slots[0].text,'Mike arrived.');
  assert.equal(old.protagonist,'Mike');
  assert.equal(old.schemaVersion,undefined);
  assert.deepEqual(upgradeDraft(upgraded.draft),upgraded.draft);
});

test('character and dimension switches preserve independent sketches',()=>{
  const state=upgradeDraft(legacy()),mike=state.activeCharacterId;
  const maya=addCharacter(state,'Maya','A rival drummer');
  state.activeCharacterId=maya.id;state.activeDimensionId='confidence';
  applyStroke(activeTrack(state).controls,[{x:1,y:.1,t:0}],2);
  assert.equal(activeTrack(state).controls[1].target,.9);
  state.activeCharacterId=mike;state.activeDimensionId='fortune';
  assert.equal(activeTrack(state).controls[1].target,.2);
  assert.equal(trackView(state).slots[0].fortune,.6);
  assert.equal(scoredPairs(state).length,2);
});

test('insertion and deletion align every character/dimension track',()=>{
  const state=upgradeDraft(legacy());addCharacter(state,'Maya');
  for(const track of Object.values(state.tracks)){track.values=[.4,.8];track.controls=[null,{target:.8,tolerance:.1}];}
  insertSlot(state,1,{id:'new',text:'',source:'human'});
  for(const track of Object.values(state.tracks)){assert.deepEqual(track.values,[.4,null,.8]);assert.equal(track.controls[2].target,.8);}
  removeSlot(state,1);
  for(const track of Object.values(state.tracks))assert.deepEqual(track.values,[.4,.8]);
});

test('renaming invalidates only that character and removal keeps other tracks',()=>{
  const state=upgradeDraft(legacy()),mike=state.activeCharacterId,maya=addCharacter(state,'Maya');
  state.tracks[`${maya.id}:fortune`].values=[.8,null];
  renameCharacter(state,mike,'Miles','A pianist');
  assert.deepEqual(state.tracks[`${mike}:fortune`].values,[null,null]);
  assert.equal(state.tracks[`${maya.id}:fortune`].values[0],.8);
  removeCharacter(state,mike);
  assert.equal(state.characters.length,1);
  assert.ok(Object.values(state.tracks).every(t=>t.characterId===maya.id));
  assert.throws(()=>removeCharacter(state,maya.id),/at least one/i);
});

test('custom dimensions need distinct endpoints and survive in all characters',()=>{
  const state=upgradeDraft(legacy());addCharacter(state,'Maya');
  assert.throws(()=>addDimension(state,'Trust','Low','low'),/different/i);
  const dim=addDimension(state,'Trust','Distrustful','Trusting');
  for(const char of state.characters)assert.ok(state.tracks[`${char.id}:${dim.id}`]);
  assert.throws(()=>addDimension(state,'trust','Low','High'),/already/i);
  state.activeDimensionId=dim.id;removeDimension(state,dim.id);
  assert.equal(state.activeDimensionId,'fortune');
  assert.throws(()=>removeDimension(state,'fortune'),/built-in/i);
});

test('text changes clear scores from that sentence onward across all tracks',()=>{
  const state=upgradeDraft(legacy());
  for(const track of Object.values(state.tracks))track.values=[.4,.8];
  invalidateScores(state,1);
  for(const track of Object.values(state.tracks))assert.deepEqual(track.values,[.4,null]);
});

test('manual planning accumulates sections across multiple curves and clears after structural edits',()=>{
  const state=upgradeDraft(legacy());state.autoGenerate=false;
  recordPlannedRange(state,[0]);recordPlannedRange(state,[1]);
  assert.deepEqual(state.plannedRange,[0,1]);
  insertSlot(state,1,{id:'new',text:'',source:'human'});
  assert.deepEqual(state.plannedRange,[]);
});
