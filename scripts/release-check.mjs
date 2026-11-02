// Deliberately blocks release until separate, explicit owner-approved gates are completed.
import {readFileSync, existsSync} from 'node:fs';
import {getProductionReviewer} from '../src/reviewer.mjs';
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
const pending=[];
if (pkg.private!==false) pending.push('PACKAGE_PRIVATE');
if (!pkg.license||pkg.license==='UNLICENSED') pending.push('LICENSE_NOT_SELECTED');
if (!existsSync(new URL('../LICENSE',import.meta.url))) pending.push('OWNER_APPROVED_LICENSE_MISSING');
if (!pkg.repository) pending.push('INDEPENDENT_REPOSITORY_NOT_CONFIGURED');
// Reaching code evaluation does not override governance/market gates.
try {await getProductionReviewer()} catch(e) {pending.push('FROZEN_ENGINE_FAILED_'+(e.code||e.message))}
pending.push('B_CLEAN_INSTALL_NOT_EVIDENCED');
pending.push('DSH_RC5_NOT_EVIDENCED');
pending.push('THIRD_PARTY_PEER_LICENSE_NOT_FINALIZED');
pending.push('PUBLIC_RELEASE_NOT_AUTHORIZED');
console.error('PUBLIC_RELEASE_BLOCKED: '+pending.join(', '));
process.exit(2);
