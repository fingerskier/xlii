import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expandPath } from './config.js';

export function isGitRepo(dirPath) {
  return existsSync(join(dirPath, '.git'));
}

export async function scanBaseDirectory(baseDir, memoryFiles) {
  const expanded = expandPath(baseDir);
  const results = [];

  async function scan(currentDir, isRoot = false) {
    // Always scan the explicitly-configured base directory root, even if it
    // is itself a git repo.  Only enforce the git-repo boundary for
    // subdirectories discovered during recursion.
    if (!isRoot && isGitRepo(currentDir)) {
      return;
    }

    try {
      const entries = await readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory() && entry.name !== '.git') {
          await scan(fullPath);
        } else if (entry.isFile() && memoryFiles.includes(entry.name)) {
          const stats = await stat(fullPath);
          results.push({
            sourcePath: fullPath,
            relativePath: fullPath.slice(expanded.length),
            filename: entry.name,
            mtime: stats.mtime
          });
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
        throw err;
      }
    }
  }

  await scan(expanded, true);
  return results;
}

export async function scanCompleteDirectory(completeDir) {
  const expanded = expandPath(completeDir);
  const results = [];

  async function scan(currentDir) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory() && entry.name !== '.git') {
          await scan(fullPath);
        } else if (entry.isFile()) {
          const stats = await stat(fullPath);
          results.push({
            sourcePath: fullPath,
            relativePath: fullPath.slice(expanded.length),
            filename: entry.name,
            mtime: stats.mtime
          });
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
        throw err;
      }
    }
  }

  await scan(expanded);
  return results;
}

export async function scanStorageDirectory(storageDir, systemName, sourceDir, isComplete = false) {
  const expandedStorage = expandPath(storageDir);
  const expandedSource = expandPath(sourceDir);
  const storagePath = join(expandedStorage, systemName, expandedSource);
  const results = [];

  async function scan(currentDir) {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          const stats = await stat(fullPath);
          results.push({
            storagePath: fullPath,
            relativePath: fullPath.slice(storagePath.length),
            filename: entry.name,
            mtime: stats.mtime
          });
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
        throw err;
      }
    }
  }

  if (existsSync(storagePath)) {
    await scan(storagePath);
  }

  return results;
}
