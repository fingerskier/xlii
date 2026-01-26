import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import chokidar from 'chokidar';
import { homedir } from 'node:os';
import {
  loadConfig,
  saveConfig,
  loadStorageConfig,
  saveStorageConfig,
  expandPath,
  getDefaultMemoryFiles,
  ensureDir,
  getConfigFile,
  getConfigDir
} from './config.js';
import {
  scanBaseDirectory,
  scanCompleteDirectory,
  scanStorageDirectory
} from './scanner.js';
import {
  getStoragePath,
  copyToStorage,
  copyFromStorage,
  compareFiles,
  syncFile
} from './sync.js';

export { getStoragePath } from './sync.js';

export async function configure(args) {
  if (args.length < 2) {
    console.error('Error: Both device-name and directory are required.');
    console.error('Usage: xlii configure <device-name> <directory>');
    process.exit(1);
  }

  const [systemName, baseDir] = args;

  if (!systemName || !systemName.trim()) {
    console.error('Error: device-name is required and cannot be empty.');
    console.error('Usage: xlii configure <device-name> <directory>');
    process.exit(1);
  }

  if (!baseDir || !baseDir.trim()) {
    console.error('Error: directory is required and cannot be empty.');
    console.error('Usage: xlii configure <device-name> <directory>');
    process.exit(1);
  }

  const expandedBaseDir = expandPath(baseDir);

  if (!existsSync(expandedBaseDir)) {
    console.error(`Error: Base directory does not exist: ${expandedBaseDir}`);
    process.exit(1);
  }

  const storagePath = join(homedir(), 'xlii');
  const storageConfigPath = join(storagePath, 'configuration.json');

  const config = {
    systemName: systemName.trim(),
    baseDirectories: [baseDir],
    completeDirectories: [],
    storagePath
  };

  await saveConfig(config);

  const storageConfig = {
    memoryFiles: getDefaultMemoryFiles()
  };
  await saveStorageConfig(storagePath, storageConfig);

  console.log('Configuration saved successfully!\n');
  console.log('Settings:');
  console.log(`  Device name:    ${systemName.trim()}`);
  console.log(`  Base directory: ${baseDir}`);
  console.log('\nConfig paths:');
  console.log(`  Local config:   ${getConfigFile()}`);
  console.log(`  Storage path:   ${storagePath}`);
  console.log(`  Storage config: ${storageConfigPath}`);
  console.log(`\nRun 'xlii harvest' to copy memory files to storage.`);
}

export async function harvest(args) {
  const config = await loadConfig();
  if (!config) {
    throw new Error('Not configured. Run "xlii configure <systemName> <baseDir>" first.');
  }

  const storageConfig = await loadStorageConfig(config.storagePath);
  const memoryFiles = storageConfig.memoryFiles;

  let copiedCount = 0;

  for (const baseDir of config.baseDirectories) {
    console.log(`\nScanning base directory: ${baseDir}`);
    const files = await scanBaseDirectory(baseDir, memoryFiles);

    for (const file of files) {
      const targetPath = await copyToStorage(file.sourcePath, config.storagePath, config.systemName);
      console.log(`  Copied: ${file.sourcePath} -> ${targetPath}`);
      copiedCount++;
    }
  }

  for (const completeDir of config.completeDirectories || []) {
    console.log(`\nScanning complete directory: ${completeDir}`);
    const files = await scanCompleteDirectory(completeDir);

    for (const file of files) {
      const targetPath = await copyToStorage(file.sourcePath, config.storagePath, config.systemName);
      console.log(`  Copied: ${file.sourcePath} -> ${targetPath}`);
      copiedCount++;
    }
  }

  console.log(`\nHarvest complete. ${copiedCount} file(s) copied to storage.`);
}

