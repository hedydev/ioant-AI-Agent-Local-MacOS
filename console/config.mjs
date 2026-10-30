import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO=dirname(dirname(fileURLToPath(import.meta.url)));
export const PRIVATE_ROOT=join(homedir(),'Library/Application Support/ioant-openclaw-ops');
export const CONSOLE_ROOT=join(PRIVATE_ROOT,'tunnel-console');
export const AUDIT_ROOT=join(CONSOLE_ROOT,'mcp-audit');
export const TUNNEL_BINARY='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/tools/tunnel-client/v0.0.18/tunnel-client';
export const PROFILE_DIR=join(PRIVATE_ROOT,'direct-tunnel');
export const PROFILE='ioant-openclaw-direct';
export const HEALTH_FILE=join(CONSOLE_ROOT,'tunnel-health.txt');
export const LEGACY_HEALTH_FILE='/Volumes/LunaDrive/DeveloperCache/projects/ioant-ai-agent-local-macos/verification/direct-runtime-06-health.txt';
export const PROCESS_FILE=join(CONSOLE_ROOT,'tunnel-process.json');
export const PORT=18489;
export const CONTROL_PROXY='http://127.0.0.1:7897';
