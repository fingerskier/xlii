import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

function toStorablePathSegment(absolutePath) {
  let p = absolutePath;
  if (/^[A-Za-z]:/.test(p)) {
    p = p.slice(2);
  }
  p = p.replace(/^[/\\]+/, '');
  return p;
}

describe('watch module', () => {
  const testDir = join(tmpdir(), 'xlii-test-watch-' + Date.now());
  const baseDir = join(testDir, 'base');
  const storageDir = join(testDir, 'storage');
  const configDir = join(testDir, 'config');
  const binPath = join(process.cwd(), 'bin', 'xlii.js');

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function spawnWatch(env = {}) {
    const fullEnv = {
      ...process.env,
      XLII_CONFIG_DIR: configDir,
      ...env
    };

    const proc = spawn('node', [binPath, 'watch'], {
      cwd: testDir,
      env: fullEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return proc;
  }

  function killProcess(proc) {
    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      proc.on('close', done);
      proc.on('exit', done);

      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t'], { shell: true });
      } else {
        proc.kill('SIGTERM');
      }

      // Give extra time for Windows to release file handles
      setTimeout(done, 1000);
    });
  }

  before(async () => {
    await mkdir(testDir, { recursive: true });
    await mkdir(baseDir, { recursive: true });
    await mkdir(join(baseDir, 'project1'), { recursive: true });
    await mkdir(join(baseDir, 'project2', '.git'), { recursive: true });
    await mkdir(storageDir, { recursive: true });
    await mkdir(configDir, { recursive: true });

    await writeFile(join(baseDir, 'CLAUDE.md'), '# Root Claude');
    await writeFile(join(baseDir, 'project1', 'CLAUDE.md'), '# Project 1 Claude');
    await writeFile(join(baseDir, 'project2', 'CLAUDE.md'), '# Project 2 (git repo)');

    const config = {
      systemName: 'testSystem',
      baseDirectories: [baseDir],
      completeDirectories: [],
      storagePath: storageDir
    };
    await writeFile(join(configDir, 'config.json'), JSON.stringify(config, null, 2));

    const storageConfig = {
      memoryFiles: ['CLAUDE.md', 'AGENTS.md', 'TODO.md', 'SPEC.md']
    };
    await writeFile(join(storageDir, 'configuration.json'), JSON.stringify(storageConfig, null, 2));
  });

  after(async () => {
    // Wait for any file handles to be released on Windows
    await sleep(500);
    try {
      await rm(testDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
    } catch (err) {
      // Ignore cleanup errors - temp dir will be cleaned up later
      console.log(`Cleanup warning: ${err.message}`);
    }
  });

  describe('watch command', () => {
    it('should sync file changes to storage after debounce', async () => {
      const watchProcess = spawnWatch();
      let output = '';
      let stderr = '';

      watchProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      watchProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Wait for watcher to initialize
      await sleep(1500);

      // Check if watcher is ready
      assert.ok(output.includes('Watching'), `Watcher should be ready. Output: ${output}, Stderr: ${stderr}`);

      const testFile = join(baseDir, 'CLAUDE.md');
      const newContent = '# Updated Root Claude - ' + Date.now();
      await writeFile(testFile, newContent);

      // Wait for debounce (500ms) + sync time
      await sleep(2000);

      await killProcess(watchProcess);

      const storageFile = join(storageDir, 'testSystem', toStorablePathSegment(baseDir), 'CLAUDE.md');

      assert.ok(existsSync(storageFile), `Storage file should exist at ${storageFile}. Output: ${output}, Stderr: ${stderr}`);
      const storedContent = await readFile(storageFile, 'utf-8');
      assert.strictEqual(storedContent, newContent, 'Storage should have updated content');
    });

    it('should debounce rapid changes', async () => {
      const watchProcess = spawnWatch();
      let syncCount = 0;

      watchProcess.stdout.on('data', (data) => {
        const text = data.toString();
        const matches = text.match(/Synced:/g);
        if (matches) {
          syncCount += matches.length;
        }
      });

      await sleep(1000);

      const testFile = join(baseDir, 'project1', 'CLAUDE.md');

      // Rapid changes within debounce window
      await writeFile(testFile, 'change 1');
      await sleep(100);
      await writeFile(testFile, 'change 2');
      await sleep(100);
      await writeFile(testFile, 'change 3');
      await sleep(100);
      await writeFile(testFile, 'final change - ' + Date.now());

      // Wait for debounce + sync
      await sleep(1500);

      await killProcess(watchProcess);

      assert.strictEqual(syncCount, 1, 'Should only sync once due to debouncing');
    });

    it('should not sync files inside git repos', async () => {
      const watchProcess = spawnWatch();
      let output = '';

      watchProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      await sleep(1000);

      const gitRepoFile = join(baseDir, 'project2', 'CLAUDE.md');
      await writeFile(gitRepoFile, '# Updated inside git repo - ' + Date.now());

      await sleep(1500);

      await killProcess(watchProcess);

      const storageFile = join(storageDir, 'testSystem', toStorablePathSegment(baseDir), 'project2', 'CLAUDE.md');
      assert.ok(!existsSync(storageFile), 'Should not sync files inside git repos');
    });

    it('should only sync memory files in base directories', async () => {
      const watchProcess = spawnWatch();
      let output = '';

      watchProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      await sleep(1000);

      const nonMemoryFile = join(baseDir, 'random.txt');
      await writeFile(nonMemoryFile, 'random content - ' + Date.now());

      await sleep(1500);

      await killProcess(watchProcess);

      const storageFile = join(storageDir, 'testSystem', toStorablePathSegment(baseDir), 'random.txt');
      assert.ok(!existsSync(storageFile), 'Should not sync non-memory files');
    });

    it('should sync new memory files added during watch', async () => {
      const watchProcess = spawnWatch();
      let output = '';

      watchProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      await sleep(1000);

      const newMemoryFile = join(baseDir, 'AGENTS.md');
      const newContent = '# New Agents File - ' + Date.now();
      await writeFile(newMemoryFile, newContent);

      await sleep(1500);

      await killProcess(watchProcess);

      const storageFile = join(storageDir, 'testSystem', toStorablePathSegment(baseDir), 'AGENTS.md');
      assert.ok(existsSync(storageFile), 'Should sync newly created memory files');
      const storedContent = await readFile(storageFile, 'utf-8');
      assert.strictEqual(storedContent, newContent);
    });
  });
});