export async function sow(args) {
  const config = await loadConfig();
  if (!config) {
    throw new Error('Not configured. Run "xlii configure <systemName> <baseDir>" first.');
  }

  const storageConfig = await loadStorageConfig(config.storagePath);
  const memoryFiles = storageConfig.memoryFiles;

  let copiedCount = 0;

  for (const baseDir of config.baseDirectories) {
    console.log(`\nProcessing base directory: ${baseDir}`);
    const expandedBase = expandPath(baseDir);
    const storageFiles = await scanStorageDirectory(config.storagePath, config.systemName, baseDir);

    for (const file of storageFiles) {
      if (memoryFiles.includes(file.filename)) {
        const targetPath = join(expandedBase, file.relativePath);
        await ensureDir(dirname(targetPath));
        await syncFile(file.storagePath, targetPath, true);
        console.log(`  Copied: ${file.storagePath} -> ${targetPath}`);
        copiedCount++;
      }
    }
  }

  for (const completeDir of config.completeDirectories || []) {
    console.log(`\nProcessing complete directory: ${completeDir}`);
    const expandedComplete = expandPath(completeDir);
    const storageFiles = await scanStorageDirectory(config.storagePath, config.systemName, completeDir, true);

    for (const file of storageFiles) {
      const targetPath = join(expandedComplete, file.relativePath);
      await ensureDir(dirname(targetPath));
      await syncFile(file.storagePath, targetPath, true);
      console.log(`  Copied: ${file.storagePath} -> ${targetPath}`);
      copiedCount++;
    }
  }

  console.log(`\nSow complete. ${copiedCount} file(s) copied from storage.`);
}

export async function graft(args) {
  const config = await loadConfig();
  if (!config) {
    throw new Error('Not configured. Run "xlii configure <systemName> <baseDir>" first.');
  }

  const storageConfig = await loadStorageConfig(config.storagePath);
  const memoryFiles = storageConfig.memoryFiles;

  let toStorageCount = 0;
  let fromStorageCount = 0;

  for (const baseDir of config.baseDirectories) {
    console.log(`\nSyncing base directory: ${baseDir}`);
    const expandedBase = expandPath(baseDir);
    const baseFiles = await scanBaseDirectory(baseDir, memoryFiles);
    const storageFiles = await scanStorageDirectory(config.storagePath, config.systemName, baseDir);

    const baseFileMap = new Map(baseFiles.map(f => [f.relativePath, f]));
    const storageFileMap = new Map(storageFiles.map(f => [f.relativePath, f]));

    const allPaths = new Set([...baseFileMap.keys(), ...storageFileMap.keys()]);

    for (const relativePath of allPaths) {
      const baseFile = baseFileMap.get(relativePath);
      const storageFile = storageFileMap.get(relativePath);

      if (baseFile && !storageFile) {
        const targetPath = await copyToStorage(baseFile.sourcePath, config.storagePath, config.systemName);
        console.log(`  -> Storage: ${baseFile.sourcePath}`);
        toStorageCount++;
      } else if (!baseFile && storageFile) {
        if (memoryFiles.includes(storageFile.filename)) {
          const targetPath = join(expandedBase, relativePath);
          await ensureDir(dirname(targetPath));
          await syncFile(storageFile.storagePath, targetPath, true);
          console.log(`  <- Base: ${targetPath}`);
          fromStorageCount++;
        }
      } else if (baseFile && storageFile) {
        const comparison = await compareFiles(baseFile.sourcePath, storageFile.storagePath);

        if (comparison.status === 'identical') {
          continue;
        } else if (comparison.status === 'file1-newer') {
          await copyToStorage(baseFile.sourcePath, config.storagePath, config.systemName);
          console.log(`  -> Storage (newer): ${baseFile.sourcePath}`);
          toStorageCount++;
        } else if (comparison.status === 'file2-newer') {
          await syncFile(storageFile.storagePath, baseFile.sourcePath, true);
          console.log(`  <- Base (newer): ${baseFile.sourcePath}`);
          fromStorageCount++;
        }
      }
    }
  }

  for (const completeDir of config.completeDirectories || []) {
    console.log(`\nSyncing complete directory: ${completeDir}`);
    const expandedComplete = expandPath(completeDir);
    const completeFiles = await scanCompleteDirectory(completeDir);
    const storageFiles = await scanStorageDirectory(config.storagePath, config.systemName, completeDir, true);

    const completeFileMap = new Map(completeFiles.map(f => [f.relativePath, f]));
    const storageFileMap = new Map(storageFiles.map(f => [f.relativePath, f]));

    const allPaths = new Set([...completeFileMap.keys(), ...storageFileMap.keys()]);

    for (const relativePath of allPaths) {
      const completeFile = completeFileMap.get(relativePath);
      const storageFile = storageFileMap.get(relativePath);

      if (completeFile && !storageFile) {
        const targetPath = await copyToStorage(completeFile.sourcePath, config.storagePath, config.systemName);
        console.log(`  -> Storage: ${completeFile.sourcePath}`);
        toStorageCount++;
      } else if (!completeFile && storageFile) {
        const targetPath = join(expandedComplete, relativePath);
        await ensureDir(dirname(targetPath));
        await syncFile(storageFile.storagePath, targetPath, true);
        console.log(`  <- Complete: ${targetPath}`);
        fromStorageCount++;
      } else if (completeFile && storageFile) {
        const comparison = await compareFiles(completeFile.sourcePath, storageFile.storagePath);

        if (comparison.status === 'identical') {
          continue;
        } else if (comparison.status === 'file1-newer') {
          await copyToStorage(completeFile.sourcePath, config.storagePath, config.systemName);
          console.log(`  -> Storage (newer): ${completeFile.sourcePath}`);
          toStorageCount++;
        } else if (comparison.status === 'file2-newer') {
          await syncFile(storageFile.storagePath, completeFile.sourcePath, true);
          console.log(`  <- Complete (newer): ${completeFile.sourcePath}`);
          fromStorageCount++;
        }
      }
    }
  }

  console.log(`\nGraft complete. ${toStorageCount} file(s) copied to storage, ${fromStorageCount} file(s) copied from storage.`);
}

