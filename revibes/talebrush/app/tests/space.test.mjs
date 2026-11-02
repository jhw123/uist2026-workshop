import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPoint,dragInPlane,spaceAxes,pointCoordinates,setPointTargets,pickProjectedPoint} from '../static/space-math.mjs';
import {upgradeDraft,addDimension,activeTrack} from '../static/tracks.mjs';
import {newDraft} from '../static/core.mjs';
const camera={yaw:.7,pitch:-.4,zoom:1};

test('3D rotation changes a point projection without changing its attribute values',()=>{
  const point=[.2,.7,.9],before=[...point];
  assert.notDeepEqual(projectPoint(point,camera,800,400),projectPoint(point,{...camera,yaw:1.4},800,400));
  assert.deepEqual(point,before);
});
test('plane dragging follows the screen displacement while preserving the other dimension',()=>{
  for(const plane of ['xy','xz','yz']){
    const point=[.45,.5,.55],next=dragInPlane(point,[12,-8],plane,camera,800,400);
    const a=projectPoint(point,camera,800,400),b=projectPoint(next,camera,800,400);
    assert.ok(Math.abs(b[0]-a[0]-12)<.2);assert.ok(Math.abs(b[1]-a[1]+8)<.2);
    const fixed={xy:2,xz:1,yz:0}[plane];assert.equal(next[fixed],point[fixed]);
  }
});
test('dragged coordinates stay within the dimension endpoint range',()=>{
  assert.ok(dragInPlane([.9,.9,.9],[10000,-10000],'xy',camera,800,400).every(v=>v>=0&&v<=1));
});
test('high-dimensional edits affect only the chosen character, dimension and sentence',()=>{
  const state=upgradeDraft(newDraft()),custom=addDimension(state,'Trust','Distrustful','Trusting');
  const axes=spaceAxes(state);assert.equal(new Set(axes).size,3);
  assert.deepEqual(pointCoordinates(state,8,axes).coordinates,[.5,.5,.5]);
  setPointTargets(state,8,{[custom.id]:.85});
  assert.equal(state.tracks[`${state.activeCharacterId}:${custom.id}`].controls[8].target,.85);
  assert.equal(activeTrack(state).controls[8],null);
  assert.equal(state.tracks[`${state.activeCharacterId}:${custom.id}`].controls[7],null);
  assert.throws(()=>setPointTargets(state,8,{unknown:.4}),/dimension/i);
});
test('point picking uses proximity and visible depth rather than sentence order',()=>{
  const points=[{index:0,screen:[10,10,1]},{index:1,screen:[20,10,-1]}];
  assert.equal(pickProjectedPoint(points,[20,10],0).index,1);
  const overlap=[{index:0,screen:[10,10,1]},{index:1,screen:[10,10,-1]}];
  assert.equal(pickProjectedPoint(overlap,[10,10],-1).index,1);
  assert.equal(pickProjectedPoint(overlap,[10,10],0).index,0);
});
