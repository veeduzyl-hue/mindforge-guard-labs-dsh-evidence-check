// Verify the complete pinned file inventory; never write to the project.
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, resolve, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const manifest=readFileSync(resolve(root,'SHA256SUMS.txt'),'utf8').trimEnd().split('\n');
const listed=new Set();
for(const line of manifest){
 const m=/^([A-F0-9]{64})  ([^\r\n]+)$/.exec(line);
 if(!m)throw Error('INVALID_SHA256SUMS_LINE');
 const [,expected,name]=m;
 if(name.includes('\\')||name.startsWith('/')||name.split('/').some(v=>v==='..'||v==='.'||v===''))throw Error('UNSAFE_MANIFEST_PATH');
 const target=resolve(root,...name.split('/'));
 if(!(target===root||target.startsWith(root+sep))||!statSync(target).isFile())throw Error('UNSAFE_FILE_TARGET');
 const actual=createHash('sha256').update(readFileSync(target)).digest('hex').toUpperCase();
 if(actual!==expected)throw Error('MANIFEST_HASH_MISMATCH:'+name);
 if(listed.has(name))throw Error('DUPLICATE_MANIFEST_ENTRY:'+name);
 listed.add(name);
}
function walk(dir){
 const names=[];
 for(const e of readdirSync(dir,{withFileTypes:true})){
   const path=resolve(dir,e.name);
   if(e.isSymbolicLink())throw Error('UNEXPECTED_SYMLINK:'+path);
   // A Git checkout adds its own metadata outside the published source inventory.
   // Ignore only the root .git entry (directory or worktree gitdir pointer file).
   // Nested .git entries and all other unlisted files remain inventory violations.
   if(dir===root && e.name==='.git') {
     if(!e.isDirectory() && !e.isFile())throw Error('UNEXPECTED_GIT_METADATA_ENTRY:'+path);
     continue;
   }
   if(e.isDirectory()) names.push(...walk(path));
   else if(e.isFile()){const name=relative(root,path).split(sep).join('/');if(name!=='SHA256SUMS.txt')names.push(name);}
   else throw Error('UNEXPECTED_ENTRY:'+path);
 }
 return names;
}
const actual=new Set(walk(root));
if(listed.size!==actual.size||[...actual].some(n=>!listed.has(n)))throw Error('MANIFEST_INVENTORY_MISMATCH');
console.log('R2_SHA256_MANIFEST_VERIFIED:'+listed.size+'/'+actual.size);
