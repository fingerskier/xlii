import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

const CONFIG_DIR = process.env.FORTYTWO_CONFIG_DIR || join(homedir(), '.fortytwo');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const DEFAULT_MEMORY_FILES = ['CLAUDE.md', 'AGENTS.md', 'TODO.md', 'SPEC.md'];

export function expandPath(p) {
  if (p.startsWith('~')) {
    return join(homedir(), p.slice(1));
  }
  return p;
}

export function getConfigDir() {
  return CONFIG_DIR;
}

export function getConfigFile() {
  return CONFIG_FILE;
}

export async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }
  const content = await readFile(CONFIG_FILE, 'utf-8');
  return JSON.parse(content);
}

export async function saveConfig(config) {
  await ensureDir(CONFIG_DIR);
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function loadStorageConfig(storagePath) {
  const configFile = join(expandPath(storagePath), 'configuration.json');
  if (!existsSync(configFile)) {
    return { memoryFiles: DEFAULT_MEMORY_FILES };
  }
  const content = await readFile(configFile, 'utf-8');
  return JSON.parse(content);
}

export async function saveStorageConfig(storagePath, storageConfig) {
  const expandedPath = expandPath(storagePath);
  await ensureDir(expandedPath);
  const configFile = join(expandedPath, 'configuration.json');
  await writeFile(configFile, JSON.stringify(storageConfig, null, 2));
}

export function getDefaultMemoryFiles() {
  return [...DEFAULT_MEMORY_FILES];
}
