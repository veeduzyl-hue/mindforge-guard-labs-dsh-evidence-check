// Synthetic-only structural input boundary. Semantic determinations belong to the frozen engine.
// A synthetic:true declaration is not proof that real secrets/data were excluded by the submitter.
export const MAX_JSON_BYTES = 32768;
export const LIMITS = Object.freeze({ claims: 12, events: 40, snapshots: 80, authorizations: 20, policySnapshots: 20 });
export const CLAIM_KINDS = Object.freeze([
  'target_created', 'authorization_bound', 'sandbox_denied', 'no_target_write',
  'policy_effective', 'no_side_effects', 'execution_failed', 'execution_failed_no_effect'
]);
const ROOT_FIELDS = new Set(['caseId','synthetic','description','claims','events','snapshots','coverage','authorizations','policySnapshots']);
const FORBIDDEN = new Set(['__proto__','prototype','constructor']);
const idRE = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
const caseRE = /^SYN-[A-Z0-9][A-Z0-9-]{1,39}$/;
const targetRE = /^synthetic:\/\/[a-z0-9-]+\/[A-Za-z0-9._/-]+$/;
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);

export class InputError extends Error {
  constructor(code) { super(code); this.name = 'SyntheticEvidenceInputError'; this.code = code; }
}
const fail = code => { throw new InputError(code); };

function walkNoDangerousKeys(root) {
  const stack = [{node: root, depth:0}]; let visited = 0;
  while (stack.length) {
    const {node,depth} = stack.pop();
    if (++visited > 2500 || depth > 16) fail('INPUT_COMPLEXITY_EXCEEDED');
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const item of node) stack.push({node:item,depth:depth+1});
    } else {
      for (const [key,item] of Object.entries(node)) {
        if (FORBIDDEN.has(key)) fail('PROTOTYPE_KEY_REJECTED');
        stack.push({node:item,depth:depth+1});
      }
    }
  }
}
function validTarget(t) {
  return typeof t==='string' && t.length<=180 && targetRE.test(t) &&
   !t.split('/').some(p => p==='..' || p==='.') && !t.includes('//', 'synthetic://'.length);
}
function checkId(x) { if (!isObject(x) || typeof x.id !== 'string' || !idRE.test(x.id)) fail('INVALID_RECORD_ID'); }
function checkArray(data,field,validator=checkId) {
  const xs=data[field] ?? [];
  if (!Array.isArray(xs) || xs.length > LIMITS[field]) fail('INVALID_RECORD_COLLECTION');
  for (const x of xs) validator(x);
  return xs;
}
function boundText(t) { return typeof t==='string' && t.length>0 && t.length<=800; }

export function validateSyntheticInput(evidenceJson) {
  if (typeof evidenceJson !== 'string' || Buffer.byteLength(evidenceJson,'utf8') > MAX_JSON_BYTES || evidenceJson.length===0) fail('INPUT_SIZE_OR_TYPE_INVALID');
  let data;
  try { data=JSON.parse(evidenceJson); } catch { fail('INVALID_JSON'); }
  if (!isObject(data)) fail('INVALID_ROOT');
  walkNoDangerousKeys(data);
  if (Object.keys(data).some(k=>!ROOT_FIELDS.has(k))) fail('UNKNOWN_ROOT_FIELD');
  if (data.synthetic !== true) fail('SYNTHETIC_DECLARATION_REQUIRED');
  if (typeof data.caseId!=='string' || !caseRE.test(data.caseId)) fail('INVALID_SYNTHETIC_CASE_ID');
  if (!boundText(data.description)) fail('INVALID_DESCRIPTION');
  if (!Array.isArray(data.claims) || data.claims.length < 1 || data.claims.length > LIMITS.claims) fail('INVALID_CLAIMS');
  const allIds=new Set();
  const keepId=x=>{checkId(x); if(allIds.has(x.id))fail('DUPLICATE_RECORD_ID'); allIds.add(x.id);};
  const claims=[];
  for (const c of data.claims) {
    keepId(c);
    if (!CLAIM_KINDS.includes(c.kind)|| !validTarget(c.target) || !boundText(c.text)) fail('INVALID_CLAIM');
    claims.push(c);
  }
  for (const x of checkArray(data,'events')) {
    keepId(x);
    if (typeof x.tool !== 'string'||x.tool.length>64|| !validTarget(x.target)|| typeof x.status !=='string'||x.status.length>32) fail('INVALID_EVENT');
  }
  for (const x of checkArray(data,'snapshots')) {
    keepId(x);
    if (!validTarget(x.target)|| !['before','after'].includes(x.phase)|| typeof x.exists!=='boolean') fail('INVALID_SNAPSHOT');
  }
  for (const x of checkArray(data,'authorizations')) {
    keepId(x);
    if(!validTarget(x.target))fail('INVALID_AUTHORIZATION_TARGET');
  }
  for (const x of checkArray(data,'policySnapshots')) keepId(x);
  if (data.coverage!==undefined) {
    const c=data.coverage;
    keepId(c);
    if(typeof c.complete!=='boolean')fail('INVALID_COVERAGE_TYPE');
    // Do not pre-judge coverage sufficiency/consistency: M3a in the frozen engine owns that verdict.
    for(const k of ['scope','observedTargets','changedTargets']) {
      if(c[k]!==undefined && (!Array.isArray(c[k])||c[k].length>100||c[k].some(x=>typeof x!=='string'||x.length>180)))fail('INVALID_COVERAGE_TYPE');
    }
  }
  return data;
}

export function assertOnlyEvidenceArg(args) {
  if (!isObject(args)||Object.keys(args).length!==1||!Object.hasOwn(args,'evidenceJson'))fail('INVALID_ARGUMENT_KEYS');
  return validateSyntheticInput(args.evidenceJson);
}
