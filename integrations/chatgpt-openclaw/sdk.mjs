// Reuse the SDK bundled with the already installed OpenClaw; no npm install.
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function loadSdk(){
 const require=createRequire(join(homedir(),
  '.openclaw/tools/node-v24.22.1/lib/node_modules/openclaw/package.json'));
 const load=path=>import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/'+path)).href);
 const [server,transport,types]=await Promise.all([
  load('server/index.js'),load('server/stdio.js'),load('types.js')]);
 return {Server:server.Server,StdioServerTransport:transport.StdioServerTransport,
  ListToolsRequestSchema:types.ListToolsRequestSchema,
  CallToolRequestSchema:types.CallToolRequestSchema};
}

export async function loadClientSdk(){
 const require=createRequire(join(homedir(),
  '.openclaw/tools/node-v24.22.1/lib/node_modules/openclaw/package.json'));
 const load=path=>import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/'+path)).href);
 const [client,transport]=await Promise.all([load('client/index.js'),load('client/stdio.js')]);
 return {Client:client.Client,StdioClientTransport:transport.StdioClientTransport};
}
