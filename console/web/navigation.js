// Pure route state, independent of polling and DOM reconstruction.
export function decodeRoute(hash=''){
 if(hash.startsWith('#project=')){try{const project=decodeURIComponent(hash.slice(9));if(/^[a-z][a-z0-9-]{0,47}$/.test(project))return {view:'project',project};}catch{}}
 return {view:['activity','logs'].includes(hash.slice(1))?hash.slice(1):'overview',project:null};
}
export function routeHash(state){return state.view==='project'?'#project='+encodeURIComponent(state.selectedProject):state.view==='overview'?'':'#'+state.view;}
export function projectSelection(state,key){return state.view==='project'&&state.selectedProject===key;}
