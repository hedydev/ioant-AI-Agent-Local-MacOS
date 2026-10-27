import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const worker=readFileSync(resolve(root,'stage2/chatgpt-loop.mjs'),'utf8');
const eventLog=readFileSync(resolve(root,'stage2/diagnostic-log.mjs'),'utf8');
const circuit=readFileSync(resolve(root,'stage2/chatgpt-browser-read-circuit.mjs'),'utf8');
test('watch startup and steady-state both gate browser reads on a circuit',()=>{
 assert.match(worker,/const browserCircuit=new BrowserReadCircuit\(\)/);
 assert.match(worker,/while\(!target&&!stopping\)\{\s*\/\/[^\\n]*\n\s*if\(!await waitBrowserCircuit\(browserCircuit,\(\)=>stopping\)\)break;/);
 assert.match(worker,/do \{\s*if\(stopping\)break;\s*if\(!await waitBrowserCircuit\(browserCircuit,\(\)=>stopping\)\)break;\s*let nowTarget, page/);
 assert.match(worker,/const browserFailureCode=noteBrowserFailure\(e\)/);
 assert.match(worker,/noteBrowserSuccess\(\)/);
});
test('watch log never expands browser subprocess error / DOM probe in console',()=>{
 assert.doesNotMatch(worker,/\[loop\] ChatGPT tab not ready: '\+redactFeedback\(e\.message\)/);
 assert.doesNotMatch(worker,/Waiting for authorized ChatGPT conversation: '\+redactFeedback\(e\.message\)/);
 assert.match(worker,/console\.log\('\[loop\] Waiting for authorized ChatGPT conversation; browser read failed: '\+browserFailureCode\)/);
 assert.match(worker,/console\.log\('\[loop\] ChatGPT tab not ready: '\+browserFailureCode\)/);
});
test('diagnostic log has safe explicit circuit state codes, not raw browser text',()=>{
 assert.match(eventLog,/'browser_circuit_open'/);
 assert.match(eventLog,/'browser_circuit_recovered'/);
 assert.match(worker,/recordDiagnosticEvent\('browser_circuit_open',\{code:result\.code\}\)/);
 assert.match(worker,/recordDiagnosticEvent\('browser_circuit_recovered',\{code:'page_verified'\}\)/);
});
test('breaker contains no GUI, network, browser execution or alternate browser surface',()=>{
 assert.doesNotMatch(circuit,/\b(execFile|fetch\(|spawn\(|chrome\.debugger|AppleScript|computer\.act|CDP)\b/);
 assert.match(circuit,/const MIN_WAIT=5\*60_000/);
 assert.match(circuit,/const MAX_WAIT=15\*60_000/);
 assert.match(circuit,/waitBrowserCircuit/);
});
