'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const parser = require('../app/src/pkjs/parser');
const realController = require('../app/src/pkjs/controller');

function phone(customController, clock) {
  const listeners = {};
  const deliveries = [];
  const logs = [];
  const timers = [];
  let raw = null;
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value; } };
  const pins = [];
  const pebble = {
    addEventListener: (name, callback) => { listeners[name] = callback; },
    sendAppMessage: (payload, success, failure) => deliveries.push({ payload, success, failure }),
    insertTimelinePin: pin => pins.push(pin)
  };
  const fixedClock = clock || (() => Date.UTC(2026, 9, 14, 12));
  const context = {
    require: () => customController || {
      create: (store, platform) => realController.create(store, platform, fixedClock)
    },
    localStorage: storage, Pebble: pebble, Date,
    setTimeout: callback => timers.push(callback),
    console: { error: value => logs.push(value) }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/src/pkjs/index.js'), 'utf8'), context);
  return { listeners, deliveries, logs, timers, pins, pebble };
}

test('actual phone entrypoint serializes delivery and creates no pin before confirmation', () => {
  const f = phone();
  f.listeners.ready();
  f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: 'Synthetic secret in 20 minutes' } });
  assert.equal(f.deliveries.length, 1);
  f.deliveries[0].success();
  const draft = f.deliveries[1].payload;
  assert.equal(draft.STATUS, 'draft');
  assert.equal(draft.COMMAND, 'parse');
  assert.equal(draft.SECONDS_UNTIL, 1200);
  assert.equal(f.pins.length, 0);
  f.deliveries[1].success();
  f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
  assert.equal(f.pins.length, 1);
  assert.equal(f.deliveries[2].payload.STATUS, 'pending');
  assert.equal(f.deliveries[2].payload.COMMAND, 'confirm');
  assert.equal(f.deliveries[2].payload.TOKEN, draft.TOKEN);
  assert.deepEqual(f.logs, []);
});

test('ready, parse, cancel and failed requests retain their watch request correlation', () => {
  const f = phone();
  f.listeners.ready();
  assert.equal(f.deliveries[0].payload.REQUEST_ID, 0);
  f.deliveries[0].success();
  f.listeners.appmessage({ payload: { COMMAND: 'parse', REQUEST_ID: 7, TEXT: 'Synthetic in 20 minutes' } });
  const draft = f.deliveries[1].payload;
  assert.equal(draft.REQUEST_ID, 7);
  f.deliveries[1].success();
  f.listeners.appmessage({ payload: { COMMAND: 'cancel', REQUEST_ID: 8, TOKEN: draft.TOKEN } });
  assert.equal(f.deliveries[2].payload.REQUEST_ID, 8);
  assert.equal(f.deliveries[2].payload.TOKEN, 0);
  assert.equal(f.deliveries[2].payload.STATUS, 'home');
  f.deliveries[2].success();
  f.listeners.appmessage({ payload: { COMMAND: 'parse', REQUEST_ID: 9, TEXT: '' } });
  assert.equal(f.deliveries[3].payload.REQUEST_ID, 9);
  assert.equal(f.deliveries[3].payload.COMMAND, 'parse');
  assert.ok(f.deliveries[3].payload.ERROR);
  assert.equal(f.pins.length, 0);
});

test('phone message delivery has bounded retries and logs no private payload', () => {
  const f = phone();
  f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: 'Synthetic secret in 20 minutes' } });
  for (let attempt = 0; attempt < 3; attempt++) {
    f.deliveries[attempt].failure({ private: 'not logged' });
    if (attempt < 2) f.timers.shift()();
  }
  assert.equal(f.deliveries.length, 3);
  assert.equal(f.timers.length, 0);
  assert.equal(f.logs.length, 1);
  assert.doesNotMatch(f.logs.join(''), /Synthetic|secret|not logged/);
});

test('only marked application errors reach the watch, not raw platform exceptions', () => {
  for (const error of [new Error('Invalid private platform data'), null]) {
    const f = phone({ create: () => ({ handle: () => { throw error; } }) });
    f.listeners.ready();
    assert.equal(f.deliveries[0].payload.STATUS, 'error');
    assert.doesNotMatch(f.deliveries[0].payload.ERROR, /private platform/);
  }
  const f = phone({ create: () => ({ handle: () => parser.fail('Choose a valid date.') }) });
  f.listeners.ready();
  assert.equal(f.deliveries[0].payload.ERROR, 'Choose a valid date.');
});

