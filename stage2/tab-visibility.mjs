// Browser tab visibility diagnosis, read-only and URL-redacted.
// Never infer "signed out" from a missing tab or relax exact-URL matching.
import {validateChatUrl} from './protocol.mjs';
export function tabVisibility(tabs,expectedUrl,profile){
 if(!Array.isArray(tabs)||!['chrome','openclaw','user'].includes(profile))
  throw Error('invalid_tab_metadata');
 const url=validateChatUrl(expectedUrl);
 const conversationId=new URL(url).pathname.split('/').at(-1);
 const scoped=tabs.filter(t=>t&&typeof t.url==='string');
 const chatgpt=scoped.filter(t=>{try{return new URL(t.url).origin==='https://chatgpt.com'}catch{return false}});
 const exact=chatgpt.filter(t=>t.url===url);
 const sameId=chatgpt.filter(t=>{
  try{return new URL(t.url).pathname.split('/').at(-1)===conversationId}catch{return false}
 });
 const code=exact.length===1?'exact_match':exact.length>1?'duplicate_exact':
  sameId.length>0?'same_chat_different_url':chatgpt.length>0?'different_chat_visible':'no_chatgpt_tab_visible';
 return {profile,code,visibleTabs:tabs.length,chatgptTabs:chatgpt.length,
  matchingTabs:exact.length,sameIdTabs:sameId.length};
}
