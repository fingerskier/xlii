import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, writeFile, readFile, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { getStoragePath } from '../src/sync.js';

describe('singleFiles config integration', () => {
  const testDir = join(tmpdir(), 'xlii-test-single-' + Date.now());
  const baseDir = join(testDir, 'base');
  const storageDir = join(testDir, 'storage');
  const configDir = join(testDir, 'config');
  const binPath = join(process.cwd(), 'bin', 'xlii.js');
  const settingsFile = join(testDir, 'settings.json');

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
      return (error.stdout || '') + (error.stderr || '') + (error.message || '');
    }
  }

  before(async () => {
    await mkdir(testDir, { recursive: true });
    await mkdir(baseDir, { recursive: true });
    await mkdir(storageDir, { recursive: true });
    await mkdir(configDir, { recursive: true });

    await writeFile(settingsFile, '{"theme":"dark"}');
    await writeFile(join(baseDir, 'CLAUDE.md'), '# Root');

    runCli(`configure testPC "${baseDir}" "${storageDir}"`);
  });

  after(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('addSingleFile should add the file to config', async () => {
    const output = runCli(`addSingleFile "${settingsFile}"`);
    assert.ok(output.includes('Added single file'), output);

    const config = JSON.parse(
      await readFile(join(configDir, 'config.json'), 'utf-8')
    );
    assert.ok(Array.isArray(config.singleFiles));
    assert.ok(config.singleFiles.includes(settingsFile));
  });

  it('addSingleFile should fail when path is a directory', () => {
    const dirPath = join(testDir, 'not-a-file');
    execSync(`mkdir -p "${dirPath}"`);
    const output = runCli(`addSingleFile "${dirPath}"`);
    assert.ok(output.includes('not a regular file'), output);
  });

  it('addSingleFile should fail for a non-existent file', () => {
    const output = runCli(`addSingleFile "${join(testDir, 'missing.json')}"`);
    assert.ok(output.includes('does not exist'), output);
  });

  it('addSingleFile should not duplicate entries', () => {
    const output = runCli(`addSingleFile "${settingsFile}"`);
    assert.ok(output.includes('already tracked'), output);
  });

  it('harvest should copy the single file to storage', async () => {
    const output = runCli('harvest');
    assert.ok(output.includes('single file') || output.includes('Copied'), output);

    const expectedStorage = getStoragePath(storageDir, 'testPC', settingsFile);
    assert.ok(existsSync(expectedStorage), `expected storage file at ${expectedStorage}`);

    const content = await readFile(expectedStorage, 'utf-8');
    assert.strictEqual(content, '{"theme":"dark"}');
  });

  it('diff should be clean after harvest', () => {
    const output = runCli('diff');
    assert.ok(output.includes('No differences') || output.includes('in sync'), output);
  });

  it('diff should report single-file change', async () => {
    await writeFile(settingsFile, '{"theme":"light"}');
    await utimes(settingsFile, new Date(), new Date());

    const output = runCli('diff');
    assert.ok(output.includes('[single]'), output);
  });

  it('sow should restore the single file from storage', async () => {
    // Storage still has old content; overwrite source and sow to restore
    await writeFile(settingsFile, '{"theme":"other"}');

    const output = runCli('sow');
    assert.ok(output.includes('single file') || output.includes('Copied'), output);

    const restored = await readFile(settingsFile, 'utf-8');
    assert.strictEqual(restored, '{"theme":"dark"}');
  });

  it('graft should copy newer source to storage', async () => {
    await writeFile(settingsFile, '{"theme":"graft"}');
    // Ensure source mtime is newer than storage
    await utimes(settingsFile, new Date(), new Date(Date.now() + 60_000));

    const output = runCli('graft');
    assert.ok(output.includes('single file') || output.includes('Storage'), output);

    const expectedStorage = getStoragePath(storageDir, 'testPC', settingsFile);
    const storageContent = await readFile(expectedStorage, 'utf-8');
    assert.strictEqual(storageContent, '{"theme":"graft"}');
  });

  it('status should list single files', () => {
    const output = runCli('status');
    assert.ok(output.includes('Single Files'), output);
    assert.ok(output.includes(settingsFile), output);
  });
});
