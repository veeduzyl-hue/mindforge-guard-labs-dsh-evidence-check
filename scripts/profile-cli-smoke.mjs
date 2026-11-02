// Disposable official DSH Profile installation; no user secrets, sessions or production data.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';

const version=process.argv[2]||'0.2.1-rc.5';
assert.equal(version,'0.2.1-rc.5','Only the scoped rc.5 version is permitted');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temp=mkdtempSync(join(tmpdir(),'guardlabs-profile-cli-'));
const consumer=join(temp,'consumer'), packs=join(temp,'packs'),home=join(temp,'home'),manager=join(temp,'manager');
mkdirSync(consumer);mkdirSync(packs);mkdirSync(home);mkdirSync(manager);
const env={...process.env,CI:'true',DSH_HOME:home,DSH_TELEMETRY_DISABLED:'1',
 DSH_TELEMETRY_MODE:'DISABLED',npm_config_update_notifier:'false',
 npm_config_fetch_retries:'2',npm_config_fetch_timeout:'60000'};
function run(cmd,args,cwd,timeout=1200000){
 const isNpm=cmd==='npm',isPnpm=cmd==='pnpm',win=process.platform==='win32';
 const r=spawnSync(win&&(isNpm||isPnpm)?cmd+'.cmd':cmd,args,{cwd,env,
   encoding:'utf8',shell:win&&(isNpm||isPnpm),timeout,maxBuffer:24*1024*1024});
 if(r.error||r.status!==0){
   console.error('PROFILE_STEP_FAILED',cmd,args.join(' '),'exit',r.status,
     r.error?.message||'',(r.stdout||'').slice(-4000),(r.stderr||'').slice(-4000));
   throw Error('PROFILE_CLI_COMMAND_FAILED');
 }
 return r.stdout||'';
}
try{
 const entries=JSON.parse(run('npm',['pack','--json','--pack-destination',packs],root,180000));
 assert.equal(entries.length,1);
 const tarball=join(packs,entries[0].filename);
 assert.ok(existsSync(tarball));
 writeFileSync(join(consumer,'package.json'),JSON.stringify({
   name:'disposable-dsh-consumer',version:'0.0.0',private:true,type:'module'}));
 run('npm',['install','--no-audit','--no-fund','--no-progress','--no-save',
   '@deepseek-ai/dsh@'+version,'@deepseek-ai/dsh-tools@'+version],consumer);
 console.log('FRESH_DSH_HOST_INSTALL_PASS',version);
 // Install the package manager in the temporary test root, not into runner-global PATH.
 run('npm',['install','--prefix',manager,'--no-audit','--no-fund','--no-progress','--no-save','pnpm@10.21.0'],consumer,480000);
 const pnpmBin=join(manager,'node_modules','.bin');
 assert.ok(existsSync(join(pnpmBin,process.platform==='win32'?'pnpm.cmd':'pnpm')),'PNPM_COMMAND_MISSING');
 const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path')||'PATH';
 env[pathKey]=pnpmBin+delimiter+(env[pathKey]||'');
 console.log('PROFILE_PNPM_READY',run('pnpm',['--version'],consumer,30000).trim());
 const pkg=JSON.parse(readFileSync(join(consumer,'node_modules','@deepseek-ai','dsh','package.json'),'utf8'));
 assert.equal(pkg.version,version);
 const bin=typeof pkg.bin==='string'?pkg.bin:pkg.bin?.dsh;
 assert.ok(bin,'MISSING_DSH_CLI_BIN');
 const cli=resolve(consumer,'node_modules','@deepseek-ai','dsh',bin);
 assert.ok(existsSync(cli),'MISSING_DSH_CLI_ENTRY');
 run(process.execPath,[cli,'plugin','--profile','web','add',tarball],consumer);
 const profile=join(home,'profiles','web');
 const manifest=JSON.parse(readFileSync(join(profile,'package.json'),'utf8'));
 const layers=manifest.dsh?.profile?.bundles;
 assert.ok(Array.isArray(layers),'MISSING_PROFILE_BUNDLES');
 assert.ok(layers.includes('dsh-guard-labs-evidence-check'),'PLUGIN_NOT_IN_PROFILE_BUNDLES');
 assert.ok(manifest.dependencies?.['dsh-guard-labs-evidence-check'],'PLUGIN_NOT_IN_DEPENDENCIES');
 console.log('OFFICIAL_DSH_PLUGIN_ADD_PASS',JSON.stringify({version,layers}));
 const dump=run(process.execPath,[cli,'--profile','web','--dump-config'],consumer,180000);
 assert.ok(dump.includes('guard-labs-evidence-check'),'MISSING_CONFIG_ROW');
 assert.ok(dump.includes('dsh-guard-labs-evidence-check'),'MISSING_CONFIG_PACKAGE');
 console.log('DSH_RC5_PROFILE_CONFIG_COMPOSITION_PASS',version,process.platform);
}finally{
 rmSync(temp,{recursive:true,force:true});
}
