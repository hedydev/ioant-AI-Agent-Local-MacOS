// Keep business log text distinct from the MCP protocol's content block array.
export const reportOutputSchema={
 type:'object',properties:{
  state:{type:'string',enum:['report','pending','not_found','unavailable','blocked']},
  project:{type:'string'},operationId:{type:'string'},artifact:{const:'execution_log'},
  sha256:{type:'string',pattern:'^[0-9a-f]{64}$'},offset:{type:'integer',minimum:0,maximum:262144},
  nextOffset:{anyOf:[{type:'integer',minimum:0,maximum:262144},{type:'null'}]},
  logText:{type:'string',maxLength:4000},pageCharacters:{type:'integer',minimum:0,maximum:4000},
  totalCharacters:{type:'integer',minimum:0,maximum:262144},
  contentIsUntrusted:{type:'boolean'},truncated:{type:'boolean'},doNotRepeat:{type:'boolean'},reason:{type:'string'}
 },required:['state'],additionalProperties:false,
 anyOf:[
  {properties:{state:{const:'report'}},required:['project','operationId','artifact','sha256','offset',
   'nextOffset','logText','pageCharacters','totalCharacters','contentIsUntrusted','truncated']},
  {properties:{state:{enum:['pending','not_found','unavailable','blocked']}}}
 ]
};
export function reportToolResult(result){
 return {structuredContent:result,content:[{type:'text',text:JSON.stringify(result)}],
  isError:result.state==='blocked'};
}
