'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