export async function diff(args) {
  const config = await loadConfig();
  if (!config) {
    throw new Error('Not configured. Run "xlii configure <systemName> <baseDir>" first.');
  }

  const storageConfig = await loadStorageConfig(config.storagePath);
  const memoryFiles = storageConfig.memoryFiles;

  let differences = [];

  for (const baseDir of config.baseDirectories) {
    const expandedBase = expandPath(baseDir);
    const baseFiles = await scanBaseDirectory(baseDir, memoryFiles);
    const storageFiles = await scanStorageDirectory(config.storagePath, config.systemName, baseDir);

    const baseFileMap = new Map(baseFiles.map(f => [f.relativePath, f]));
    const storageFileMap = new Map(storageFiles.map(f => [f.relativePath, f]));

    const allPaths = new Set([...baseFileMap.keys(), ...storageFileMap.keys()]);

    for (const relativePath of allPaths) {
      const baseFile = baseFileMap.get(relativePath);
      const storageFile = storageFileMap.get(relativePath);

      if (baseFile && !storageFile) {
        differences.push({
          type: 'only-base',
          path: baseFile.sourcePath,
          relativePath,
          baseDir
        });
      } else if (!baseFile && storageFile && memoryFiles.includes(storageFile.filename)) {
        differences.push({
          type: 'only-storage',
          path: storageFile.storagePath,
          relativePath,
          baseDir
        });
      } else if (baseFile && storageFile) {
        const comparison = await compareFiles(baseFile.sourcePath, storageFile.storagePath);

        if (comparison.status !== 'identical') {
          differences.push({
            type: comparison.status,
            basePath: baseFile.sourcePath,
            storagePath: storageFile.storagePath,
            relativePath,
            baseDir,
            baseMtime: comparison.mtime1,
            storageMtime: comparison.mtime2
          });
        }
      }
    }
  }

  for (const completeDir of config.completeDirectories || []) {
    const expandedComplete = expandPath(completeDir);
    const completeFiles = await scanCompleteDirectory(completeDir);
    const storageFiles = await scanStorageDirectory(config.storagePath, config.systemName, completeDir, true);

    const completeFileMap = new Map(completeFiles.map(f => [f.relativePath, f]));
    const storageFileMap = new Map(storageFiles.map(f => [f.relativePath, f]));

    const allPaths = new Set([...completeFileMap.keys(), ...storageFileMap.keys()]);

    for (const relativePath of allPaths) {
      const completeFile = completeFileMap.get(relativePath);
      const storageFile = storageFileMap.get(relativePath);

      if (completeFile && !storageFile) {
        differences.push({
          type: 'only-base',
          path: completeFile.sourcePath,
          relativePath,
          baseDir: completeDir,
          isComplete: true
        });
      } else if (!completeFile && storageFile) {
        differences.push({
          type: 'only-storage',
          path: storageFile.storagePath,
          relativePath,
          baseDir: completeDir,
          isComplete: true
        });
      } else if (completeFile && storageFile) {
        const comparison = await compareFiles(completeFile.sourcePath, storageFile.storagePath);

        if (comparison.status !== 'identical') {
          differences.push({
            type: comparison.status,
            basePath: completeFile.sourcePath,
            storagePath: storageFile.storagePath,
            relativePath,
            baseDir: completeDir,
            baseMtime: comparison.mtime1,
            storageMtime: comparison.mtime2,
            isComplete: true
          });
        }
      }
    }
  }

  if (differences.length === 0) {
    console.log('No differences found. All memory files are in sync.');
    return;
  }

  console.log(`Found ${differences.length} difference(s):\n`);

  for (const diff of differences) {
    const dirType = diff.isComplete ? '[complete]' : '[base]';

    switch (diff.type) {
      case 'only-base':
        console.log(`  + Only in base ${dirType}: ${diff.path}`);
        break;
      case 'only-storage':
        console.log(`  - Only in storage ${dirType}: ${diff.path}`);
        break;
      case 'file1-newer':
        console.log(`  > Base is newer ${dirType}: ${diff.relativePath}`);
        console.log(`    Base: ${diff.baseMtime?.toISOString()}`);
        console.log(`    Storage: ${diff.storageMtime?.toISOString()}`);
        break;
      case 'file2-newer':
        console.log(`  < Storage is newer ${dirType}: ${diff.relativePath}`);
        console.log(`    Base: ${diff.baseMtime?.toISOString()}`);
        console.log(`    Storage: ${diff.storageMtime?.toISOString()}`);
        break;
      case 'same-time-different-content':
        console.log(`  ! Content differs (same time) ${dirType}: ${diff.relativePath}`);
        break;
    }
  }
}

