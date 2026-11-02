// Independent, disposable installation of the real npm tarball and exact DSH peer versions.
// CI-only synthetic verification. No credentials, no production Agent traces, no public publish.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
assert.match(version || '', /^0\.2\.1-rc\.(2|5)$/, 'explicitly scoped DSH version required');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'guardlabs-clean-install-'));
const packDir = join(temp, 'pack');
const consumer = join(temp, 'consumer');
mkdirSync(packDir);
mkdirSync(consumer);

function run(cmd, args, cwd, timeout = 600000) {
  const windows = process.platform === 'win32';
  const result = spawnSync(windows && cmd === 'npm' ? 'npm.cmd' : cmd, args, {
    cwd, encoding: 'utf8', timeout, shell: windows && cmd === 'npm',
    env: { ...process.env, CI: 'true', DSH_TELEMETRY_DISABLED: '1', npm_config_update_notifier: 'false' },
    maxBuffer: 12 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    console.error('CLEAN_INSTALL_STEP_FAILED', cmd, args.join(' '), 'exit', result.status,
      result.error?.message || '', (result.stdout || '').slice(-5000), (result.stderr || '').slice(-5000));
    throw new Error('CHILD_COMMAND_FAILED');
  }
  return result.stdout;
}

try {
  const raw = run('npm', ['pack', '--json', '--pack-destination', packDir], root, 180000);
  const packs = JSON.parse(raw);
  assert.equal(packs.length, 1);
  const pack = packs[0];
  const files = pack.files.map(f => f.path);
  const required = ['LICENSE','NOTICE.md','src/plugin.mjs','baseline/engine/analyze.mjs','cordis.patch.yml','package.json'];
  for (const file of required) assert.ok(files.includes(file), `PACK_MISSING:${file}`);
  for (const file of files) assert.doesNotMatch(file,
    /(^|\/)(dev|tests|examples|\.github|node_modules|evidence|credentials|\.git)(\/|$)|\.ndjson$|\.log$/i,
    `PACK_PRIVATE_CONTENT:${file}`);
  console.log('REAL_NPM_TARBALL_CONTENT_PASS', JSON.stringify({fileCount:files.length, fileName:pack.filename}));
  const tarball = join(packDir, pack.filename);
  assert.ok(existsSync(tarball), 'npm pack did not create a tarball');

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({
    name: 'isolated-guardlabs-consumer', version: '0.0.0', private: true, type: 'module'
  }));
  run('npm', ['install', '--no-audit', '--no-fund', '--no-progress', '--no-save',
    `@deepseek-ai/dsh@${version}`, `@deepseek-ai/dsh-tools@${version}`, tarball], consumer);
  console.log('FRESH_NPM_INSTALL_PASS', version);

  const child = String.raw`import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as dshTools from '@deepseek-ai/dsh-tools';
import * as plugin from 'dsh-guard-labs-evidence-check';
const requested = process.argv[2];
const dshPackage = JSON.parse(readFileSync('node_modules/@deepseek-ai/dsh/package.json','utf8'));
const toolsPackage = JSON.parse(readFileSync('node_modules/@deepseek-ai/dsh-tools/package.json','utf8'));
assert.equal(dshPackage.version,requested,'DSH_INSTALL_VERSION_MISMATCH');
assert.equal(toolsPackage.version,requested,'TOOLS_INSTALL_VERSION_MISMATCH');
assert.equal(typeof dshTools.defineTool,'function','UPSTREAM_DEFINE_TOOL_MISSING');
const registrations=[];
plugin.apply({tools:{register(x){registrations.push(x);}}});
assert.equal(registrations.length,1,'REGISTERED_TOOL_COUNT');
const tool=registrations[0];
assert.equal(tool.name,'review_synthetic_evidence_input');
assert.equal(typeof tool.execute,'function');
for (const [variant, expectedVerdict] of [['A','UNVERIFIED'],['B','SUPPORTED_LIMITED']]) {
  const evidenceJson = readFileSync(join(process.cwd(), 'input-'+variant+'.json'),'utf8');
  const result = await tool.execute({evidenceJson});
  assert.equal(result.syntheticOnly,true);
  assert.equal(result.formalGuardAdmission,'NOT_PERFORMED');
  assert.equal(result.claims.length,1);
  assert.equal(result.claims[0].verdict,expectedVerdict);
  assert.deepEqual(result.claims[0].evidenceRefs,['E1','B1','A1']);
  assert.equal(result.verdictSource,'FROZEN_DETERMINISTIC_ENGINE');
  console.log('INSTALLED_UPSTREAM_TYPED_TOOL_DISPATSH_PASS', requested,variant, expectedVerdict);
}
console.log('PACKAGE_LICENSE_METADATA',JSON.stringify({dsh:dshPackage.license??null,tools:toolsPackage.license??null}));
`;
  writeFileSync(join(consumer,'smoke.mjs'), child);
  for (const variant of ['A','B']) {
    const source = readFileSync(join(root,'examples',`unseen-before-after-${variant}.json`));
    writeFileSync(join(consumer,`input-${variant}.json`),source);
  }
  const childOut = run(process.execpath, ['smoke.mjs',version],consumer,120000);
  console.log(childOut.trim());
  console.log('CLEAN_INSTALL_AND_TYPED_TOOL_SMOKE_PASS',version,process.platform);
} finally {
  rmSync(temp, {recursive: true, force: true});
}
