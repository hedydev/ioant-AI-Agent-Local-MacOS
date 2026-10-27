import test from 'node:test';
import assert from 'node:assert/strict';
import {planProjectChatEnvironment} from '../stage2/project-chat-environment-plan.mjs';

const route={key:'alice-ai',
 chatUrl:'https://chatgpt.com/g/g-p-6acaef839af081919426a885b3209f54-ai-mc-alice/c/6ade11a5-f0c0-83ec-add1-8a0cff00c938'};
function plan({relay={},chrome={},visual={},control={}}={}){
 return planProjectChatEnvironment({
  route,
  relay:{state:'ready',exactMatches:0,...relay},
  chrome:{running:'yes',allWindowsScanned:true,exactMatches:0,...chrome},
  visual:{exactChatVisible:'unknown',ageSeconds:0,...visual},
  control:{browser:'authorized',computer:'authorized',...control}
 });
}
test('relay exact URL available => reuse existing chat, no navigation',()=>{
 const result=plan({relay:{exactMatches:1},chrome:{exactMatches:1}});
 assert.equal(result.state,'ready');
 assert.equal(result.nextAction,'reuse_relay_target');
 assert.equal(result.executed,false);
 assert.equal(result.targetConversationId,'6ade11a5-f0c0-83ec-add1-8a0cff00c938');
});
test('screenshot showing exact chat plus missing relay => diagnostic, no second tab',()=>{
 const result=plan({visual:{exactChatVisible:'yes',ageSeconds:9}});
 assert.equal(result.nextAction,'investigate_relay_registration');
 assert.equal(result.reason,'existing_chrome_chat_not_visible_to_relay');
 assert.equal(result.state,'diagnostic');
});
test('all Chrome windows enumerated and exact chat exists => relay mismatch',()=>{
 const result=plan({chrome:{exactMatches:2},visual:{exactChatVisible:'no'}});
 assert.equal(result.state,'diagnostic');
 assert.equal(result.osExactVerified,true);
});
test('stale visual evidence is not proof that current Chrome tab exists',()=>{
 const result=plan({visual:{exactChatVisible:'yes',ageSeconds:300}});
 assert.equal(result.nextAction,'request_authorized_exact_chat_open_then_verify');
});
test('unscanned Chrome windows cannot justify opening duplicate tab',()=>{
 const result=plan({chrome:{allWindowsScanned:false}});
 assert.equal(result.state,'needs_observation');
 assert.equal(result.nextAction,'inspect_all_chrome_windows');
});
test('browser access denial never triggers alternate automation fallback',()=>{
 const result=plan({control:{browser:'blocked',computer:'authorized'}});
 assert.equal(result.state,'blocked');
 assert.equal(result.nextAction,'none');
 assert.equal(result.reason,'browser_or_computer_control_policy_block');
});
test('if target visibly exists but browser control blocked, report without control',()=>{
 const result=plan({control:{browser:'blocked'},chrome:{exactMatches:1}});
 assert.equal(result.nextAction,'investigate_relay_registration');
 assert.equal(result.executed,false);
});
test('Chrome running but chat missing needs authorized browser control',()=>{
 const result=plan({control:{browser:'unavailable'}});
 assert.equal(result.nextAction,'request_browser_authorization');
 assert.equal(result.state,'needs_authorization');
});
test('Chrome confirmed closed needs authorized app launcher',()=>{
 const result=plan({chrome:{running:'no',allWindowsScanned:true}});
 assert.equal(result.nextAction,'request_authorized_launch_then_verify');
});
test('Chrome confirmed closed without desktop privilege requires authorization',()=>{
 const result=plan({chrome:{running:'no',allWindowsScanned:true},
  control:{computer:'unavailable'}});
 assert.equal(result.nextAction,'request_computer_authorization');
});
test('duplicate Relay exact URL is never auto-picked',()=>{
 const result=plan({relay:{exactMatches:2}});
 assert.equal(result.nextAction,'manual_duplicate_identity_review');
 assert.equal(result.state,'blocked');
});
test('unavailable relay plus present Chrome window remains a discrepancy',()=>{
 const result=plan({relay:{state:'unavailable'},chrome:{exactMatches:1}});
 assert.equal(result.nextAction,'investigate_relay_registration');
});
test('unvalidated route, counts, and freshness fail closed',()=>{
 for(const args of [
  {route:{...route,chatUrl:'http://example.com'},relay:{state:'ready',exactMatches:1},
   chrome:{running:'yes',allWindowsScanned:true,exactMatches:0},
   visual:{exactChatVisible:'no',ageSeconds:0},
   control:{browser:'authorized',computer:'authorized'}},
  {route,relay:{state:'ready',exactMatches:-1},
   chrome:{running:'yes',allWindowsScanned:true,exactMatches:0},
   visual:{exactChatVisible:'no',ageSeconds:0},
   control:{browser:'authorized',computer:'authorized'}}
 ])assert.equal(planProjectChatEnvironment(args).reason,'invalid_or_unverified_inputs');
});
