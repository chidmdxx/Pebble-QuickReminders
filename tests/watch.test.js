'use strict';

const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const platforms = [
  { name: 'basalt', width: 144, height: 168, actionBar: 30, color: true },
  { name: 'chalk', width: 180, height: 180, actionBar: 40, color: true, round: true },
  { name: 'diorite', width: 144, height: 168, actionBar: 30 },
  { name: 'emery', width: 200, height: 228, actionBar: 34, color: true },
  { name: 'flint', width: 144, height: 168, actionBar: 30 },
  { name: 'gabbro', width: 260, height: 260, actionBar: 40, color: true, round: true }
];

for (const platform of platforms) test(`${platform.name}: watch lifecycle, cancellation, timers, correlation and review`, () => {
  const directory = fs.mkdtempSync(path.join(__dirname, '.watch-'));
  const executable = path.join(directory, process.platform === 'win32' ? 'watch.exe' : 'watch');
  try {
    execFileSync(process.env.CC || 'cc', [
      '-std=c11', '-Wall', '-Werror', '-Wno-unused-function', '-Wno-unused-parameter',
      `-DPBL_DISPLAY_WIDTH=${platform.width}`, `-DPBL_DISPLAY_HEIGHT=${platform.height}`,
      `-DACTION_BAR_WIDTH=${platform.actionBar}`,
      ...(platform.color ? ['-DPBL_COLOR'] : ['-DPBL_BW']),
      ...(platform.round ? ['-DPBL_ROUND'] : ['-DPBL_RECT']),
      '-I', path.join(__dirname, 'watch-stub'), path.join(__dirname, 'watch.c'),
      '-o', executable
    ], { stdio: 'pipe' });
    execFileSync(executable, { stdio: 'pipe' });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
