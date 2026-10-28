// Strict, bounded synthetic file-delivery receipt for one exact ChatGPT chat.
// This module is pure: no uploading, pressing, clicking, or browser requests.
const CHAT='https://chatgpt.com/g/g-p-6adbdb6e70348191bc5acb11efb0db5d-ai-openclawgong-zuo-liu/c/6ae18e93-e2a0-83ec-aac9-88105079f208';
const TAG='IOANT-UPLOAD-FIXTURE-20261028-196';
const FILE='IOANT-ChatGPT-Upload-Fixture-20261028.txt';
const PREFIX='IOANT_SCOPED_RECEIPT:';
const BASE={audit:'IOANT_SCOPED_SYNTHETIC_UPLOAD_RECEIPT',
 schemaVersion:1,readOnly:true,exactConversationOnly:true,
 rawMessageTextReturned:false,rawDOMReturned:false};
export function buildScopedReceiptProbe({chatUrl=CHAT,marker=TAG,filename=FILE}={}){
 if(chatUrl!==CHAT||typeof marker!=='string'||
  !/^[A-Z0-9_-]{10,96}$/.test(marker)||
  typeof filename!=='string'||filename.length<1||filename.length>180||
  filename.includes('/')||filename.includes('\\')||/[\u0000-\u001f]/.test(filename))throw Error('invalid_scoped_receipt_identity');
 const constants='const URL='+JSON.stringify(chatUrl)+
  ',TAG='+JSON.stringify(marker)+',FILE='+JSON.stringify(filename)+
  ',PREFIX='+JSON.stringify(PREFIX)+';';
 return '() => {'+constants+
  'const main=document.querySelector("main"),exact=location.href===URL;'+
  'const selectors=["[data-content-search-unit-key$=\\":user\\"]",'+
   '"[data-message-author-role=\\"user\\"]",'+
   '"[data-conversation-role=\\"user\\"]",'+
   '"[data-user-message-bubble=\\"true\\"]"];'+
  'const groups=selectors.map(s=>Array.from(document.querySelectorAll(s)).slice(-100));'+
  'const ix=groups.findIndex(a=>a.length>0);'+
  'const roles=ix>=0?groups[ix]:[],sel=ix>=0?selectors[ix]:null;'+
  'const text=(n,s)=>String(n?.innerText??n?.textContent??"").includes(s);'+
  'const marked=roles.filter(n=>text(n,TAG)&&!!main?.contains(n));'+
  'let depth=-1,count=-1,attached=false,inAttribute=false;'+
  'if(exact&&marked.length===1&&main){'+
   'const el=marked[0];let node=el;'+
   'for(let d=0;d<=4&&node&&node!==main;d++,node=node.parentElement){'+
    'if(!main.contains(node))break;'+
    'const members=[...(node.matches?.(sel)?[node]:[]),...Array.from(node.querySelectorAll(sel))];'+
    'const labels=Array.from(node.querySelectorAll("[title],[aria-label]"));'+
    'const localAttribute=labels.some(n=>!el.contains(n)&&'+
     '(String(n.getAttribute("title")??"").includes(FILE)||'+
     'String(n.getAttribute("aria-label")??"").includes(FILE)));'+
    'const localFile=text(node,FILE);'+
    'if(localAttribute&&members.length===1&&members[0]===el){'+
     'depth=d;count=1;attached=true;inAttribute=localAttribute;break;'+
    '}'+
    'if((localAttribute||localFile)&&members.length>1){count=Math.min(members.length,101);break;}'+
   '}'+
  '}'+
  'return PREFIX+JSON.stringify({exact,main:!!main,markerCount:Math.min(marked.length,101),'+
   'roleFamily:ix,attached,inAttribute,depth,roleCount:count});'+
 '}';
}
function decode(raw){
 let result=null;
 const visit=(x,n=0)=>{
  if(n>10||x==null||result!==null)return;
  if(typeof x==='string'){
   if(x.startsWith(PREFIX)){try{result=JSON.parse(x.slice(PREFIX.length))}catch{};return}
   if(x.length>300000)return;
   try{visit(JSON.parse(x),n+1)}catch{}
   return;
  }
  if(Array.isArray(x)){for(const y of x.slice(0,32))visit(y,n+1)}
  else if(typeof x==='object')
   for(const k of ['result','content','value','text','output','data'])if(k in x)visit(x[k],n+1);
 };
 visit(raw);
 return result;
}
export function classifyScopedReceipt(raw){
 const p=decode(raw);
 if(!p||p.exact!==true||p.main!==true||
  !Number.isSafeInteger(p.markerCount)||p.markerCount<0||p.markerCount>101||
  !Number.isSafeInteger(p.roleFamily)||p.roleFamily<-1||p.roleFamily>3||
  !Number.isSafeInteger(p.depth)||p.depth< -1||p.depth>4||
  !Number.isSafeInteger(p.roleCount)||p.roleCount<-1||p.roleCount>101||
  typeof p.attached!=='boolean'||typeof p.inAttribute!=='boolean')
  return {...BASE,state:'inconclusive',reason:'scoped_receipt_invalid'};
 // A pasted filename is never attachment evidence. Demand distinct
 // attachment metadata outside the user text bubble, inside the same
 // one-message wrapper (proven by the 199B fixture's ancestorDepth=1).
 const verified=p.markerCount===1&&p.roleFamily>=0&&p.attached===true&&
  p.inAttribute===true&&p.roleCount===1&&p.depth>=1;
 return {...BASE,state:verified?'confirmed':'inconclusive',
  reason:verified?'one_user_turn_with_scoped_attachment':'scoped_receipt_not_confirmed',
  uniqueMarker:p.markerCount===1,attachmentScoped:p.attached,
  attachmentAttributeInScope:p.inAttribute,ancestorDepth:p.depth,
  scopedUserTurnCount:p.roleCount,roleFamily:p.roleFamily};
}
