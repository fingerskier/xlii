import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, writeFile, readFile, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { execSync } from 'node:child_process';

describe('CLI commands integration', () => {
  const testDir = join(tmpdir(), 'xlii-test-cli-' + Date.now());
  const baseDir = join(testDir, 'base');
  const storageDir = join(testDir, 'storage');
  const configDir = join(testDir, 'config');
  const binPath = join(process.cwd(), 'bin', 'xlii.js');

  // Helper to run CLI commands
  function runCli(args, env = {}) {
    const fullEnv = {
      ...process.env,
      XLII_CONFIG_DIR: configDir,
      ...env
    };

    try {
      return execSync(`node "${binPath}" ${args}`, {
        cwd: testDir,
        env: fullEnv,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error) {
      return (error.stdout || '') + (error.stderr || '') + error.message;
    }
  }

  before(async () => {
    await mkdir(testDir, { recursive: true });
    await mkdir(baseDir, { recursive: true });
    await mkdir(storageDir, { recursive: true });
    await mkdir(configDir, { recursive: true });

    // Create test structure
    await mkdir(join(baseDir, 'project1'), { recursive: true });
    await mkdir(join(baseDir, 'project2', '.git'), { recursive: true });

    await writeFile(join(baseDir, 'CLAUDE.md'), '# Root Claude');
    await writeFile(join(baseDir, 'project1', 'CLAUDE.md'), '# Project 1 Claude');
    await writeFile(join(baseDir, 'project2', 'CLAUDE.md'), '# Project 2 (git)');
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('help command', () => {
    it('should display help text', () => {
      const output = runCli('--help');

      assert.ok(output.includes('xlii'));
      assert.ok(output.includes('configure'));
      assert.ok(output.includes('harvest'));
      assert.ok(output.includes('sow'));
      assert.ok(output.includes('graft'));
      assert.ok(output.includes('diff'));
    });
  });

  describe('unknown command', () => {
    it('should show error for unknown command', () => {
      const output = runCli('unknowncommand');

      assert.ok(output.includes('Unknown command'));
    });
  });
});

describe('Command argument validation', () => {
  const binPath = join(process.cwd(), 'bin', 'xlii.js');

  function runCli(args) {
    try {
      return execSync(`node "${binPath}" ${args}`, {
        encoding: 'utf-8'
      });
    } catch (error) {
      return error.stdout + error.stderr || error.message;
    }
  }

  it('configure should require arguments', () => {
    const output = runCli('configure');
    assert.ok(output.includes('Usage') || output.includes('configure'));
  });

  it('addBaseDir should require argument', () => {
    const output = runCli('addBaseDir');
    assert.ok(output.includes('Usage') || output.includes('addBaseDir') || output.includes('Not configured'));
  });

  it('addCompleteDir should require argument', () => {
    const output = runCli('addCompleteDir');
    assert.ok(output.includes('Usage') || output.includes('addCompleteDir') || output.includes('Not configured'));
  });

  it('addMemoryFile should require argument', () => {
    const output = runCli('addMemoryFile');
    assert.ok(output.includes('Usage') || output.includes('addMemoryFile') || output.includes('Not configured'));
  });
});
