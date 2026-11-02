import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReviewer, PINNED_ENGINE_SHA256 } from '../src/reviewer.mjs';
import {renderReview} from '../src/render.mjs';
const A=readFileSync(new URL('../examples/unseen-before-after-A.json',import.meta.url),'utf8');
const B=readFileSync(new URL('../examples/unseen-before-after-B.json',import.meta.url),'utf8');
// A probe only. These tests validate wrapper mechanics, NOT the accepted v0.1.3 engine semantics.
const fakeAnalyzer = data=>({claims:data.claims.map(c=>({
 id:c.id,status:data.snapshots.find(x=>x.phase==='after').exists?'SUPPORTED_LIMITED':'UNVERIFIED',
 reason:'Probe evaluator, not accepted engine evidence', evidenceRefs:['E1','B1','A1']
}))});
const review=createReviewer(fakeAnalyzer);
test('toolVersion agrees with npm package version',()=>{
  const p=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(review(A).toolVersion,p.version);
});
test('wrapper calls injected evaluator for new input A and preserves verdict',()=>assert.equal(review(A).claims[0].verdict,'UNVERIFIED'));
test('new input B changes verdict when evidence changes (probe only)',()=>assert.equal(review(B).claims[0].verdict,'SUPPORTED_LIMITED'));
test('new inputs are not compared to frozen Golden',()=>assert.equal(review(A).goldenComparison.applicable,false));
test('canonical review is deterministic',()=>assert.deepEqual(review(A),review(A)));
test('review carries limitations and synthetic declaration',()=>{
 const r=review(A);assert.equal(r.syntheticOnly,true);assert.equal(r.formalGuardAdmission,'NOT_PERFORMED');assert.match(r.limitations.join(' '),/model provider/);
});
test('render includes verdict, reason and evidence refs',()=>{
 const s=renderReview(review(B));assert.match(s,/SUPPORTED_LIMITED/);assert.match(s,/E1, B1, A1/);
});
test('fail closed if frozen engine hash is different',()=>{
 assert.throws(()=>createReviewer(fakeAnalyzer,{verifyEngine:()=> '0'.repeat(64)})(A),{code:'ENGINE_HASH_MISMATCH'});
});
test('fail closed when evaluator returns unknown verdict',()=>{
 assert.throws(()=>createReviewer(()=>({claims:[{id:'C1',status:'CERTIFIED',reason:'bad',evidenceRefs:[]}]}))(A),{code:'ENGINE_RESULT_INTEGRITY_FAILED'});
});
test('fail closed for missing decisive evidence record',()=>{
 assert.throws(()=>createReviewer(()=>({claims:[{id:'C1',status:'SUPPORTED_LIMITED',reason:'bad',evidenceRefs:['NOT_PRESENT'] }]}))(A),{code:'ENGINE_RESULT_INTEGRITY_FAILED'});
});
test('fail closed if evaluator rejects unseen input',()=>{
 assert.throws(()=>createReviewer(()=>{throw new Error('analyzer rejected');})(A),{code:'FROZEN_ENGINE_REJECTED_INPUT'});
});
test('injected hash pin matches accepted engine',()=>assert.equal(PINNED_ENGINE_SHA256,'3B735DE3C994D4369D84843E285B1FF5120C808761EAE7ACC31D86B236574FCC'));

test('a claim ID cannot be laundered as an evidence reference',()=>{
 assert.throws(()=>createReviewer(()=>({claims:[{id:'C1',status:'SUPPORTED_LIMITED',reason:'bad',evidenceRefs:['C1']}]}))(A),{code:'ENGINE_RESULT_INTEGRITY_FAILED'});
});
