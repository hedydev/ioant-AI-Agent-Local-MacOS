// Fail-closed, side-effect-free policy for concurrently using a Mac desktop.
// This is a decision guard, NOT a Computer Use executor. The actual node,
// Gateway policies, Apple TCC permissions and provider remain authoritative.
const actionSet=new Set(['type','set_value','left_click','scroll','key']);
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const plain=x=>typeof x==='string'&&x.length>0&&x.length<=256;
const blocked=(reason)=>Object.freeze({audit:'IOANT_MAC_NONINTERFERENCE_POLICY',
 schemaVersion:1,state:'blocked',reason,allowExecution:false,
 fallbackToForeground:false,mutatedDesktop:false});
const allowed=(reason)=>Object.freeze({audit:'IOANT_MAC_NONINTERFERENCE_POLICY',
 schemaVersion:1,state:'eligible_for_authorized_background_execution',
 reason,allowExecution:true,fallbackToForeground:false,
 mutatedDesktop:false});
export function evaluateBackgroundComputerAction({request,capabilities,authorization}={}){
 if(!isObj(request)||!isObj(capabilities)||!isObj(authorization))
  return blocked('incomplete_evidence');
 if(authorization.browserHostRestriction==='blocked')
  return blocked('browser_host_access_blocked');
 if(authorization.computerControlApproved!==true)
  return blocked('computer_action_not_authorized');
 if(authorization.sharedDesktopUserActive!==true&&
    authorization.sharedDesktopUserActive!==false)
  return blocked('user_activity_unknown');
 if(capabilities.provider!=='cua'||capabilities.providerVerified!==true)
  return blocked('verified_cua_provider_required');
 if(capabilities.backgroundVerified!==true||
    !Array.isArray(capabilities.deliveryModes)||
    !capabilities.deliveryModes.includes('background'))
  return blocked('background_delivery_not_independently_verified');
 if(!Array.isArray(capabilities.actions)||
    !capabilities.actions.includes(request.action)||!actionSet.has(request.action))
  return blocked('action_not_advertised');
 if(request.deliveryMode!=='background')
  return blocked('foreground_delivery_forbidden');
 // "desktop" target + background hint is still a foreground desktop route!
 if(!isObj(request.target)||!['window','element'].includes(request.target.kind)||
   !plain(request.target.windowRef))
  return blocked('window_or_element_target_required');
 if(request.target.kind==='element'&&!plain(request.target.elementRef))
  return blocked('element_target_required');
 if(!plain(request.observationId)||
    request.observationGeneration!==capabilities.generation||
    !plain(capabilities.generation))
  return blocked('fresh_matching_observation_required');
 if(request.action==='left_click'||request.action==='scroll'){
  // Coordinate and wheel behavior varies by provider and element. Require
  // an explicitly tested capability flag, not merely "background".
  if(capabilities.backgroundPointerVerified!==true)
   return blocked('background_pointer_not_verified');
  if(!plain(request.target.elementRef))
   return blocked('element_reference_required_for_pointer');
 }
 if(request.action==='key'&&capabilities.backgroundKeyboardVerified!==true)
  return blocked('background_keyboard_not_verified');
 if(['type','set_value'].includes(request.action)&&
    capabilities.backgroundTextVerified!==true)
  return blocked('background_text_not_verified');
 if(request.action==='set_value'&&request.target.kind!=='element')
  return blocked('element_target_required_for_set_value');
 if(request.action==='type'&&request.target.kind==='window'&&
    capabilities.backgroundKeyboardVerified!==true)
  return blocked('background_keyboard_not_verified');
 if(request.targetBrowserOrChatGPT===true)
  return blocked('browser_requires_separate_authorized_surface');
 if(request.willActivateApp===true||request.willMoveSystemPointer===true||
    request.willChangeGlobalFocus===true)
  return blocked('user_interference_declared');
 if(request.targetBrowserOrChatGPT!==false||
    request.willActivateApp!==false||request.willMoveSystemPointer!==false||
    request.willChangeGlobalFocus!==false)
  return blocked('side_effect_scope_not_attested');
 return allowed('explicit_background_window_action_eligible');
}
