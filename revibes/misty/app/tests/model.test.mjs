import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalizedCrop,validateWorkspace,fitView} from '../public/model.js';
import {componentProgram} from '../public/preview.js';
import {initialWorkspace} from '../public/starter.js';
const require=createRequire(import.meta.url),Babel=require('@babel/standalone');
test('crop bounds stay inside the image display',()=>{
  assert.deepEqual(normalizedCrop({x:-1,y:.9,w:4,h:2}),{x:0,y:.9,w:1,h:1-.9});
  assert.equal(normalizedCrop(null),null);
});
test('workspace round trip preserves source and lineage and rejects unsafe references',()=>{
  const state=initialWorkspace();
  assert.deepEqual(validateWorkspace(JSON.parse(JSON.stringify(state))),state);
  const invalid=initialWorkspace();invalid.nodes[0].image='javascript:alert(1)';
  assert.throws(()=>validateWorkspace(invalid),/Invalid reference/);
  const duplicate=initialWorkspace();duplicate.nodes[1].id=duplicate.nodes[0].id;
  assert.throws(()=>validateWorkspace(duplicate),/duplicate/);
});
test('fit makes all nodes visible at a useful zoom',()=>{
  const nodes=initialWorkspace().nodes,view=fitView(nodes,1000,1000);
  for(const node of nodes){assert.ok(node.x*view.zoom+view.x>=0);assert.ok((node.x+360)*view.zoom+view.x<=1000)}
});
test('JSX input normalization compiles common component formats',()=>{
  for(const code of [
    initialWorkspace().nodes[1].code,
    'export default function App(){return <main>Hello</main>}',
    'import React from "react";\nconst App=()=> <main/>;\nexport default App;',
    '() => <main className="p-4">Hi</main>'
  ]){
    const compiled=Babel.transform(componentProgram(code),{presets:['react'],parserOpts:{allowReturnOutsideFunction:true}}).code;
    assert.equal(typeof new Function('React',compiled)({createElement:()=>null}),'function');
  }
});
test('malformed JSX produces a useful error rather than a blank accepted render',()=>{
  assert.throws(()=>Babel.transform(componentProgram('() => <main>'),{presets:['react'],parserOpts:{allowReturnOutsideFunction:true}}),/Unterminated JSX/);
});
