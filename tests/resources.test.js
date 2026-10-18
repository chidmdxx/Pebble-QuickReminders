'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the PBW targets every microphone-capable platform, but not aplite', () => {
  const app = require('../app/package.json');
  assert.deepEqual(app.pebble.targetPlatforms,
    ['basalt', 'chalk', 'diorite', 'emery', 'flint', 'gabbro']);
  assert.equal(app.pebble.enableMultiJS, true);
  assert.equal(app.version, require('../package.json').version);
});

test('the app drawer uses one bundled 25-pixel PNG menu icon', () => {
  const app = require('../app/package.json');
  const icons = app.pebble.resources.media.filter(resource => resource.menuIcon === true);
  assert.equal(icons.length, 1);
  assert.equal(icons[0].type, 'bitmap');
  const image = fs.readFileSync(path.join(__dirname, '../app/resources', icons[0].file));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(image.toString('ascii', 12, 16), 'IHDR');
  assert.equal(image.readUInt32BE(16), 25);
  assert.equal(image.readUInt32BE(20), 25);
});

test('store icons are opaque PNGs at the required small and large dimensions', () => {
  for (const size of [80, 144]) {
    const image = fs.readFileSync(path.join(__dirname, '../store', `icon-${size}.png`));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(image.toString('ascii', 12, 16), 'IHDR');
    assert.equal(image.readUInt32BE(16), size);
    assert.equal(image.readUInt32BE(20), size);
    assert.equal(image[24], 8);
    assert.equal(image[25], 2);
  }
});

test('listing screenshots use marketed watch names and native display dimensions', () => {
  for (const [model, width, height] of [
    ['Pebble Time', 144, 168],
    ['Pebble Time Steel', 144, 168],
    ['Pebble Time Round', 180, 180],
    ['Pebble 2', 144, 168],
    ['Pebble Time 2', 200, 228],
    ['Pebble 2 Duo', 144, 168],
    ['Pebble Round 2', 260, 260]
  ]) {
    const image = fs.readFileSync(path.join(__dirname, '../store/screenshots', `${model} - confirmation.png`));
    assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', model);
    assert.equal(image.readUInt32BE(16), width, model);
    assert.equal(image.readUInt32BE(20), height, model);
  }
});
