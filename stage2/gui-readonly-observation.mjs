// Phase 1: exact-tab, read-only GUI structure observation.
// NEVER transmit arbitrary DOM text, input values, links, page content or screenshots.
// The injected browser function is self-contained and returns finite allowlisted types.
export const GUI_PREFIX='IOANT_GUI_READONLY::';
export const GUI_ACTION='openclaw-gui-readonly-probe';
const AUDIT='IOANT_GUI_READONLY';
const ROLES=new Set(['button','link','textbox','checkbox','combobox','tab','menuitem']);
const LABELS=new Set(['send','submit','cancel','close','search','menu','back',
 'next','continue','save','edit','delete','copy','refresh','share','settings',
 'new chat','log in','sign in','sign out','attach','upload','download',
 'stop','retry','发送','取消','关闭','搜索','菜单','返回','下一步','继续','保存',
 '删除','复制','设置','新建对话']);
const safeReply=(state,extra={})=>({audit:AUDIT,schemaVersion:1,state,
 readOnly:true,click:false,inputRead:false,screenshot:false,...extra});

// This function's source is serialized and run on the currently authorized
// tab. Keep it standalone: imported module constants are NOT available there.
export function collectGuiStructure(doc=document,loc=location){
 const prefix='IOANT_GUI_READONLY::';
 const labels=['send','submit','cancel','close','search','menu','back','next',
  'continue','save','edit','delete','copy','refresh','share','settings',
  'new chat','log in','sign in','sign out','attach','upload','download',
  'stop','retry','发送','取消','关闭','搜索','菜单','返回','下一步','继续','保存',
  '删除','复制','设置','新建对话'];
 const allowed=new Set(labels);
 const roles=new Set(['button','link','textbox','checkbox','combobox','tab','menuitem']);
 const vw=Math.min(8192,Math.max(1,Math.round(Number(doc.defaultView?.innerWidth)||doc.documentElement?.clientWidth||1)));
 const vh=Math.min(8192,Math.max(1,Math.round(Number(doc.defaultView?.innerHeight)||doc.documentElement?.clientHeight||1)));
 const selector='button,a[href],input:not([type="hidden"]),textarea,select,'+
   '[role="button"],[role="link"],[role="textbox"],[role="checkbox"],'+
   '[role="combobox"],[role="tab"],[role="menuitem"]';
 const all=Array.from(doc.querySelectorAll(selector));
 const results=[];
 let visible=0,occluded=0;
 for(const el of all.slice(0,256)){
  const name=String(el.tagName||'').toLowerCase();
  const declared=String(el.getAttribute?.('role')||'').toLowerCase();
  const role=roles.has(declared)?declared:
   name==='button'?'button':name==='a'?'link':
   name==='textarea'||name==='input'?'textbox':
   name==='select'?'combobox':null;
  if(!role)continue;
  const rect=el.getBoundingClientRect?.();
  if(!rect)continue;
  const css=doc.defaultView?.getComputedStyle?.(el);
  if(css&&(css.display==='none'||css.visibility==='hidden'||
    css.visibility==='collapse'||Number(css.opacity)===0))continue;
  if(el.getAttribute?.('aria-hidden')==='true')continue;
  const {x,y,width,height}=rect;
  if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0||
    x>=vw||y>=vh||x+width<=0||y+height<=0)continue;
  visible++;
  const cx=Math.max(0,Math.min(vw-1,Math.round(x+width/2)));
  const cy=Math.max(0,Math.min(vh-1,Math.round(y+height/2)));
  const hit=doc.elementFromPoint?.(cx,cy);
  const centerHit=!!hit&&(hit===el||el.contains?.(hit)===true);
  if(!centerHit)occluded++;
  if(results.length>=24)continue;
  // Strict exact-match semantic allowlist. Never expose free-form text.
  // In particular: no text from input.value, textarea.value, href,
  // document.body, full snapshots, user messages or arbitrary aria-labels.
  const raw=String(el.getAttribute?.('aria-label')||
     (name==='button'||name==='a'?el.textContent:'')||'');
  const normalized=raw.trim().toLowerCase().replace(/\s+/g,' ');
  const safeLabel=normalized.length<=20&&allowed.has(normalized)?normalized:'other';
  const box={x:Math.max(0,Math.round(x)),y:Math.max(0,Math.round(y)),
   w:Math.min(vw,Math.round(width)),h:Math.min(vh,Math.round(height))};
  results.push({role,label:safeLabel,box,centerHit,disabled:!!el.disabled||
   el.getAttribute?.('aria-disabled')==='true'});
 }
 return prefix+JSON.stringify({url:String(loc.href),viewport:{w:vw,h:vh},
  scanned:Math.min(all.length,256),visible,occluded,controls:results,
  truncated:all.length>256||visible>24});
}
export const guiEvaluateFunction='() => ('+collectGuiStructure.toString()+')()';