test('insertion failure returns persisted pending state instead of stale draft actions', () => {
  const f = phone();
  delete f.pebble.insertTimelinePin;
  f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: 'Synthetic in 20 minutes' } });
  const token = f.deliveries[0].payload.TOKEN;
  f.deliveries[0].success();
  f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: token } });
  const response = f.deliveries[1].payload;
  assert.equal(response.STATUS, 'pending');
  assert.equal(response.TOKEN, token);
  assert.match(response.ERROR, /local pins are unavailable/);
  assert.equal(response.COMMAND, 'confirm');
  assert.equal(f.pins.length, 0);
});

test('English, Spanish and mixed transcripts remain drafts until explicit confirmation', () => {
  for (const [text, title, seconds = 1200] of [
    ['Synthetic check in twenty minutes', 'Synthetic check'],
    ['Recuérdame revisar prueba en veinte minutos', 'revisar prueba'],
    ['remind me to revisar prueba en veinte minutes', 'revisar prueba'],
    ['test en 10 minutos', 'test', 600]
  ]) {
    const f = phone();
    f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: text } });
    const draft = f.deliveries[0].payload;
    assert.equal(draft.STATUS, 'draft', text);
    assert.equal(draft.TITLE, title);
    assert.equal(draft.CAN_CONFIRM, 1);
    assert.equal(draft.SECONDS_UNTIL, seconds);
    assert.equal(f.pins.length, 0);
    f.deliveries[0].success();
    f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
    assert.equal(f.pins.length, 1);
    assert.equal(f.pins[0].layout.title, title);
    assert.equal(f.pins[0].reminders.length, 1);
    assert.equal(f.pins[0].time, f.pins[0].reminders[0].time);
    assert.deepEqual(f.logs, []);
  }
});

test('relative time uses the current phone clock, rounds fractions up and expires at zero', () => {
  let now = Date.UTC(2026, 9, 14, 12);
  const f = phone(undefined, () => now);
  f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: 'Synthetic in 2 hours' } });
  assert.equal(f.deliveries[0].payload.SECONDS_UNTIL, 7200);
  f.deliveries[0].success();
  now += 10001;
  f.listeners.ready();
  assert.equal(f.deliveries[1].payload.SECONDS_UNTIL, 7190);
  assert.equal(f.deliveries[1].payload.COMMAND, 'ready');
  f.deliveries[1].success();
  now += 7200000;
  f.listeners.ready();
  assert.equal(f.deliveries[2].payload.SECONDS_UNTIL, 0);
  assert.equal(f.deliveries[2].payload.CAN_CONFIRM, 0);
  assert.equal(f.pins.length, 0);
});

