import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveDevDiscussion} from '../stage2/dev-discussion-claim.mjs';
const stamp='2026-10-25T08:00:00.000Z';
test('claim before inference without recording question text',()=>{
 const orig={lastTaskId:'older-001',feedbackPending:null};
 const claim=reserveDevDiscussion(orig,'devtalk-claim-001',()=>stamp);
 assert.equal(claim.ok,true);
 assert.equal(claim.state.devDiscussionClaims['devtalk-claim-001'],stamp);
 assert.equal(orig.devDiscussionClaims,undefined);
 assert.equal(JSON.stringify(claim.state).includes('prompt'),false);
});
test('uncertain crash result never repeats the same inference ID',()=>{
 const one=reserveDevDiscussion({},'devtalk-claim-001',()=>stamp);
 assert.deepEqual(reserveDevDiscussion(one.state,'devtalk-claim-001',()=>stamp),
  {ok:false,reason:'prior_discussion_outcome_unknown'});
 assert.equal(reserveDevDiscussion(one.state,'devtalk-claim-002',()=>stamp).ok,true);
});
test('invalid or full claim ledger fails closed',()=>{
 assert.equal(reserveDevDiscussion({devDiscussionClaims:[]},'devtalk-claim-001').ok,false);
 assert.equal(reserveDevDiscussion({devDiscussionClaims:{'devtalk-claim-001':'bad'}},'devtalk-claim-002').ok,false);
 const full=Object.fromEntries(Array.from({length:1024},(_,i)=>['devtalk-'+String(i).padStart(4,'0'),stamp]));
 assert.deepEqual(reserveDevDiscussion({devDiscussionClaims:full},'devtalk-claim-999',()=>stamp),
  {ok:false,reason:'discussion_claim_limit'});
});
