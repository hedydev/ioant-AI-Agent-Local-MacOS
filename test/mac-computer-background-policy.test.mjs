import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBackgroundComputerAction as decide}
 from '../stage2/mac-computer-background-policy.mjs';
const make=()=>({
 request:{action:'set_value',deliveryMode:'background',
  target:{kind:'element',windowRef:'verified-window-42',elementRef:'verified-element-9'},
  observationId:'observed-on-mac',observationGeneration:'provider-generation-01',
  targetBrowserOrChatGPT:false,willActivateApp:false,
  willMoveSystemPointer:false,willChangeGlobalFocus:false},
 capabilities:{provider:'cua',providerVerified:true,backgroundVerified:true,
  deliveryModes:['background'],actions:['set_value','type','left_click','scroll','key'],
  generation:'provider-generation-01',backgroundTextVerified:true,
  backgroundPointerVerified:false,backgroundKeyboardVerified:false},
 authorization:{computerControlApproved:true,sharedDesktopUserActive:true,
  browserHostRestriction:'not_applicable'}
});
test('verified background element input may be considered, but is never executed',()=>{
 const result=decide(make());
 assert.equal(result.state,'eligible_for_authorized_background_execution');
 assert.equal(result.allowExecution,true);
 assert.equal(result.fallbackToForeground,false);
 assert.equal(result.mutatedDesktop,false);
});
test('unknown provider and Peekaboo cannot be promoted to CUA',()=>{
 for(const provider of ['peekaboo','unknown',undefined]){
  const m=make();m.capabilities.provider=provider;
  assert.equal(decide(m).reason,'verified_cua_provider_required');
 }
});
test('background hint on desktop target cannot bypass foreground desktop delivery',()=>{
 const m=make();m.request.target.kind='desktop';
 assert.equal(decide(m).reason,'window_or_element_target_required');
});
test('missing independent background proof blocks even if delivery advertised',()=>{
 const m=make();m.capabilities.backgroundVerified=false;
 assert.equal(decide(m).reason,'background_delivery_not_independently_verified');
});
test('foreground and missing delivery mode always block',()=>{
 for(const mode of ['foreground',undefined,'auto']){
  const m=make();m.request.deliveryMode=mode;
  assert.equal(decide(m).reason,'foreground_delivery_forbidden');
 }
});
test('browser-host restriction wins over user computer permission',()=>{
 const m=make();m.authorization.browserHostRestriction='blocked';
 assert.equal(decide(m).reason,'browser_host_access_blocked');
});
test('ChatGPT pages require separate browser surface authorization',()=>{
 const m=make();m.request.targetBrowserOrChatGPT=true;
 assert.equal(decide(m).reason,'browser_requires_separate_authorized_surface');
});
test('unverified or changed observation generation cannot be used',()=>{
 const m=make();m.request.observationGeneration='stale-provider';
 assert.equal(decide(m).reason,'fresh_matching_observation_required');
});
test('unknown activity and unapproved computer access block',()=>{
 const m=make();m.authorization.sharedDesktopUserActive='unknown';
 assert.equal(decide(m).reason,'user_activity_unknown');
 const n=make();n.authorization.computerControlApproved=false;
 assert.equal(decide(n).reason,'computer_action_not_authorized');
});
test('declared pointer, focus or activation effects always blocked',()=>{
 for(const k of ['willActivateApp','willMoveSystemPointer','willChangeGlobalFocus']){
  const m=make();m.request[k]=true;
  assert.equal(decide(m).reason,'user_interference_declared');
 }
});
test('pointer and scroll require separately verified background element route',()=>{
 for(const action of ['left_click','scroll']){
  const m=make();m.request.action=action;
  assert.equal(decide(m).reason,'background_pointer_not_verified');
  m.capabilities.backgroundPointerVerified=true;
  assert.equal(decide(m).state,'eligible_for_authorized_background_execution');
 }
});
test('key and window typing require background keyboard proof',()=>{
 const m=make();m.request.action='key';
 assert.equal(decide(m).reason,'background_keyboard_not_verified');
 m.capabilities.backgroundKeyboardVerified=true;
 assert.equal(decide(m).state,'eligible_for_authorized_background_execution');
 const n=make();n.request.action='type';n.request.target.kind='window';
 assert.equal(decide(n).reason,'background_keyboard_not_verified');
});
test('missing side-effect attestations block even for background action',()=>{
 const m=make();delete m.request.willChangeGlobalFocus;
 assert.equal(decide(m).reason,'side_effect_scope_not_attested');
});
test('malformed inputs never authorize any action',()=>{
 assert.equal(decide().allowExecution,false);
 assert.equal(decide({request:{},capabilities:{},authorization:{}}).allowExecution,false);
});
