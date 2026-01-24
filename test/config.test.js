import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  expandPath,
  ensureDir,
  getDefaultMemoryFiles
} from '../src/config.js';

describe('config module', () => {
  const testDir = join(tmpdir(), 'fortytwo-test-config-' + Date.now());

  before(async () => {
    await mkdir(testDir, { recursive: true });
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('expandPath', () => {
    it('should expand ~ to home directory', () => {
      const result = expandPath('~/test');
      assert.ok(!result.startsWith('~'));
      assert.ok(result.includes('test'));
    });

    it('should return path unchanged if no ~', () => {
      const result = expandPath('/absolute/path');
      assert.strictEqual(result, '/absolute/path');
    });

    it('should handle Windows-style paths', () => {
      const result = expandPath('C:/Users/test');
      assert.strictEqual(result, 'C:/Users/test');
    });
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', async () => {
      const newDir = join(testDir, 'new-dir');
      assert.ok(!existsSync(newDir));

      await ensureDir(newDir);

      assert.ok(existsSync(newDir));
    });

    it('should not throw if directory already exists', async () => {
      const existingDir = join(testDir, 'existing-dir');
      await mkdir(existingDir, { recursive: true });

      await assert.doesNotReject(async () => {
        await ensureDir(existingDir);
      });
    });

    it('should create nested directories', async () => {
      const nestedDir = join(testDir, 'level1', 'level2', 'level3');

      await ensureDir(nestedDir);

      assert.ok(existsSync(nestedDir));
    });
  });

  describe('getDefaultMemoryFiles', () => {
    it('should return array of default memory files', () => {
      const files = getDefaultMemoryFiles();

      assert.ok(Array.isArray(files));
      assert.ok(files.includes('CLAUDE.md'));
      assert.ok(files.includes('AGENTS.md'));
      assert.ok(files.includes('TODO.md'));
      assert.ok(files.includes('SPEC.md'));
    });

    it('should return a new array each time', () => {
      const files1 = getDefaultMemoryFiles();
      const files2 = getDefaultMemoryFiles();

      assert.notStrictEqual(files1, files2);
      assert.deepStrictEqual(files1, files2);
    });
  });
});
