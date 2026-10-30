#!/usr/bin/env node
import {manageConsole} from '../console/service-manager.mjs';
try{if(process.argv.length!==3)throw Error('use_start_stop_status');console.log(JSON.stringify(await manageConsole(process.argv[2])));}
catch(e){console.error(/^[a-z_]+$/.test(e.message)?e.message:'console_service_command_failed');process.exitCode=1;}
