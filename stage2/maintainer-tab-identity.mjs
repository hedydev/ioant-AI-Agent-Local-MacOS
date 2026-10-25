// Pure, privacy-preserving identity classification of already visible
// OpenClaw Chrome Relay tab metadata. No browser DOM, navigation or actions.
// The only output is bounded integer counts; never log another tab's URL.
import {parseProjectChatUrl} from './project-chat-routing.mjs';

const BARE=/^\/c\/([A-Za-z0-9-]{15,100})$/;
const COUNTS=['matchingTabs','sameConversationOtherProjectTabs',
 'sameConversationUnscopedTabs','sameProjectOtherChatTabs',
 'otherChatgptTabs','otherVisibleTabs'];
const empty=()=>Object.fromEntries(COUNTS.map(k=>[k,0]));

export function categorizeMaintainerTab(raw,expected){
 if(typeof raw!=='string'||raw.length>1024)return 'otherVisibleTabs';
 let u;
 try{u=new URL(raw)}catch{return 'otherVisibleTabs'}
 if(u.protocol!=='https:'||u.hostname!=='chatgpt.com'||u.port||
    u.username||u.password||u.hash)return 'otherVisibleTabs';
 try{
   const chat=parseProjectChatUrl(raw,{allowTracking:true});
   if(chat.conversationId===expected.conversationId)
     return chat.projectId===expected.projectId?
       'matchingTabs':'sameConversationOtherProjectTabs';
   return chat.projectId===expected.projectId?
     'sameProjectOtherChatTabs':'otherChatgptTabs';
 }catch{/* Potential unscoped /c/<id> chat or unsupported URL. */}
 if(u.search&&([ ...u.searchParams.keys()].length!==1||
   u.searchParams.get('utm_source')!=='chatgpt.com'))return 'otherChatgptTabs';
 const bare=u.pathname.match(BARE);
 if(bare&&bare[1]===expected.conversationId)
   return 'sameConversationUnscopedTabs';
 return 'otherChatgptTabs';
}

export function tallyMaintainerTabs(raw,expected){
 let value;
 try{value=JSON.parse(raw)}catch{return {state:'unknown',reason:'invalid_tabs'}}
 const tabs=Array.isArray(value)?value:value?.tabs??value?.result?.tabs;
 if(!Array.isArray(tabs)||tabs.length>1000)
   return {state:'unknown',reason:'invalid_tabs'};
 const counts=empty();
 for(const tab of tabs){
   const category=categorizeMaintainerTab(tab?.url,expected);
   counts[category]++;
 }
 return {state:'ok',visibleTabs:tabs.length,...counts};
}

export function validatedMaintainerTabCounts(sample){
 if(!sample||sample.state!=='ok'||!Number.isSafeInteger(sample.visibleTabs)||
   sample.visibleTabs<0||sample.visibleTabs>1000)return false;
 if(!COUNTS.every(k=>Number.isSafeInteger(sample[k])&&
   sample[k]>=0&&sample[k]<=sample.visibleTabs))return false;
 return COUNTS.reduce((n,k)=>n+sample[k],0)===sample.visibleTabs;
}