test('time-first bilingual reminders confirm exactly one pin and alert at captured reference plus five minutes', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const reference = Date.UTC(2026, 9, 14, 12, 34, 56, 789);
    const expectedTime = new Date(reference + 300000).toISOString();
    for (const [text, title] of [
      ['recuerdame en 5 minutos ver mensajes', 'ver mensajes'],
      ['remind me in 5 minutes to see message', 'see message'],
      ['RECUÉRDAME DENTRO DE FIVE MINUTOS Ver Café', 'Ver Café']
    ]) {
      let now = reference;
      const f = phone(undefined, () => now);
      f.listeners.appmessage({ payload: { COMMAND: 'parse', REQUEST_ID: 17, TEXT: text } });
      const draft = f.deliveries[0].payload;
      assert.equal(draft.STATUS, 'draft', text);
      assert.equal(draft.TITLE, title, text);
      assert.equal(draft.WHEN, '2026-10-14\n12:39', text);
      assert.equal(draft.SECONDS_UNTIL, 300, text);
      assert.equal(draft.CAN_CONFIRM, 1, text);
      assert.equal(draft.REQUEST_ID, 17, text);
      assert.equal(f.pins.length, 0, text);
      f.deliveries[0].success();
      now += 60000;
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', REQUEST_ID: 18, TOKEN: draft.TOKEN } });
      assert.equal(f.pins.length, 1, text);
      assert.equal(f.pins[0].layout.title, title, text);
      assert.equal(f.pins[0].time, expectedTime, text);
      assert.equal(f.pins[0].reminders.length, 1, text);
      assert.equal(f.pins[0].reminders[0].time, expectedTime, text);
      assert.equal(f.deliveries[1].payload.STATUS, 'pending', text);
      assert.equal(f.deliveries[1].payload.TOKEN, draft.TOKEN, text);
      assert.equal(f.deliveries[1].payload.REQUEST_ID, 18, text);
      assert.deepEqual(f.logs, []);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('invalid leading schedules never expose confirmation or insert a pin', () => {
  for (const text of [
    'remind me in five minutes to',
    'remind me in 5 hours 30 minutes to Test',
    'recuerdame en 5 horas 30 minutos ver mensajes',
    'in 5 minutes 30 seconds to Test',
    'in five hours thirty minutes to Test',
    'en cinco minutos veintidós segundos ver mensajes',
    'in five minutes two weeks to Test',
    'recuerdame en cero minutos ver mensajes',
    'remind me in five minutes later to see message',
    'remind me in five minutes to see message tomorrow at 3 PM',
    'recuerdame en cinco minutos ver mensajes en dos días'
  ]) {
    const f = phone();
    f.listeners.appmessage({ payload: { COMMAND: 'parse', REQUEST_ID: 19, TEXT: text } });
    const response = f.deliveries[0].payload;
    assert.equal(response.STATUS, 'home', text);
    assert.ok(response.ERROR, text);
    assert.notEqual(response.CAN_CONFIRM, 1, text);
    assert.equal(response.REQUEST_ID, 19, text);
    assert.equal(f.pins.length, 0, text);
    assert.deepEqual(f.logs, ['QuickReminders: request failed.']);
  }
});

test('mid-sentence times and defaults require confirmation and display only local date and time', () => {
  const previous = process.env.TZ;
  try {
    for (const [zone, now, text, title, instant, when] of [
      ['UTC', Date.UTC(2026, 9, 14, 12), 'Enviar un mensaje mañana a las 8 de la mañana sobre la prueba',
        'Enviar un mensaje sobre la prueba', Date.UTC(2026, 9, 15, 8), '2026-10-15\n08:00'],
      ['UTC', Date.UTC(2026, 9, 14, 12), 'Test mañana',
        'Test', Date.UTC(2026, 9, 15, 10), '2026-10-15\n10:00'],
      ['UTC', Date.UTC(2026, 9, 14, 12), 'Test on Friday',
        'Test', Date.UTC(2026, 9, 16, 10), '2026-10-16\n10:00'],
      ['UTC', Date.UTC(2026, 9, 14, 12), 'Revisar prueba',
        'Revisar prueba', Date.UTC(2026, 9, 14, 20), '2026-10-14\n20:00'],
      ['UTC', Date.UTC(2026, 9, 14, 20), 'Revisar prueba',
        'Revisar prueba', Date.UTC(2026, 9, 15, 10), '2026-10-15\n10:00'],
      ['America/New_York', Date.UTC(2026, 9, 14, 12), 'Test mañana',
        'Test', Date.UTC(2026, 9, 15, 14), '2026-10-15\n10:00']
    ]) {
      process.env.TZ = zone;
      const f = phone(undefined, () => now);
      f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: text } });
      const draft = f.deliveries[0].payload;
      assert.equal(draft.STATUS, 'draft', text);
      assert.equal(draft.TITLE, title, text);
      assert.equal(draft.WHEN, when, text);
      assert.equal(draft.CAN_CONFIRM, 1, text);
      assert.equal(draft.SECONDS_UNTIL, (instant - now) / 1000, text);
      assert.equal(f.pins.length, 0, text);
      f.deliveries[0].success();
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
      assert.equal(f.pins.length, 1, text);
      assert.equal(f.pins[0].layout.title, title, text);
      assert.equal(f.pins[0].time, new Date(instant).toISOString(), text);
      assert.equal(f.pins[0].reminders.length, 1, text);
      assert.equal(f.pins[0].reminders[0].time, f.pins[0].time, text);
      assert.equal(f.deliveries[1].payload.WHEN, when, text);
      assert.deepEqual(f.logs, []);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('timezone travel keeps an unsubmitted draft recoverable but never confirmable', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const f = phone();
    f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: 'Synthetic check in 20 minutes' } });
    const draft = f.deliveries[0].payload;
    f.deliveries[0].success();
    process.env.TZ = 'Europe/Madrid';
    f.listeners.ready();
    const restored = f.deliveries[1].payload;
    assert.equal(restored.STATUS, 'draft');
    assert.equal(restored.TOKEN, draft.TOKEN);
    assert.equal(restored.CAN_CONFIRM, 0);
    assert.match(restored.ERROR, /timezone changed/);
    f.deliveries[1].success();
    f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
    assert.equal(f.pins.length, 0);
    assert.match(f.deliveries[2].payload.ERROR, /timezone changed/);
    f.deliveries[2].success();
    f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: 'Prueba en veinte minutos' } });
    assert.equal(f.deliveries[3].payload.STATUS, 'draft');
    assert.equal(f.deliveries[3].payload.CAN_CONFIRM, 1);
    assert.notEqual(f.deliveries[3].payload.TOKEN, draft.TOKEN);
    assert.equal(f.pins.length, 0);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
