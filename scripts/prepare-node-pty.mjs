/* global console, process, URL */
import { chmodSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const requireFromProject = createRequire(new URL('../package.json', import.meta.url));

function isWithin(root, candidate) {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith('..') && !path.startsWith('/'));
}

function prepareHelper() {
  let packageJson;
  try {
    packageJson = requireFromProject.resolve('node-pty/package.json');
  } catch {
    console.log('node-pty is not installed; skipping PTY helper preparation');
    return;
  }

  const packageRoot = dirname(packageJson);
  const packageStat = lstatSync(packageRoot);
  if (packageStat.isSymbolicLink()) throw new Error('node-pty package directory must not be a symlink');
  const realRoot = realpathSync(packageRoot);
  const helper = resolve(realRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper');
  if (!isWithin(realRoot, helper)) throw new Error('node-pty helper escaped its package directory');

  let helperStat;
  try {
    helperStat = lstatSync(helper);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.log(`node-pty has no spawn-helper for ${process.platform}-${process.arch}; skipping`);
      return;
    }
    throw error;
  }
  if (helperStat.isSymbolicLink()) throw new Error('node-pty spawn-helper must not be a symlink');
  if (!helperStat.isFile()) throw new Error('node-pty spawn-helper must be a regular file');
  const realHelper = realpathSync(helper);
  if (!isWithin(realRoot, realHelper) || realHelper !== helper) {
    throw new Error('node-pty spawn-helper path escaped its package directory');
  }

  const mode = helperStat.mode | 0o111;
  if ((helperStat.mode & 0o111) !== 0o111) chmodSync(helper, mode);
  console.log(`node-pty spawn-helper is executable: ${helper}`);
}

prepareHelper();
