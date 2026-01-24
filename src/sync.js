import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { expandPath, ensureDir } from './config.js';

function toStorablePathSegment(absolutePath) {
  let p = absolutePath;
  // Remove Windows drive letter (e.g., "C:" or "D:")
  if (/^[A-Za-z]:/.test(p)) {
    p = p.slice(2);
  }
  // Remove leading slashes/backslashes
  p = p.replace(/^[/\\]+/, '');
  return p;
}

export function getStoragePath(storagePath, systemName, sourcePath) {
  const expandedStorage = expandPath(storagePath);
  const expandedSource = expandPath(sourcePath);
  const storableSegment = toStorablePathSegment(expandedSource);
  return join(expandedStorage, systemName, storableSegment);
}

export async function copyToStorage(sourceFile, storagePath, systemName) {
  const expandedSource = expandPath(sourceFile);
  const storableSegment = toStorablePathSegment(expandedSource);
  const targetPath = join(expandPath(storagePath), systemName, storableSegment);

  await ensureDir(dirname(targetPath));
  const content = await readFile(expandedSource);
  await writeFile(targetPath, content);

  return targetPath;
}

export async function copyFromStorage(storagePath, systemName, targetFile) {
  const expandedTarget = expandPath(targetFile);
  const storableSegment = toStorablePathSegment(expandedTarget);
  const sourcePath = join(expandPath(storagePath), systemName, storableSegment);

  if (!existsSync(sourcePath)) {
    return null;
  }

  await ensureDir(dirname(expandedTarget));
  const content = await readFile(sourcePath);
  await writeFile(expandedTarget, content);

  return expandedTarget;
}

export async function compareFiles(file1, file2) {
  try {
    const [stat1, stat2] = await Promise.all([
      stat(file1).catch(() => null),
      stat(file2).catch(() => null)
    ]);

    if (!stat1 && !stat2) {
      return { status: 'none', file1Exists: false, file2Exists: false };
    }
    if (!stat1) {
      return { status: 'only-file2', file1Exists: false, file2Exists: true, mtime2: stat2.mtime };
    }
    if (!stat2) {
      return { status: 'only-file1', file1Exists: true, file2Exists: false, mtime1: stat1.mtime };
    }

    const [content1, content2] = await Promise.all([
      readFile(file1, 'utf-8'),
      readFile(file2, 'utf-8')
    ]);

    if (content1 === content2) {
      return { status: 'identical', file1Exists: true, file2Exists: true, mtime1: stat1.mtime, mtime2: stat2.mtime };
    }

    const mtime1 = stat1.mtime.getTime();
    const mtime2 = stat2.mtime.getTime();

    if (mtime1 === mtime2) {
      return { status: 'same-time-different-content', file1Exists: true, file2Exists: true, mtime1: stat1.mtime, mtime2: stat2.mtime };
    }
    if (mtime1 > mtime2) {
      return { status: 'file1-newer', file1Exists: true, file2Exists: true, mtime1: stat1.mtime, mtime2: stat2.mtime };
    }
    return { status: 'file2-newer', file1Exists: true, file2Exists: true, mtime1: stat1.mtime, mtime2: stat2.mtime };
  } catch (err) {
    throw new Error(`Failed to compare files: ${err.message}`);
  }
}

export async function syncFile(sourcePath, targetPath, preserveTimestamp = true) {
  await ensureDir(dirname(targetPath));
  const content = await readFile(sourcePath);
  await writeFile(targetPath, content);

  if (preserveTimestamp) {
    const sourceStat = await stat(sourcePath);
    const { utimes } = await import('node:fs/promises');
    await utimes(targetPath, sourceStat.atime, sourceStat.mtime);
  }

  return targetPath;
}
