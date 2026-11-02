// REQUIRED ON WINDOWS after sourcing the actual accepted v0.1.0 plugin's frozen baseline.
// Fail if missing: a skipped check must NEVER be reported as an integration pass.
import { existsSync, readFileSync } from 'node:fs';
import { getProductionReviewer, PINNED_ENGINE_SHA256 } from '../src/reviewer.mjs';
import { createHash } from 'node:crypto';
const filename=new URL('../baseline/engine/analyze.mjs',import.meta.url);
if(!existsSync(filename)) {console.error('BLOCKED_BASELINE_NOT_SEEDED: run scripts/seed-baseline.ps1 on the authorized Windows host.');process.exit(2)}
const sha=createHash('sha256').update(readFileSync(filename)).digest('hex').toUpperCase();
if(sha!==PINNED_ENGINE_SHA256) {console.error('FROZEN_BASELINE_HASH_MISMATCH');process.exit(3)}
const review=await getProductionReviewer();
const A=readFileSync(new URL('../examples/unseen-before-after-A.json',import.meta.url),'utf8');
const B=readFileSync(new URL('../examples/unseen-before-after-B.json',import.meta.url),'utf8');
const a=review(A),b=review(B);
if(a.claims.length!==1||b.claims.length!==1||a.claims[0].verdict===b.claims[0].verdict||b.claims[0].verdict!=='SUPPORTED_LIMITED') {
 console.error('UNSEEN_INPUT_ENGINE_ACCEPTANCE_FAILED:',JSON.stringify({A:a.claims,B:b.claims}));process.exit(4)
}
console.log(JSON.stringify({status:'UNSEEN_SYNTHETIC_ENGINE_INTEGRATION_PASS',A:a.claims[0],B:b.claims[0]},null,2));
