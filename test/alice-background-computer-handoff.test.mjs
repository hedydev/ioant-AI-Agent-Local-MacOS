import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAliceBackgroundHandoff} from
 '../stage2/alice-background-computer-handoff.mjs';

const base=()=>({
 target:{projectId:'g-p-6acaef839af081919426a885b3209f54',
  conversationId:'6ade11a5-f0c0-83ec-add1-8a0cff00c938',
  exactChromeUrlVerified:true,uniqueWindowVerified:true,
  activeTabInTargetWindow:true},
 provider:{id:'cua-computer',contractVersion:2,connected:true,
  actions:['list_windows','get_window_state','set_value'],
  deliveryModes:['background','foreground'],generation:'current'},
 fixture:{backgroundReadbackVerified:true,windowOwnershipVerified:true,
  frontmostUnaffectedVerified:true,pointerNoninterferenceVerified:true,
  driverGenerationStable:true,ownExecutionClosedVerified:true},
 composer:{uniqueSemanticIdentityVerified:true,
  refBoundToFreshObservation:true,emptyComposerObserved:true,
  sendControlUniquelyIdentified:true},
 coordinator:{aliceOnlyBindingVerified:true,soleWriterLeaseVerified:true,
  pressIntentPersisted:true,approvalForOneHandshake:true},
 execution:{ownActiveAndExclusive:true,desktopUnlocked:true,backgroundOnly:true}
});
test('existing 205C-43 observation is not proof of background write or composer',()=>{
 const e=base();
 e.fixture.backgroundReadbackVerified=false;
 e.composer.uniqueSemanticIdentityVerified=false;
 e.coordinator.pressIntentPersisted=false;
 const r=assessAliceBackgroundHandoff(e);
 assert.equal(r.gates.exactOwner,true);
 assert.equal(r.gates.nativeBackground,true);
 assert.equal(r.gates.fixtureBackgroundProven,false);
 assert.equal(r.nextGate,'fixtureBackgroundProven');
 assert.equal(r.chatDeliveryAuthorized,false);
 assert.equal(r.executionAuthorized,false);
});
test('wrong project, tab, provider or no background mode fails in order',()=>{
 for(const change of [
  e=>{e.target.conversationId='other-chat'},
  e=>{e.target.activeTabInTargetWindow=false}
 ]){
  const e=base();change(e);
  assert.equal(assessAliceBackgroundHandoff(e).nextGate,'exactOwner');
 }
 for(const change of [
  e=>{e.provider.deliveryModes=['foreground']},
  e=>{e.provider.id='peekaboo'},
  e=>{e.provider.actions=['list_windows','get_window_state']}
 ]){
  const e=base();change(e);
  assert.equal(assessAliceBackgroundHandoff(e).nextGate,'nativeBackground');
 }
});
test('only verified fixture + unique composer + one writer can reach final planning gate',()=>{
 const e=base();
 assert.equal(assessAliceBackgroundHandoff(e).nextGate,
  'eligible_for_separately_reviewed_send');
 e.coordinator.soleWriterLeaseVerified=false;
 assert.equal(assessAliceBackgroundHandoff(e).nextGate,'singleWriterAuthorized');
 e.coordinator.soleWriterLeaseVerified=true;
 e.execution.backgroundOnly=false;
 assert.equal(assessAliceBackgroundHandoff(e).nextGate,'noForegroundFallback');
});
test('planning gate never issues input, accepts chat text or reports authorization',()=>{
 const result=assessAliceBackgroundHandoff(base());
 for(const k of ['executionAuthorized','chatDeliveryAuthorized','sendsOrTypes',
  'usesScreenshots','usesBrowserRelay','mayActivateWindow','mayMovePointer']){
  assert.equal(result[k],false);
 }
 assert.doesNotMatch(JSON.stringify(result),/set_value.*value|messageText|elementRef|chatText/);
});
