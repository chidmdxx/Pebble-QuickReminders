'use strict';

const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('two-state watch lifecycle, native cancellation, timers, correlation and review execute against the SDK stub', () => {
  const directory = fs.mkdtempSync(path.join(__dirname, '.watch-'));
  const executable = path.join(directory, process.platform === 'win32' ? 'watch.exe' : 'watch');
  try {
    execFileSync(process.env.CC || 'cc', [
      '-std=c11', '-Wall', '-Werror', '-Wno-unused-function', '-Wno-unused-parameter',
      '-I', path.join(__dirname, 'watch-stub'), path.join(__dirname, 'watch.c'),
      '-o', executable
    ], { stdio: 'pipe' });
    execFileSync(executable, { stdio: 'pipe' });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
