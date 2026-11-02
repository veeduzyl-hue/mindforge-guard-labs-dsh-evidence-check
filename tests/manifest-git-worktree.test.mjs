// Regression tests for the strict release inventory in Git and non-Git workspaces.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const verifier = readFileSync(new URL('../scripts/verify-release-manifest.mjs', import.meta.url));
const hash = b => createHash('sha256').update(b).digest('hex').toUpperCase();
const fixtures = new Set();

function fixture(){
  const root=mkdtempSync(join(tmpdir(),'guardlabs-r3-manifest-'));
  fixtures.add(root);
  mkdirSync(join(root,'scripts'));
  writeFileSync(join(root,'scripts','verify-release-manifest.mjs'),verifier);
  const license=Buffer.from('test-only fixture\n','utf8');
  writeFileSync(join(root,'LICENSE'),license);
  writeFileSync(join(root,'SHA256SUMS.txt'),
    `${hash(license)}  LICENSE\n${hash(verifier)}  scripts/verify-release-manifest.mjs\n`);
  return root;
}
function run(root){
  return spawnSync(process.execPath,['scripts/verify-release-manifest.mjs'],
    {cwd:root,encoding:'utf8',timeout:12000});
}
function ok(root){
  const r=run(root);
  assert.equal(r.status,0,`unexpected exit: ${r.stderr}`);
  assert.match(r.stdout,/R2_SHA256_MANIFEST_VERIFIED:2\/2/);
}
function fails(root,code){
  const r=run(root);
  assert.notEqual(r.status,0,`unexpected successful validation: ${r.stdout}`);
  assert.match(r.stderr,new RegExp(code));
}

test.after(()=>{for(const root of fixtures)rmSync(root,{recursive:true,force:true});});

test('strict manifest succeeds outside a Git checkout',()=>ok(fixture()));
test('Git metadata directory at repository root is ignored',()=>{
  const root=fixture();
  mkdirSync(join(root,'.git','objects'),{recursive:true});
  writeFileSync(join(root,'.git','HEAD'),'ref: refs/heads/test\n');
  writeFileSync(join(root,'.git','objects','ignored-object'),'git metadata');
  ok(root);
});
test('root worktree .git pointer file is ignored',()=>{
  const root=fixture();
  writeFileSync(join(root,'.git'),'gitdir: ../.git/worktrees/test\n');
  ok(root);
});
test('unexpected top-level file is rejected even when Git metadata exists',()=>{
  const root=fixture();
  mkdirSync(join(root,'.git'));
  writeFileSync(join(root,'unexpected.txt'),'not listed');
  fails(root,'MANIFEST_INVENTORY_MISMATCH');
});
test('nested .git is NOT excluded from the release inventory',()=>{
  const root=fixture();
  mkdirSync(join(root,'docs','.git'),{recursive:true});
  writeFileSync(join(root,'docs','.git','secret'),'do not hide');
  fails(root,'MANIFEST_INVENTORY_MISMATCH');
});
test('modified tracked content fails its SHA-256 check',()=>{
  const root=fixture();
  writeFileSync(join(root,'LICENSE'),'modified');
  fails(root,'MANIFEST_HASH_MISMATCH:LICENSE');
});
test('missing declared file fails closed',()=>{
  const root=fixture();
  // Use a never-created path rather than relying on Windows temp-file deletion.
  const missingName='NEVER_CREATED_SYNTHETIC_FILE.txt';
  assert.equal(existsSync(join(root,missingName)),false,'missing fixture must be absent');
  const manifestPath=join(root,'SHA256SUMS.txt');
  const existing=readFileSync(manifestPath,'utf8');
  writeFileSync(manifestPath,existing+`${hash(Buffer.from('absent fixture'))}  ${missingName}\n`);
  fails(root,'UNSAFE_FILE_TARGET|ENOENT');
});
