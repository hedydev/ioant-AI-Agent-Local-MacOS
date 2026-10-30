import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('console locale catalogs have matching semantic keys and variables',async()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};Object.defineProperty(globalThis,'navigator',{value:{language:'zh-CN'},configurable:true});globalThis.document={documentElement:{}};
 const {catalogs,t,setLocale}=await import('../console/web/i18n.js');
 assert.deepEqual(Object.keys(catalogs['zh-CN']).sort(),Object.keys(catalogs['en-US']).sort());
 for(const key of Object.keys(catalogs['zh-CN']))assert.deepEqual([...catalogs['zh-CN'][key].matchAll(/\{([a-zA-Z]+)\}/g)].map(x=>x[1]).sort(),[...catalogs['en-US'][key].matchAll(/\{([a-zA-Z]+)\}/g)].map(x=>x[1]).sort(),key);
 setLocale('zh-CN');assert.equal(t('metric.jobs'),'执行中的项目任务');setLocale('en-US');assert.equal(t('metric.jobs'),'Running project jobs');
});
test('dynamic report/log content uses DOM text rendering and no browser-native prompt flow',async()=>{
 const render=await readFile(new URL('../console/web/render.js',import.meta.url),'utf8'),app=await readFile(new URL('../console/web/app.js',import.meta.url),'utf8');
 assert.equal(/\.innerHTML\s*=/.test(render+app),false);assert.equal(/\b(?:alert|confirm|prompt)\(/.test(app),false);assert.match(app,/report-content'\)\.textContent/);assert.equal(/localStorage\.setItem\([^\n]*(?:runtimeKey|runtime-key)/.test(app),false);
});
