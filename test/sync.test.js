import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, writeFile, readFile, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getStoragePath,
  compareFiles,
  syncFile
} from '../src/sync.js';

describe('sync module', () => {
  const testDir = join(tmpdir(), 'fortytwo-test-sync-' + Date.now());
  const sourceDir = join(testDir, 'source');
  const targetDir = join(testDir, 'target');

  before(async () => {
    await mkdir(sourceDir, { recursive: true });
    await mkdir(targetDir, { recursive: true });
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('getStoragePath', () => {
    it('should construct correct storage path', () => {
      const result = getStoragePath('/storage', 'myPC', '/home/user/dev');

      assert.ok(result.includes('myPC'));
      assert.ok(result.includes('home'));
      assert.ok(result.includes('user'));
      assert.ok(result.includes('dev'));
    });

    it('should include system name in path', () => {
      const result1 = getStoragePath('/storage', 'pc1', '/dev');
      const result2 = getStoragePath('/storage', 'pc2', '/dev');

      assert.ok(result1.includes('pc1'));
      assert.ok(result2.includes('pc2'));
      assert.notStrictEqual(result1, result2);
    });
  });

  describe('compareFiles', () => {
    it('should detect identical files', async () => {
      const file1 = join(sourceDir, 'identical1.txt');
      const file2 = join(targetDir, 'identical2.txt');
      const content = 'same content';

      await writeFile(file1, content);
      await writeFile(file2, content);

      const result = await compareFiles(file1, file2);

      assert.strictEqual(result.status, 'identical');
      assert.strictEqual(result.file1Exists, true);
      assert.strictEqual(result.file2Exists, true);
    });

    it('should detect when only file1 exists', async () => {
      const file1 = join(sourceDir, 'only1.txt');
      const file2 = join(targetDir, 'nonexistent.txt');

      await writeFile(file1, 'content');

      const result = await compareFiles(file1, file2);

      assert.strictEqual(result.status, 'only-file1');
      assert.strictEqual(result.file1Exists, true);
      assert.strictEqual(result.file2Exists, false);
    });

    it('should detect when only file2 exists', async () => {
      const file1 = join(sourceDir, 'nonexistent2.txt');
      const file2 = join(targetDir, 'only2.txt');

      await writeFile(file2, 'content');

      const result = await compareFiles(file1, file2);

      assert.strictEqual(result.status, 'only-file2');
      assert.strictEqual(result.file1Exists, false);
      assert.strictEqual(result.file2Exists, true);
    });

    it('should detect when file1 is newer', async () => {
      const file1 = join(sourceDir, 'newer1.txt');
      const file2 = join(targetDir, 'older1.txt');

      await writeFile(file2, 'old content');
      const oldTime = new Date(Date.now() - 10000);
      await utimes(file2, oldTime, oldTime);

      await writeFile(file1, 'new content');

      const result = await compareFiles(file1, file2);

      assert.strictEqual(result.status, 'file1-newer');
    });

    it('should detect when file2 is newer', async () => {
      const file1 = join(sourceDir, 'older2.txt');
      const file2 = join(targetDir, 'newer2.txt');

      await writeFile(file1, 'old content');
      const oldTime = new Date(Date.now() - 10000);
      await utimes(file1, oldTime, oldTime);

      await writeFile(file2, 'new content');

      const result = await compareFiles(file1, file2);

      assert.strictEqual(result.status, 'file2-newer');
    });

    it('should detect neither file exists', async () => {
      const result = await compareFiles(
        join(sourceDir, 'ghost1.txt'),
        join(targetDir, 'ghost2.txt')
      );

      assert.strictEqual(result.status, 'none');
      assert.strictEqual(result.file1Exists, false);
      assert.strictEqual(result.file2Exists, false);
    });
  });

  describe('syncFile', () => {
    it('should copy file content', async () => {
      const source = join(sourceDir, 'sync-source.txt');
      const target = join(targetDir, 'sync-target.txt');
      const content = 'content to sync';

      await writeFile(source, content);

      await syncFile(source, target);

      const targetContent = await readFile(target, 'utf-8');
      assert.strictEqual(targetContent, content);
    });

    it('should create target directory if needed', async () => {
      const source = join(sourceDir, 'nested-source.txt');
      const target = join(targetDir, 'nested', 'deep', 'target.txt');

      await writeFile(source, 'nested content');

      await syncFile(source, target);

      assert.ok(existsSync(target));
    });

    it('should preserve timestamp when requested', async () => {
      const source = join(sourceDir, 'timestamp-source.txt');
      const target = join(targetDir, 'timestamp-target.txt');
      const oldTime = new Date(Date.now() - 100000);

      await writeFile(source, 'timestamped');
      await utimes(source, oldTime, oldTime);

      await syncFile(source, target, true);

      const { stat } = await import('node:fs/promises');
      const sourceStat = await stat(source);
      const targetStat = await stat(target);

      assert.strictEqual(
        sourceStat.mtime.getTime(),
        targetStat.mtime.getTime()
      );
    });
  });
});
