// These global tools deliberately have no project_key prerequisite.
export const workspaceTools=[{
 name:'openclaw_capabilities',
 description:'Read the actual division of capabilities: Git/scripts/reports use deterministic MCP repository tasks and DO NOT require Chrome Debug, desktop permission or local model inference. Browser debug is optional and only needed for browser UI automation. Reports attachment separately from a merely running browser service. No model, screenshot, window enumeration or mutation.',
 inputSchema:{type:'object',properties:{},additionalProperties:false},
 annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
},{
 name:'openclaw_browser_session',
 description:'Status or one user-authorized connection attempt for the EXISTING OpenClaw Chrome Debug session. Only for an explicit browser UI task, never for Git/scripts/reports. connect requires operation_id, starts the configured extension transport once and checks actual attached tabs. A running service with zero tabs is not connected. If Chrome needs a user gesture, returns user_action_required; never defeat cancellation by repeated reconnects, install extensions or reset permissions. Same ID only reads the attempt receipt.',
 inputSchema:{type:'object',properties:{action:{type:'string',enum:['status','connect']},operation_id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$'}},required:['action'],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
},{
 name:'openclaw_workspace_projects',
 description:'Discover local Git repositories in operator-approved workspace roots, even before a project Agent is registered. Read-only metadata; no model, desktop control, network fetch or user-file content. When normal conversation needs local work for an unregistered project, use this tool, not computer/terminal probing. repository_id optionally inspects one discovered repository.',
 inputSchema:{type:'object',properties:{repository_id:{type:'string',pattern:'^[a-f0-9]{24}$'},
  offset:{type:'integer',minimum:0,maximum:512}},additionalProperties:false},
 annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}
},{
 name:'openclaw_project_connect',
 description:'Connect the user-requested repository discovered by workspace_projects. Reuse its independent project binding or create an isolated local deny-all OpenClaw Agent/workspace and deterministic script grant within the operator-approved root. No scripts, model inference, desktop operations or server deployment. Do not connect unrelated example projects. Stable operation_id reserves this change before mutation; repeating the same ID only reads its receipt, never repeats an uncertain setup. Returns project_key usable immediately without a new Tunnel or plugin refresh.',
 inputSchema:{type:'object',properties:{operation_id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$'},
  repository_id:{type:'string',pattern:'^[a-f0-9]{24}$'}},required:['operation_id','repository_id'],additionalProperties:false},
 annotations:{readOnlyHint:false,destructiveHint:false,openWorldHint:false}
}];
