import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isGitRepo,
  scanBaseDirectory,
  scanCompleteDirectory
} from '../src/scanner.js';

describe('scanner module', () => {
  const testDir = join(tmpdir(), 'fortytwo-test-scanner-' + Date.now());

  before(async () => {
    await mkdir(testDir, { recursive: true });

    // Create test structure:
    // testDir/
    //   project1/
    //     CLAUDE.md
    //     src/
    //       code.js
    //   project2/
    //     .git/
    //     CLAUDE.md  (should be ignored - inside git repo)
    //   AGENTS.md
    //   complete/
    //     file1.txt
    //     subdir/
    //       file2.txt

    await mkdir(join(testDir, 'project1', 'src'), { recursive: true });
    await writeFile(join(testDir, 'project1', 'CLAUDE.md'), '# Project 1');
    await writeFile(join(testDir, 'project1', 'src', 'code.js'), 'console.log("hello")');

    await mkdir(join(testDir, 'project2', '.git'), { recursive: true });
    await writeFile(join(testDir, 'project2', 'CLAUDE.md'), '# Project 2 (in git)');

    await writeFile(join(testDir, 'AGENTS.md'), '# Agents');

    await mkdir(join(testDir, 'complete', 'subdir'), { recursive: true });
    await writeFile(join(testDir, 'complete', 'file1.txt'), 'file 1 content');
    await writeFile(join(testDir, 'complete', 'subdir', 'file2.txt'), 'file 2 content');
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('isGitRepo', () => {
    it('should return true for directory with .git folder', () => {
      const result = isGitRepo(join(testDir, 'project2'));
      assert.strictEqual(result, true);
    });

    it('should return false for directory without .git folder', () => {
      const result = isGitRepo(join(testDir, 'project1'));
      assert.strictEqual(result, false);
    });

    it('should return false for non-existent directory', () => {
      const result = isGitRepo(join(testDir, 'nonexistent'));
      assert.strictEqual(result, false);
    });
  });

  describe('scanBaseDirectory', () => {
    it('should find memory files in directory', async () => {
      const memoryFiles = ['CLAUDE.md', 'AGENTS.md'];
      const results = await scanBaseDirectory(testDir, memoryFiles);

      const filenames = results.map(r => r.filename);
      assert.ok(filenames.includes('CLAUDE.md'));
      assert.ok(filenames.includes('AGENTS.md'));
    });

    it('should stop at git repositories', async () => {
      const memoryFiles = ['CLAUDE.md'];
      const results = await scanBaseDirectory(testDir, memoryFiles);

      // Should find CLAUDE.md in project1, but NOT in project2 (git repo)
      const paths = results.map(r => r.sourcePath);
      const hasProject1 = paths.some(p => p.includes('project1'));
      const hasProject2 = paths.some(p => p.includes('project2'));

      assert.ok(hasProject1, 'Should find CLAUDE.md in project1');
      assert.ok(!hasProject2, 'Should NOT find CLAUDE.md in project2 (git repo)');
    });

    it('should only find specified memory files', async () => {
      const memoryFiles = ['AGENTS.md'];
      const results = await scanBaseDirectory(testDir, memoryFiles);

      const filenames = results.map(r => r.filename);
      assert.ok(filenames.includes('AGENTS.md'));
      assert.ok(!filenames.includes('CLAUDE.md'));
    });

    it('should include mtime in results', async () => {
      const memoryFiles = ['AGENTS.md'];
      const results = await scanBaseDirectory(testDir, memoryFiles);

      assert.ok(results.length > 0);
      assert.ok(results[0].mtime instanceof Date);
    });
  });

  describe('scanCompleteDirectory', () => {
    it('should find all files in directory', async () => {
      const results = await scanCompleteDirectory(join(testDir, 'complete'));

      const filenames = results.map(r => r.filename);
      assert.ok(filenames.includes('file1.txt'));
      assert.ok(filenames.includes('file2.txt'));
    });

    it('should recurse into subdirectories', async () => {
      const results = await scanCompleteDirectory(join(testDir, 'complete'));

      const hasSubdir = results.some(r => r.relativePath.includes('subdir'));
      assert.ok(hasSubdir, 'Should find files in subdirectories');
    });

    it('should include relative paths', async () => {
      const results = await scanCompleteDirectory(join(testDir, 'complete'));

      const file2 = results.find(r => r.filename === 'file2.txt');
      assert.ok(file2);
      assert.ok(file2.relativePath.includes('subdir'));
    });
  });
});
