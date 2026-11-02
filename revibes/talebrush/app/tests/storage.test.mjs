import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSavedWorkspace,saveWorkspace} from '../static/storage.mjs';
import {newDraft} from '../static/core.mjs';

test('a failed backup never allows later edits to replace the original',()=>{
  const original=JSON.stringify({draft:newDraft(),history:[]}),data=new Map([['draft',original]]);
  const storage={getItem:key=>data.get(key)??null,setItem(key,value){if(key!=='draft')throw new Error('Quota exceeded');data.set(key,value);}};
  const loaded=loadSavedWorkspace(storage,'draft');
  assert.equal(loaded.writable,false);
  assert.equal(saveWorkspace(storage,'draft',{draft:newDraft()},loaded.writable),false);
  assert.equal(data.get('draft'),original);
});

test('a malformed newer draft is preserved rather than replaced with the seed',()=>{
  const original=JSON.stringify({draft:{schemaVersion:2},history:[]}),data=new Map([['draft',original]]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  const loaded=loadSavedWorkspace(storage,'draft');
  assert.equal(loaded.writable,false);
  assert.equal(saveWorkspace(storage,'draft',{draft:newDraft()},loaded.writable),false);
  assert.equal(data.get('draft'),original);
});
