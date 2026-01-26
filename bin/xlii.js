#!/usr/bin/env node

import { parseArgs } from 'node:util';
import {
  configure,
  harvest,
  sow,
  graft,
  diff,
  addBaseDir,
  addCompleteDir,
  addMemoryFile,
  watch,
  status,
  openconfig
} from '../src/index.js';

const commands = {
  configure: {
    description: 'Configure xlii with device name and base directory',
    usage: 'xlii configure <device-name> <directory>',
    handler: configure
  },
  harvest: {
    description: 'Copy memory files from base directories to storage',
    usage: 'xlii harvest',
    handler: harvest
  },
  sow: {
    description: 'Copy memory files from storage to base directories',
    usage: 'xlii sow',
    handler: sow
  },
  graft: {
    description: 'Sync by taking whichever memory files are newer',
    usage: 'xlii graft',
    handler: graft
  },
  diff: {
    description: 'List differences between base directories and storage',
    usage: 'xlii diff',
    handler: diff
  },
  addBaseDir: {
    description: 'Add a base directory to track',
    usage: 'xlii addBaseDir <directory>',
    handler: addBaseDir
  },
  addCompleteDir: {
    description: 'Add a complete directory (full sync)',
    usage: 'xlii addCompleteDir <directory>',
    handler: addCompleteDir
  },
  addMemoryFile: {
    description: 'Add a memory file pattern to track',
    usage: 'xlii addMemoryFile <filename>',
    handler: addMemoryFile
  },
  watch: {
    description: 'Watch for changes and auto-sync to storage',
    usage: 'xlii watch',
    handler: watch
  },
  status: {
    description: 'Show current configuration and storage status',
    usage: 'xlii status',
    handler: status
  },
  openconfig: {
    description: 'Open the config file in default editor',
    usage: 'xlii openconfig',
    handler: openconfig
  }
};

function showHelp() {
  console.log('xlii - AI Memory File Manager\n');
  console.log('Usage: xlii <command> [options]\n');
  console.log('Commands:');
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(16)} ${cmd.description}`);
  }
  console.log('\nUse "xlii <command> --help" for more information about a command.');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    showHelp();
    process.exit(1);
  }

  try {
    await commands[command].handler(commandArgs);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
