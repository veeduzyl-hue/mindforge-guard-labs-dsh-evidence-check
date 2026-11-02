import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSyntheticInput, assertOnlyEvidenceArg, InputError, MAX_JSON_BYTES } from '../src/validate.mjs';
const path = new URL('../examples/unseen-before-after-A.json',import.meta.url);
const sample = JSON.parse(readFileSync(path,'utf8'));
const serialize = patch => JSON.stringify({...sample,...patch});
const rejected = (raw, code) => assert.throws(()=>validateSyntheticInput(raw),e=>e instanceof InputError&&e.code===code);

test('valid previously-unseen synthetic case accepted',()=>{
  const out=validateSyntheticInput(JSON.stringify(sample));
  assert.equal(out.caseId,'SYN-UNSEEN-01');
});
test('case selector is not a pinned CASE-01...',()=>rejected(serialize({caseId:'CASE-05'}),'INVALID_SYNTHETIC_CASE_ID'));
test('synthetic flag is mandatory',()=>rejected(serialize({synthetic:false}),'SYNTHETIC_DECLARATION_REQUIRED'));
test('reject unknown top-level fields for credentials or URLs',()=>rejected(serialize({url:'https://example.com'}),'UNKNOWN_ROOT_FIELD'));
test('reject real path as claim target',()=>{
  const d=structuredClone(sample);d.claims[0].target='C:\\Users\\Example\\secrets.txt';
  rejected(JSON.stringify(d),'INVALID_CLAIM');
});
test('reject non-synthetic URI as claim target',()=>{
  const d=structuredClone(sample);d.claims[0].target='file:///etc/passwd';
  rejected(JSON.stringify(d),'INVALID_CLAIM');
});
test('reject target traversal segments',()=>{
  const d=structuredClone(sample);d.claims[0].target='synthetic://project/../secrets';
  rejected(JSON.stringify(d),'INVALID_CLAIM');
});
test('reject prototype-pollution keys',()=>{
  rejected(JSON.stringify(sample).replace('"synthetic":true','"__proto__":{},"synthetic":true'),'PROTOTYPE_KEY_REJECTED');
});
test('reject malformed JSON',()=>rejected('{oops','INVALID_JSON'));
test('reject payload over 32 KiB',()=>rejected(' '.repeat(MAX_JSON_BYTES+1),'INPUT_SIZE_OR_TYPE_INVALID'));
test('reject duplicate record ids across record classes',()=>{
  const d=structuredClone(sample); d.snapshots[0].id='E1'; rejected(JSON.stringify(d),'DUPLICATE_RECORD_ID');
});
test('reject malformed or oversized claim arrays',()=>rejected(serialize({claims:[]}),'INVALID_CLAIMS'));
test('reject extra tool argument even if evidenceJson is valid',()=>assert.throws(()=>assertOnlyEvidenceArg({evidenceJson:JSON.stringify(sample),path:'C:\\x'}),{code:'INVALID_ARGUMENT_KEYS'}));
test('reject missing argument',()=>assert.throws(()=>assertOnlyEvidenceArg({}),{code:'INVALID_ARGUMENT_KEYS'}));
test('valid input may contain incomplete coverage; frozen engine adjudicates sufficiency',()=>{
 const d=structuredClone(sample);d.coverage={id:'COV1',complete:true,scope:['synthetic://project/report.md'],observedTargets:[],changedTargets:['synthetic://project/report.md']};
 assert.equal(validateSyntheticInput(JSON.stringify(d)).coverage.changedTargets.length,1);
});
