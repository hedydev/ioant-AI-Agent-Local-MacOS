import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const ROOT=resolve(import.meta.dirname,'..');
const ignore=readFileSync(resolve(ROOT,'.gitignore'),'utf8');
const mockRunner=readFileSync(resolve(ROOT,'test/mint-diagnostics.test.mjs'),'utf8');

test('Python generated caches are ignored without loosening updater Git cleanliness',()=>{
 assert.match(ignore,/^__pycache__\/$/m);
 assert.match(ignore,/^\*\.py\[cod\]$/m);
 const updater=readFileSync(resolve(ROOT,'stage2/project-self-update.mjs'),'utf8');
 assert.match(updater,/status','--porcelain=v1','--untracked-files=all'/);
 assert.match(updater,/if\(worktree\)throw Error\('dirty_worktree'\)/);
});

test('privileged helper mock tests disable Python bytecode writing',()=>{
 assert.match(mockRunner,/spawnSync\('python3',\['-I','-B','-S','test\/test_mint_bds_helper\.py'\]/);
 assert.doesNotMatch(mockRunner,/spawnSync\('python3',\['-I','-S','test\/test_mint_bds_helper\.py'\]/);
});
