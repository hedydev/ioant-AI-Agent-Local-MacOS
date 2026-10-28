// Codex-style AliceAI background Computer Use: fail-closed handoff gates.
// This is a pure planning contract. It provides NO computer.act, model,
// browser, service, chat or filesystem execution authority.
const ID='g-p-6acaef839af081919426a885b3209f54';
const CHAT='6ade11a5-f0c0-83ec-add1-8a0cff00c938';
const requiredActions=Object.freeze(['list_windows','get_window_state','set_value']);
const bool=x=>x===true;
export function assessAliceBackgroundHandoff(evidence={}){
 const target=evidence.target??{},provider=evidence.provider??{};
 const exactOwner=target.projectId===ID&&target.conversationId===CHAT&&
  target.exactChromeUrlVerified===true&&target.uniqueWindowVerified===true&&
  target.activeTabInTargetWindow===true;
 const nativeBackground=provider.id==='cua-computer'&&
  provider.contractVersion===2&&provider.connected===true&&
  Array.isArray(provider.actions)&&
  requiredActions.every(x=>provider.actions.includes(x))&&
  Array.isArray(provider.deliveryModes)&&
  provider.deliveryModes.includes('background')&&
  typeof provider.generation==='string'&&provider.generation.length>0;
 // Real background mutation must be exercised on a pinned, disposable
 // AppKit fixture first. No provider advertisement alone establishes it.
 const fixture=bool(evidence.fixture?.backgroundReadbackVerified)&&
  bool(evidence.fixture?.windowOwnershipVerified)&&
  bool(evidence.fixture?.frontmostUnaffectedVerified)&&
  bool(evidence.fixture?.pointerNoninterferenceVerified)&&
  bool(evidence.fixture?.driverGenerationStable)&&
  bool(evidence.fixture?.ownExecutionClosedVerified);
 // UI identity is not established by a textbox count or screen geometry.
 const composer=bool(evidence.composer?.uniqueSemanticIdentityVerified)&&
  bool(evidence.composer?.refBoundToFreshObservation)&&
  bool(evidence.composer?.emptyComposerObserved)&&
  bool(evidence.composer?.sendControlUniquelyIdentified);
 const singleWriter=bool(evidence.coordinator?.aliceOnlyBindingVerified)&&
  bool(evidence.coordinator?.soleWriterLeaseVerified)&&
  bool(evidence.coordinator?.pressIntentPersisted)&&
  bool(evidence.coordinator?.approvalForOneHandshake);
 const gates=Object.freeze({
  exactOwner,nativeBackground,fixtureBackgroundProven:fixture,
  composerIdentityProven:composer,singleWriterAuthorized:singleWriter,
  currentExecutionExclusive:bool(evidence.execution?.ownActiveAndExclusive),
  desktopUnlocked:bool(evidence.execution?.desktopUnlocked),
  noForegroundFallback:bool(evidence.execution?.backgroundOnly)
 });
 const order=['exactOwner','nativeBackground','fixtureBackgroundProven',
  'composerIdentityProven','singleWriterAuthorized',
  'currentExecutionExclusive','desktopUnlocked','noForegroundFallback'];
 const next=order.find(x=>gates[x]!==true)??'eligible_for_separately_reviewed_send';
 return Object.freeze({
  audit:'IOANT_ALICE_CODEX_STYLE_BACKGROUND_HANDOFF',
  schemaVersion:1,mode:'native_element_background',nextGate:next,
  gates,executionAuthorized:false,chatDeliveryAuthorized:false,
  sendsOrTypes:false,usesScreenshots:false,usesBrowserRelay:false,
  mayActivateWindow:false,mayMovePointer:false,
  approvalStillRequiresTrustedExactChatTransport:true,
  note:'planning_only_not_a_capability_or_permission_grant'
 });
}
