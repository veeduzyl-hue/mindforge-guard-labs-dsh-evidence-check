// Read-only SHA-256 check for the single redistributed frozen engine source.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PINNED_ENGINE_SHA256} from '../src/reviewer.mjs';
const actual=createHash('sha256').update(readFileSync(new URL('../baseline/engine/analyze.mjs', import.meta.url))).digest('hex').toUpperCase();
if (actual!==PINNED_ENGINE_SHA256) {console.error('PINNED_ENGINE_HASH_MISMATCH');process.exit(2)}
console.log('FROZEN_ENGINE_SOURCE_SHA256_VERIFIED');