export async function addBaseDir(args) {
  if (args.length < 1) {
    console.error('Usage: xlii addBaseDir <directory>');
    process.exit(1);
  }

  const config = await loadConfig();
  if (!config) {
    throw new Error('Not configured. Run "xlii configure <systemName> <baseDir>" first.');
  }

  const [newDir] = args;
  const expandedDir = expandPath(newDir);

  if (!existsSync(expandedDir)) {
    throw new Error(`Directory does not exist: ${expandedDir}`);
  }

  if (config.baseDirectories.includes(newDir)) {
    console.log(`Directory already in base directories: ${newDir}`);
    return;
  }

  config.baseDirectories.push(newDir);
  await saveConfig(config);

  console.log(`Added base directory: ${newDir}`);
  console.log(`Run 'xlii harvest' to copy memory files to storage.`);
}

export async function addCompleteDir(args) {
  if (args.length < 1) {
    console.error('Usage: xlii addCompleteDir <directory>');
    process.exit(1);
  }

  const config = await loadConfig();
  if (!config) {
    throw new Error('Not configured. Run "xlii configure <systemName> <baseDir>" first.');
  }

  const [newDir] = args;
  const expandedDir = expandPath(newDir);

  if (!existsSync(expandedDir)) {
    throw new Error(`Directory does not exist: ${expandedDir}`);
  }

  if (!config.completeDirectories) {
    config.completeDirectories = [];
  }

  if (config.completeDirectories.includes(newDir)) {
    console.log(`Directory already in complete directories: ${newDir}`);
    return;
  }

  config.completeDirectories.push(newDir);
  await saveConfig(config);

  console.log(`Added complete directory: ${newDir}`);
  console.log(`Run 'xlii harvest' to copy all files to storage.`);
}