function extractResult(value){
 if(typeof value==='string'){
  const trimmed=value.trim();
  // OpenClaw browser --json normally wraps evaluate output as JSON. Unpack
  // the wrapper FIRST, or the marker inside the serialized JSON string
  // would be mistaken for a bare prefix followed by trailing JSON syntax.
  if(trimmed.startsWith('{')||trimmed.startsWith('[')||trimmed.startsWith('"')){
   try{return extractResult(JSON.parse(trimmed))}catch{return null}
  }
  if(trimmed.startsWith(GUI_PREFIX)){
   const fragment=trimmed.slice(GUI_PREFIX.length);
   try{return JSON.parse(fragment)}catch{return null}
  }
  return null;
 }
 if(value&&typeof value==='object'){
  for(const key of ['result','value','text','output','content','data']){
   if(Object.hasOwn(value,key)){
    const found=extractResult(value[key]);
    if(found)return found;
   }
  }
 }
 return null;
}
const validInt=(n,max)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const exactKeys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&
 Object.keys(o).every(k=>allowed.includes(k));
export function validateGuiObservation(data,expectedUrl){
 if(!exactKeys(data,['url','viewport','scanned','visible','occluded',
   'controls','truncated'])||data.url!==expectedUrl||
   !exactKeys(data.viewport,['w','h'])||
   !validInt(data.viewport.w,8192)||data.viewport.w<1||
   !validInt(data.viewport.h,8192)||data.viewport.h<1||
   !validInt(data.scanned,256)||!validInt(data.visible,256)||
   !validInt(data.occluded,256)||data.occluded>data.visible||
   typeof data.truncated!=='boolean'||!Array.isArray(data.controls)||
   data.controls.length>24||data.controls.length>data.visible)return null;
 for(const c of data.controls){
  if(!exactKeys(c,['role','label','box','centerHit','disabled'])||
     !ROLES.has(c.role)||!LABELS.has(c.label)&&c.label!=='other'||
     !exactKeys(c.box,['x','y','w','h'])||
     !validInt(c.box.x,8192)||!validInt(c.box.y,8192)||
     !validInt(c.box.w,8192)||!validInt(c.box.h,8192)||
     typeof c.centerHit!=='boolean'||typeof c.disabled!=='boolean')
    return null;
 }
 return safeReply('observed',{viewport:data.viewport,
  scanned:data.scanned,visible:data.visible,occluded:data.occluded,
  controls:data.controls,truncated:data.truncated});
}

export async function observeGuiReadOnly({url,target,browser}={}){
 if(typeof url!=='string'||!/^https:\/\/chatgpt\.com\/(?:g\/[^/]+\/)?c\/[a-zA-Z0-9-]{15,}$/.test(url)||
    typeof target!=='string'||!/^[a-zA-Z0-9_:-]{1,128}$/.test(target)||
    typeof browser!=='function')return safeReply('blocked',{note:'unbound_exact_tab'});
 try{
  const raw=await browser('--json','evaluate','--target-id',target,'--fn',guiEvaluateFunction);
  if(typeof raw!=='string'||raw.length>256*1024)return safeReply('inconclusive',{note:'response_unbounded'});
  const data=extractResult(raw);
  return validateGuiObservation(data,url)??safeReply('inconclusive',{note:'unsafe_observation'});
 }catch{return safeReply('inconclusive',{note:'browser_unavailable'});}
}
