// Lifecycle gate shared by native and deterministic task admission.
import {lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {EXECUTION_PARENT} from './project-execution-policy.mjs';
export function retirementPath(key,parent=EXECUTION_PARENT){if(!/^[a-z][a-z0-9-]{0,47}$/.test(key))throw Error('invalid_project');return join(parent,'retired-project-'+key+'.json');}
export async function projectRetired(key,parent){try{await lstat(retirementPath(key,parent));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