export async function addMemoryFile(args) {
  if (args.length < 1) {
    console.error('Usage: xlii addMemoryFile <filename>');
    process.exit(1);
  }

  const config = await loadConfig();
  if (!config) {
    throw new Error('Not configured. Run "xlii configure <systemName> <baseDir>" first.');
  }

  const [newFile] = args;
  const storageConfig = await loadStorageConfig(config.storagePath);

  if (storageConfig.memoryFiles.includes(newFile)) {
    console.log(`File already tracked: ${newFile}`);
    return;
  }

  storageConfig.memoryFiles.push(newFile);
  await saveStorageConfig(config.storagePath, storageConfig);

  console.log(`Added memory file: ${newFile}`);
  console.log(`Run 'xlii harvest' to copy memory files to storage.`);
}

export async function status(args) {
  const config = await loadConfig();

  console.log('=== xlii Status ===\n');

  // Configuration status
  console.log('Configuration:');
  if (!config) {
    console.log('  Not configured. Run "xlii configure <device-name> <directory>" first.');
    return;
  }

  console.log(`  Config file:     ${getConfigFile()}`);
  console.log(`  Device name:     ${config.systemName}`);
  console.log(`  Storage path:    ${config.storagePath}`);

  // Base directories
  console.log('\nBase Directories:');
  if (config.baseDirectories?.length > 0) {
    for (const dir of config.baseDirectories) {
      const expanded = expandPath(dir);
      const exists = existsSync(expanded);
      const status = exists ? '' : ' (NOT FOUND)';
      console.log(`  - ${dir}${status}`);
    }
  } else {
    console.log('  (none)');
  }

  // Complete directories
  console.log('\nComplete Directories:');
  if (config.completeDirectories?.length > 0) {
    for (const dir of config.completeDirectories) {
      const expanded = expandPath(dir);
      const exists = existsSync(expanded);
      const status = exists ? '' : ' (NOT FOUND)';
      console.log(`  - ${dir}${status}`);
    }
  } else {
    console.log('  (none)');
  }

  // Storage configuration
  const storageConfig = await loadStorageConfig(config.storagePath);
  console.log('\nMemory Files (tracked patterns):');
  if (storageConfig.memoryFiles?.length > 0) {
    for (const file of storageConfig.memoryFiles) {
      console.log(`  - ${file}`);
    }
  } else {
    console.log('  (none)');
  }

  // Storage mirror status
  const expandedStorage = expandPath(config.storagePath);
  const systemStoragePath = join(expandedStorage, config.systemName);

  console.log('\nStorage Mirror:');
  if (!existsSync(expandedStorage)) {
    console.log(`  Storage path does not exist: ${expandedStorage}`);
    console.log('  Run "xlii harvest" to create it.');
    return;
  }

  if (!existsSync(systemStoragePath)) {
    console.log(`  No files synced yet for device "${config.systemName}".`);
    console.log('  Run "xlii harvest" to sync memory files.');
    return;
  }

  // Count files in storage
  let totalFiles = 0;
  let totalSize = 0;

  async function countFiles(dir) {
    try {
      const { readdir, stat } = await import('node:fs/promises');
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await countFiles(fullPath);
        } else if (entry.isFile()) {
          totalFiles++;
          const stats = await stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch (err) {
      // Ignore errors
    }
  }

  await countFiles(systemStoragePath);

  const sizeStr = totalSize < 1024
    ? `${totalSize} bytes`
    : totalSize < 1024 * 1024
      ? `${(totalSize / 1024).toFixed(1)} KB`
      : `${(totalSize / (1024 * 1024)).toFixed(1)} MB`;

  console.log(`  Files in storage: ${totalFiles}`);
  console.log(`  Total size:       ${sizeStr}`);
  console.log(`  Storage location: ${systemStoragePath}`);
}

export async function openconfig(args) {
  const configFile = getConfigFile();

  if (!existsSync(configFile)) {
    console.error('Config file does not exist. Run "xlii configure <device-name> <directory>" first.');
    process.exit(1);
  }

  const { exec } = await import('node:child_process');
  const { platform } = await import('node:os');

  const openCommand = platform() === 'win32'
    ? `start "" "${configFile}"`
    : platform() === 'darwin'
      ? `open "${configFile}"`
      : `xdg-open "${configFile}"`;

  exec(openCommand, (err) => {
    if (err) {
      console.error(`Failed to open config file: ${err.message}`);
      process.exit(1);
    }
  });

  console.log(`Opening: ${configFile}`);
}

export async function watch(args) {
  const config = await loadConfig();
  if (!config) {
    throw new Error('Not configured. Run "xlii configure <systemName> <baseDir>" first.');
  }

  const storageConfig = await loadStorageConfig(config.storagePath);
  const memoryFiles = storageConfig.memoryFiles;

  const debounceMs = 500;
  const pendingSyncs = new Map();

  async function syncToStorage(filePath) {
    try {
      if (!existsSync(filePath)) {
        return;
      }

      const targetPath = getStoragePath(config.storagePath, config.systemName, filePath);

      if (existsSync(targetPath)) {
        const comparison = await compareFiles(filePath, targetPath);
        if (comparison.status === 'identical' || comparison.status === 'file2-newer') {
          return;
        }
      }

      await copyToStorage(filePath, config.storagePath, config.systemName);
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] Synced: ${filePath}`);
    } catch (err) {
      console.error(`[Error] Failed to sync ${filePath}: ${err.message}`);
    }
  }

  function scheduleSync(filePath) {
    if (pendingSyncs.has(filePath)) {
      clearTimeout(pendingSyncs.get(filePath));
    }

    pendingSyncs.set(filePath, setTimeout(async () => {
      pendingSyncs.delete(filePath);
      await syncToStorage(filePath);
    }, debounceMs));
  }

  const watchers = [];

  for (const baseDir of config.baseDirectories) {
    const expanded = expandPath(baseDir);

    const watcher = chokidar.watch(expanded, {
      persistent: true,
      ignoreInitial: true,
      ignored: (filePath, stats) => {
        const name = basename(filePath);
        if (name === '.git') return true;
        if (stats?.isDirectory() && existsSync(join(filePath, '.git'))) return true;
        if (stats?.isFile() && !memoryFiles.includes(name)) return true;
        return false;
      }
    });

    watcher.on('change', scheduleSync);
    watcher.on('add', scheduleSync);
    watchers.push(watcher);

    console.log(`Watching base directory: ${baseDir}`);
  }

  for (const completeDir of config.completeDirectories || []) {
    const expanded = expandPath(completeDir);

    const watcher = chokidar.watch(expanded, {
      persistent: true,
      ignoreInitial: true,
      ignored: (filePath) => basename(filePath) === '.git'
    });

    watcher.on('change', scheduleSync);
    watcher.on('add', scheduleSync);
    watchers.push(watcher);

    console.log(`Watching complete directory: ${completeDir}`);
  }

  console.log(`\nWatching for changes (debounce: ${debounceMs}ms). Press Ctrl+C to stop.\n`);

  process.on('SIGINT', () => {
    console.log('\nStopping watchers...');
    for (const watcher of watchers) {
      watcher.close();
    }
    process.exit(0);
  });

  await new Promise(() => {});
}
