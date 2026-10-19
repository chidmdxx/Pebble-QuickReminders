'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const defaults = require('../app/src/pkjs/defaults');
const settings = require('../app/src/pkjs/settings');
const parser = require('../app/src/pkjs/parser');
const controller = require('../app/src/pkjs/controller');

function storage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value)
  };
}

function zone(name, run) {
  const previous = process.env.TZ;
  process.env.TZ = name;
  try { run(); } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

const custom = { amTime: '09:15', pmTime: '18:45', ribbonColor: 194, autoClose: false, snoozeMinutes: [7, 15, 45] };

test('settings persist independently, validate strictly, and recover only through an explicit save', () => {
  const data = storage();
  const preferences = settings.create(data);
  assert.deepEqual(preferences.read(), defaults.initial);
  preferences.read().amTime = '01:00';
  assert.equal(preferences.read().amTime, '10:00');
  data.setItem('quickreminders.pending.v1', 'untouched reminder');
  preferences.save(custom);
  assert.deepEqual(settings.create(data).read(), custom);
  assert.deepEqual(preferences.message(), { RIBBON_COLOR: 194, AUTO_CLOSE: 0, SNOOZE_1: 7, SNOOZE_2: 15, SNOOZE_3: 45 });
  for (const invalid of [
    null, {}, { ...custom, amTime: '12:00' }, { ...custom, amTime: '9:15' },
    { ...custom, amTime: '09:60' }, { ...custom, pmTime: '11:59' },
    { ...custom, pmTime: '24:00' }, { ...custom, ribbonColor: 255 },
    { ...custom, ribbonColor: '194' }, { ...custom, autoClose: 0 }
  ]) {
    assert.throws(() => preferences.save(invalid), /Choose valid times/);
    assert.deepEqual(preferences.read(), custom);
  }
  assert.equal(data.getItem('quickreminders.pending.v1'), 'untouched reminder');
  for (const raw of ['', '{', 'null', '{}']) {
    data.setItem('quickreminders.settings.v1', raw);
    assert.throws(() => preferences.read());
  }
  preferences.save(defaults.initial);
  assert.deepEqual(preferences.read(), defaults.initial);
  assert.throws(() => settings.create({
    setItem: () => { throw new Error('Storage unavailable'); }
  }).save(custom), /Storage unavailable/);
});

test('custom defaults use exact minute cutoffs and keep explicit clocks and relative durations unchanged', () => zone('UTC', () => {
  for (const [text, reference, instant] of [
    ['Test', Date.UTC(2026, 9, 15, 18, 44, 59), Date.UTC(2026, 9, 15, 18, 45)],
    ['Test', Date.UTC(2026, 9, 15, 18, 45), Date.UTC(2026, 9, 16, 9, 15)],
    ['Test', Date.UTC(2026, 9, 15, 23, 59), Date.UTC(2026, 9, 16, 9, 15)],
    ['Test tomorrow', Date.UTC(2026, 9, 15, 12), Date.UTC(2026, 9, 16, 9, 15)],
    ['mañana Test', Date.UTC(2026, 9, 15, 12), Date.UTC(2026, 9, 16, 9, 15)],
    ['Test on Friday', Date.UTC(2026, 9, 15, 12), Date.UTC(2026, 9, 16, 9, 15)],
    ['Test 2026-10-16', Date.UTC(2026, 9, 15, 12), Date.UTC(2026, 9, 16, 9, 15)],
    ['Test on November 21', Date.UTC(2026, 9, 15, 12), Date.UTC(2026, 10, 21, 9, 15)],
    ['Test at 8 AM', Date.UTC(2026, 9, 15, 12), Date.UTC(2026, 9, 16, 8)],
    ['Test at 8:30', Date.UTC(2026, 9, 15, 12), Date.UTC(2026, 9, 15, 20, 30)],
    ['Test in five minutes', Date.UTC(2026, 9, 15, 12), Date.UTC(2026, 9, 15, 12, 5)]
  ]) {
    assert.equal(parser.parse(text, reference, custom).instant, instant, text);
  }
  assert.throws(() => parser.parse('Test today', Date.UTC(2026, 9, 15, 9, 15), custom), /passed/);
  assert.throws(() => parser.parse('Test tomorrow at 25:00', Date.UTC(2026, 9, 15, 12), custom));
  const extremes = { ...custom, amTime: '00:00', pmTime: '12:00' };
  assert.equal(parser.parse('Test', Date.UTC(2026, 9, 15, 12), extremes).instant, Date.UTC(2026, 9, 16));
}));

test('custom defaults remain local wall times and retain DST gap and overlap rejection', () => {
  zone('America/New_York', () => {
    assert.equal(parser.parse('Test tomorrow', Date.UTC(2026, 9, 15, 12), custom).instant,
      Date.UTC(2026, 9, 16, 13, 15));
    assert.throws(() => parser.parse('Test tomorrow', Date.UTC(2026, 2, 7, 17),
      { ...custom, amTime: '02:30' }), /daylight-saving gap/);
    assert.throws(() => parser.parse('Test tomorrow', Date.UTC(2026, 9, 31, 16),
      { ...custom, amTime: '01:30' }), /occurs twice/);
  });
});

test('changing defaults does not move an existing draft or the exact pin on confirmation', () => zone('UTC', () => {
  const data = storage();
  const pins = [];
  const phone = controller.create(data, { insertTimelinePin: pin => pins.push(pin) },
    () => Date.UTC(2026, 9, 15, 12));
  const original = phone.handle({ COMMAND: 'parse', TEXT: 'Test tomorrow' });
  settings.create(data).save(custom);
  const restored = phone.handle({ COMMAND: 'ready' });
  assert.equal(restored.TOKEN, original.TOKEN);
  assert.equal(restored.WHEN, original.WHEN);
  phone.handle({ COMMAND: 'confirm', TOKEN: original.TOKEN });
  assert.equal(pins[0].time, '2026-10-16T10:00:00.000Z');
  assert.equal(phone.handle({ COMMAND: 'parse', TEXT: 'Test tomorrow' }).WHEN, '2026-10-16 9:15 AM');
}));

test('bundled settings page preloads values, previews colors, validates, saves and cancels without a network', () => {
  const url = settings.page(custom);
  assert.match(url, /^data:text\/html/);
  const html = decodeURIComponent(url.slice(url.indexOf(',') + 1));
  assert.match(html, /value="09:15"/);
  assert.match(html, /value="18:45"/);
  assert.match(html, /value="194" selected/);
  assert.doesNotMatch(html, /https?:|<input id="close" type="checkbox" checked/);
  const elements = {
    am: { value: '07:30' }, pm: { value: '21:15' }, ribbon: { value: '226' },
    close: { checked: true }, settings: {}, error: {}, cancel: {}, preview: { style: {} },
    snooze0: { value: '7' }, snooze1: { value: '15' }, snooze2: { value: '45' }
  };
  const window = { location: { href: '' } };
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document: { getElementById: id => elements[id] }, window
  });

  elements.ribbon.onchange();
  assert.equal(elements.preview.style.borderRightColor, '#aa00aa');
  elements.settings.onsubmit({ preventDefault() {} });
  const saved = JSON.parse(decodeURIComponent(window.location.href.split('#')[1]));
  assert.deepEqual(saved, { amTime: '07:30', pmTime: '21:15', ribbonColor: 226, autoClose: true, snoozeMinutes: [7, 15, 45] });
  window.location.href = '';
  elements.snooze1.value = '0.5';
  elements.settings.onsubmit({ preventDefault() {} });
  assert.equal(window.location.href, '');
  assert.match(elements.error.textContent, /whole minutes/);
  elements.snooze1.value = '15';
  window.location.href = '';
  elements.am.value = '19:00';
  elements.settings.onsubmit({ preventDefault() {} });
  assert.equal(window.location.href, '');
  assert.match(elements.error.textContent, /AM time/);
  elements.cancel.onclick();
  assert.equal(window.location.href, 'pebblejs://close');
  assert.match(decodeURIComponent(settings.page(custom, true)), /Could not load or save settings/);
});

test('legacy stored settings default presets while a malformed present field stays visibly invalid', () => {
  const data = storage(), preferences = settings.create(data);
  const legacy = { amTime: '09:15', pmTime: '18:45', ribbonColor: 194, autoClose: false };
  data.setItem('quickreminders.settings.v1', JSON.stringify(legacy));
  assert.deepEqual(preferences.read(), { ...legacy, snoozeMinutes: [5, 10, 30] });
  preferences.read().snoozeMinutes[0] = 99;
  assert.equal(preferences.read().snoozeMinutes[0], 5);
  data.setItem('quickreminders.settings.v1', JSON.stringify({ ...legacy, snoozeMinutes: null }));
  assert.throws(() => preferences.read(), /presets/);
});
