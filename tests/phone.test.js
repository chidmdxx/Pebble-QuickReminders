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
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
  const pins = [];
  const urls = [];
  const pebble = {
    addEventListener: (name, callback) => { listeners[name] = callback; },
    sendAppMessage: (payload, success, failure) => deliveries.push({ payload, success, failure }),
    insertTimelinePin: pin => pins.push(pin),
    openURL: url => urls.push(url)
  };
  const fixedClock = clock || (() => Date.UTC(2026, 9, 14, 12));
  const context = {
    require: name => name === './controller' ? customController || {
      create: (store, platform) => realController.create(store, platform, fixedClock)
    } : require('../app/src/pkjs/' + name),
    localStorage: storage, Pebble: pebble, Date,
    setTimeout: callback => timers.push(callback),
    console: { error: value => logs.push(value) }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/src/pkjs/index.js'), 'utf8'), context);
  return { listeners, deliveries, logs, timers, pins, pebble, urls, storage };
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

test('half-hour phone drafts confirm one exact pin and alert without recomputing time', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const reference = Date.UTC(2026, 9, 14, 12);
    for (const [text, title] of [
      ['recuerdame en media hora comprar leche', 'comprar leche'],
      ['remind me in half an hour to buy milk', 'buy milk'],
      ['Recuérdame comprar Café dentro de media hora', 'comprar Café'],
      ['Buy milk in half hour', 'Buy milk']
    ]) {
      let now = reference;
      const f = phone(undefined, () => now);
      f.listeners.appmessage({ payload: { COMMAND: 'parse', REQUEST_ID: 17, TEXT: text } });
      const draft = f.deliveries[0].payload;
      assert.equal(draft.STATUS, 'draft', text);
      assert.equal(draft.TITLE, title, text);
      assert.equal(draft.WHEN, '2026-10-14 12:30 PM', text);
      assert.equal(draft.CAN_CONFIRM, 1, text);
      assert.equal(draft.SECONDS_UNTIL, 1800, text);
      assert.equal(f.pins.length, 0);
      f.deliveries[0].success();
      now += 10 * 60000;
      f.listeners.ready();
      assert.equal(f.deliveries[1].payload.TOKEN, draft.TOKEN);
      assert.equal(f.deliveries[1].payload.WHEN, draft.WHEN);
      assert.equal(f.deliveries[1].payload.SECONDS_UNTIL, 1200);
      assert.equal(f.pins.length, 0);
      f.deliveries[1].success();
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
      assert.equal(f.pins.length, 1);
      assert.equal(f.pins[0].layout.title, title);
      assert.equal(f.pins[0].time, '2026-10-14T12:30:00.000Z');
      assert.equal(f.pins[0].reminders.length, 1);
      assert.equal(f.pins[0].reminders[0].time, f.pins[0].time);
      assert.deepEqual(f.logs, []);
      f.deliveries[2].success();
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
      assert.equal(f.pins.length, 1);
      assert.doesNotMatch(f.logs.join(''), /leche|milk|Café|media|half/);
    }
    for (const text of [
      'recuerdame en media horas comprar leche',
      'remind me in half an hours to buy milk',
      'en media hora 30 minutos comprar leche',
      'in five minutes half an hour to buy milk',
      'in half an hour a minute to buy milk',
      'in half an hour an hour to buy milk'
    ]) {
      const f = phone(undefined, () => reference);
      f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: text } });
      assert.equal(f.deliveries[0].payload.STATUS, 'home', text);
      assert.ok(f.deliveries[0].payload.ERROR, text);
      assert.notEqual(f.deliveries[0].payload.CAN_CONFIRM, 1, text);
      f.deliveries[0].success();
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: 1 } });
      assert.equal(f.pins.length, 0, text);
      assert.doesNotMatch(f.logs.join(''), /leche|milk|media|half/);
    }
    const canceled = phone(undefined, () => reference);
    canceled.listeners.appmessage({ payload: {
      COMMAND: 'parse', TEXT: 'recuerdame en media hora comprar leche'
    } });
    const token = canceled.deliveries[0].payload.TOKEN;
    canceled.deliveries[0].success();
    canceled.listeners.appmessage({ payload: { COMMAND: 'cancel', TOKEN: token } });
    assert.equal(canceled.deliveries[1].payload.STATUS, 'home');
    canceled.deliveries[1].success();
    canceled.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: token } });
    assert.equal(canceled.pins.length, 0);
    assert.doesNotMatch(canceled.logs.join(''), /leche|media/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('leading and trailing day periods create one pin only after explicit confirmation', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const reference = Date.UTC(2026, 9, 14, 12);
    for (const text of [
      'hablar sobre la prueba mañana en la mañana',
      'en la mañana hablar sobre la prueba'
    ]) {
      const f = phone(undefined, () => reference);
      f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: text } });
      const draft = f.deliveries[0].payload;
      assert.equal(draft.STATUS, 'draft');
      assert.equal(draft.TITLE, 'hablar sobre la prueba');
      assert.equal(draft.WHEN, '2026-10-15 10:00 AM');
      assert.equal(draft.CAN_CONFIRM, 1);
      assert.equal(draft.SECONDS_UNTIL, 22 * 3600);
      assert.equal(f.pins.length, 0);
      f.deliveries[0].success();
      f.listeners.ready();
      assert.equal(f.deliveries[1].payload.TOKEN, draft.TOKEN);
      assert.equal(f.deliveries[1].payload.WHEN, draft.WHEN);
      assert.equal(f.pins.length, 0);
      f.deliveries[1].success();
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
      assert.deepEqual(f.logs, []);
      f.deliveries[2].success();
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
      assert.equal(f.pins.length, 1);
      assert.equal(f.pins[0].layout.title, 'hablar sobre la prueba');
      assert.equal(f.pins[0].time, '2026-10-15T10:00:00.000Z');
      assert.equal(f.pins[0].reminders.length, 1);
      assert.equal(f.pins[0].reminders[0].time, f.pins[0].time);
      assert.doesNotMatch(f.logs.join(''), /hablar|prueba|mañana/);
    }
    for (const text of [
      'Test mañana en la madrugada', 'Test mañana en la mañana a las 8',
      'Test mañana en la mañana en cinco minutos',
      'En la mañana Test tomorrow', 'En la mañana a las ocho Test',
      'En la mañana Test en cinco minutos'
    ]) {
      const rejected = phone(undefined, () => reference);
      rejected.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: text } });
      assert.equal(rejected.deliveries[0].payload.STATUS, 'home', text);
      assert.ok(rejected.deliveries[0].payload.ERROR, text);
      assert.notEqual(rejected.deliveries[0].payload.CAN_CONFIRM, 1, text);
      rejected.deliveries[0].success();
      rejected.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: 1 } });
      assert.equal(rejected.pins.length, 0, text);
      assert.doesNotMatch(rejected.logs.join(''), /Test|mañana|minutos|ocho/);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
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

test('introduced AM and PM titles survive phone draft reload and confirm exactly one pin and alert', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const reference = Date.UTC(2026, 9, 17, 12);
    for (const title of ['AM radio', 'PM review', 'PM: notes', 'AM radio, ¡Café!', 'PM review — ÁNA!']) {
      for (const [prefix, instant] of [
        ['in five minutes to ', reference + 5 * 60000],
        ['At 8 PM remind me about ', Date.UTC(2026, 9, 17, 20)],
        ['At 8 PM remind me to ', Date.UTC(2026, 9, 17, 20)],
        ['At 8 PM to ', Date.UTC(2026, 9, 17, 20)],
        ['Tomorrow at 8 PM, remind me to ', Date.UTC(2026, 9, 18, 20)],
        ['Mañana a las 8 de la noche, recuérdame ', Date.UTC(2026, 9, 18, 20)],
        ['Tomorrow remind me about ', Date.UTC(2026, 9, 18, 10)],
        ['Monday remind me to ', Date.UTC(2026, 9, 19, 10)],
        ['Tomorrow morning remind me to ', Date.UTC(2026, 9, 18, 10)],
        ['Tomorrow afternoon remind me to ', Date.UTC(2026, 9, 18, 20)],
        ['Tomorrow evening remind me about ', Date.UTC(2026, 9, 18, 20)],
        ['Tomorrow at night, remind me to ', Date.UTC(2026, 9, 18, 20)],
        ['2026-10-20 at 8 PM, remind me to ', Date.UTC(2026, 9, 20, 20)]
      ]) {
        const text = prefix + title;
        let now = reference;
        const f = phone(undefined, () => now);
        f.listeners.appmessage({ payload: { COMMAND: 'parse', REQUEST_ID: 25, TEXT: text } });
        const draft = f.deliveries[0].payload;
        assert.equal(draft.STATUS, 'draft', text);
        assert.equal(draft.TITLE, title, text);
        assert.equal(draft.SECONDS_UNTIL, (instant - reference) / 1000, text);
        assert.equal(draft.CAN_CONFIRM, 1, text);
        assert.equal(draft.REQUEST_ID, 25, text);
        assert.equal(f.pins.length, 0, text);
        f.deliveries[0].success();
        now += 60000;
        f.listeners.ready();
        const restored = f.deliveries[1].payload;
        assert.equal(restored.STATUS, 'draft', text);
        assert.equal(restored.TITLE, title, text);
        assert.equal(restored.TOKEN, draft.TOKEN, text);
        assert.equal(restored.WHEN, draft.WHEN, text);
        assert.equal(restored.SECONDS_UNTIL, (instant - now) / 1000, text);
        assert.equal(f.pins.length, 0, text);
        f.deliveries[1].success();
        f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
        assert.equal(f.deliveries[2].payload.STATUS, 'pending', text);
        assert.equal(f.pins.length, 1, text);
        assert.equal(f.pins[0].layout.title, title, text);
        assert.equal(f.pins[0].time, new Date(instant).toISOString(), text);
        assert.equal(f.pins[0].reminders.length, 1, text);
        assert.equal(f.pins[0].reminders[0].time, f.pins[0].time, text);
        assert.deepEqual(f.logs, [], text);
        f.deliveries[2].success();
        f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
        assert.equal(f.pins.length, 1, text);
        assert.equal(f.pins[0].reminders.length, 1, text);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
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

test('leading English and Spanish absolute reminders keep one reviewed instant and require confirmation', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const reference = Date.UTC(2026, 9, 17, 12);
    for (const [text, title, minute = 0, day = 18, hour = 20] of [
      ['mañana a las 8 de la noche, recuerdame comprar pan', 'comprar pan'],
      ['Tomorrow at 8 PM, remind me to buy bread', 'buy bread'],
      ['Tomorrow at 8p.m., remind me to ¡Café, a. m.!', '¡Café, a. m.!'],
      ['Mañana a las ocho p.m., recuérdame Revisar p. m., ÁNA!', 'Revisar p. m., ÁNA!'],
      ['Tomorrow at 8 PM at home exercise', 'at home exercise'],
      ['At 8 PM at home exercise', 'at home exercise', 0, 17],
      ['At 8 PM 30 items to review', '30 items to review', 0, 17],
      ['Mañana a las 8 de la noche al mercado, ¡ÁNA!', 'al mercado, ¡ÁNA!'],
      ['Tomorrow at 8 PM 30 items to review', '30 items to review'],
      ['Mañana a las 20:30 treinta artículos, ¡Café!', 'treinta artículos, ¡Café!', 30],
      ['Tomorrow at 20:30 30 items to review', '30 items to review', 30],
      ['Mañana a las 8:30 30 artículos, ¡ÁNA!', '30 artículos, ¡ÁNA!', 30, 18, 8],
      ['Tomorrow at 8 at night, remind me to buy bread', 'buy bread'],
      ['Tomorrow at 8 in the evening, remind me to buy bread', 'buy bread'],
      ['Tomorrow at 8 PM, remind me to review 30 items', 'review 30 items'],
      ['Tomorrow at 8 PM, remind me to 30 items to review', '30 items to review'],
      ['Tomorrow at 8 : 30 PM, remind me to 30 items to review', '30 items to review', 30],
      ['Mañana a las ocho y treinta de la noche, recuérdame treinta artículos', 'treinta artículos', 30]
    ]) {
      let now = reference;
      const instant = Date.UTC(2026, 9, day, hour, minute);
      const f = phone(undefined, () => now);
      f.listeners.appmessage({ payload: { COMMAND: 'parse', REQUEST_ID: 17, TEXT: text } });
      const draft = f.deliveries[0].payload;
      assert.equal(draft.STATUS, 'draft');
      assert.equal(draft.TITLE, title);
      assert.equal(draft.WHEN, `2026-10-${day} ${hour % 12 || 12}:${minute ? '30' : '00'} ${hour < 12 ? 'AM' : 'PM'}`);
      assert.equal(draft.SECONDS_UNTIL, (instant - reference) / 1000);
      assert.equal(draft.CAN_CONFIRM, 1);
      assert.equal(draft.REQUEST_ID, 17);
      assert.equal(f.pins.length, 0);
      f.deliveries[0].success();
      now += 60000;
      f.listeners.ready();
      const restored = f.deliveries[1].payload;
      assert.equal(restored.TOKEN, draft.TOKEN);
      assert.equal(restored.WHEN, draft.WHEN);
      assert.equal(restored.SECONDS_UNTIL, (instant - reference) / 1000 - 60);
      assert.equal(f.pins.length, 0);
      f.deliveries[1].success();
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN, REQUEST_ID: 18 } });
      assert.equal(f.deliveries[2].payload.STATUS, 'pending');
      assert.equal(f.deliveries[2].payload.REQUEST_ID, 18);
      assert.equal(f.pins.length, 1);
      assert.equal(f.pins[0].layout.title, title);
      assert.equal(f.pins[0].time, new Date(instant).toISOString());
      assert.equal(f.pins[0].reminders.length, 1);
      assert.equal(f.pins[0].reminders[0].time, f.pins[0].time);
      f.deliveries[2].success();
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
      assert.equal(f.pins.length, 1);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('leading days choose saved AM or PM defaults without inserting before confirmation', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const reference = Date.UTC(2026, 9, 17, 12);
    for (const [text, title, day, hour, minute, display] of [
      ['mañana recuerdame comprar leche', 'comprar leche', 18, 9, 15, '2026-10-18 9:15 AM'],
      ['Monday remind me to buy milk', 'buy milk', 19, 9, 15, '2026-10-19 9:15 AM'],
      ['mañana en la tarde recuerdame comprar leche', 'comprar leche', 18, 18, 45, '2026-10-18 6:45 PM'],
      ['Tomorrow afternoon remind me to buy milk', 'buy milk', 18, 18, 45, '2026-10-18 6:45 PM']
    ]) {
      const f = phone(undefined, () => reference);
      f.storage.setItem('quickreminders.settings.v1', JSON.stringify({
        amTime: '09:15', pmTime: '18:45', ribbonColor: 224, autoClose: true
      }));
      f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: text } });
      const draft = f.deliveries[0].payload;
      const instant = Date.UTC(2026, 9, day, hour, minute);
      assert.equal(draft.STATUS, 'draft', text);
      assert.equal(draft.TITLE, title, text);
      assert.equal(draft.WHEN, display, text);
      assert.equal(draft.SECONDS_UNTIL, (instant - reference) / 1000, text);
      assert.equal(draft.CAN_CONFIRM, 1, text);
      assert.equal(f.pins.length, 0);
      f.deliveries[0].success();
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
      assert.equal(f.pins.length, 1);
      assert.equal(f.pins[0].time, new Date(instant).toISOString());
      assert.equal(f.pins[0].layout.title, title);
      assert.equal(f.pins[0].reminders.length, 1);
      assert.equal(f.pins[0].reminders[0].time, f.pins[0].time);
      assert.deepEqual(f.logs, []);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
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
      assert.equal(draft.WHEN, '2026-10-14 12:39 PM', text);
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
    'recuerdame en cinco minutos ver mensajes en dos días',
    'At 13 PM remind me about AM radio',
    'Tomorrow at 8 PM AM, remind me to PM review',
    'Tomorrow at 8 PM p.m., remind me to AM radio',
    'Tomorrow at 8 30, remind me to PM review',
    'Tomorrow at 8 : 60 PM, remind me to AM radio',
    'Tomorrow at 8 PM UTC, remind me to PM review',
    'Tomorrow at 8 : 60, remind me to buy bread',
    'Mañana a las 8 : 60, recuérdame comprar pan',
    'Tomorrow at 8 PM: remind me to buy bread',
    'Mañana a las 8 PM: recuérdame comprar pan',
    'Tomorrow at 8 : 30 PM: remind me to buy bread',
    'Mañana a las 8 : 30 de la noche: recuérdame comprar pan'
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

test('unparsed leading time boundaries cannot expose confirmation or create pins', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    for (const text of [
      'Tomorrow at sunset, remind me to buy bread',
      'Mañana al amanecer, recuérdame comprar pan',
      'Mañana a las amanecer, recuérdame comprar pan',
      'Mañana a la puesta del sol, recuérdame comprar pan',
      'Tomorrow evening at sunset, remind me to buy bread',
      'Mañana por la mañana al amanecer, recuérdame comprar pan',
      'Tomorrow at eight thirty p.m., remind me to buy bread',
      ...['Tomorrow at 8', 'Mañana a las ocho', 'At 8'].flatMap(schedule =>
        ['p. m.', 'p m', 'p .m.', 'p . m', 'a. m.', 'a m', 'a .m.', 'p.', 'a.', 'p', 'a', 'a ', 'p '].flatMap(qualifier =>
          ['remind me to buy bread', 'recuérdame comprar pan'].map(prompt =>
            `${schedule} ${qualifier}, ${prompt}`))),
      'At 8 PM at 9 PM buy bread',
      'Tomorrow at 20:30 a las 21 comprar pan',
      'Tomorrow at 8 30, remind me to buy bread',
      'Tomorrow at 20 30, remind me to buy bread',
      'Mañana a las veinte treinta, recuérdame comprar pan',
      'Tomorrow at eight sixty, remind me to buy bread',
      'Tomorrow at 8 -5, remind me to buy bread',
      'Mañana a las ocho treinta de la noche, recuérdame comprar pan',
      'Mañana a la 8 60, recuérdame comprar pan',
      'Mañana al ocho cien, recuérdame comprar pan'
    ]) {
      const f = phone(undefined, () => Date.UTC(2026, 9, 17, 12));
      f.listeners.appmessage({ payload: { COMMAND: 'parse', REQUEST_ID: 24, TEXT: text } });
      const response = f.deliveries[0].payload;
      assert.equal(response.STATUS, 'home', text);
      assert.match(response.ERROR, /clear schedule/, text);
      assert.notEqual(response.CAN_CONFIRM, 1, text);
      assert.equal(response.REQUEST_ID, 24, text);
      assert.equal(f.pins.length, 0, text);
      f.deliveries[0].success();
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: response.TOKEN || 1 } });
      assert.notEqual(f.deliveries[1].payload.CAN_CONFIRM, 1, text);
      assert.equal(f.pins.length, 0, text);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('timezone-qualified leading schedules never become confirmable through the phone entrypoint', () => {
  const previous = process.env.TZ;
  try {
    for (const name of ['UTC', 'America/New_York']) {
      process.env.TZ = name;
      for (const text of [
        'Tomorrow at 8 PM UTC, remind me to buy bread',
        'Tomorrow at 8 PM GMT+02:00, remind me to buy bread',
        'Tomorrow at 8 PM EST, remind me to buy bread',
        'Tomorrow at 8 PM +0530, remind me to buy bread',
        'Tomorrow at 8 PM -04:00, remind me to buy bread',
        'Tomorrow at 8 PM Z, remind me to buy bread',
        'Tomorrow at 8 PM America/New_York, remind me to buy bread',
        'Tomorrow at 8 PM (UTC), remind me to buy bread',
        'Tomorrow at 8 PMUTC, remind me to buy bread',
        'Mañana a las 8 de la noche en CET, recuérdame comprar pan',
        'At 8 PM tomorrow Europe/Paris, remind me to buy bread',
        'Tomorrow evening UTC, remind me to buy bread'
      ]) {
        const f = phone(undefined, () => Date.UTC(2026, 9, 17, 12));
        f.listeners.appmessage({ payload: { COMMAND: 'parse', REQUEST_ID: 23, TEXT: text } });
        const response = f.deliveries[0].payload;
        assert.equal(response.STATUS, 'home', `${name}: ${text}`);
        assert.match(response.ERROR, /clear schedule/, text);
        assert.notEqual(response.CAN_CONFIRM, 1, text);
        assert.equal(response.REQUEST_ID, 23);
        assert.equal(f.pins.length, 0);
        f.deliveries[0].success();
        f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: response.TOKEN || 1 } });
        assert.notEqual(f.deliveries[1].payload.CAN_CONFIRM, 1, text);
        assert.equal(f.pins.length, 0, text);
      }
      for (const title of ['review UTC notes', 'UTC: GMT, EST, +0200, Z', 'Europe/Paris notes', '(UTC) review']) {
        const f = phone(undefined, () => Date.UTC(2026, 9, 17, 12));
        f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: `Tomorrow at 8 PM, remind me to ${title}` } });
        const draft = f.deliveries[0].payload;
        assert.equal(draft.STATUS, 'draft');
        assert.equal(draft.CAN_CONFIRM, 1);
        assert.equal(draft.TITLE, title);
        assert.equal(f.pins.length, 0);
        f.deliveries[0].success();
        f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: draft.TOKEN } });
        assert.equal(f.pins.length, 1);
        assert.equal(f.pins[0].layout.title, title);
        assert.equal(f.pins[0].time, name === 'UTC' ? '2026-10-18T20:00:00.000Z' : '2026-10-19T00:00:00.000Z');
        assert.equal(f.pins[0].reminders.length, 1);
        assert.equal(f.pins[0].reminders[0].time, f.pins[0].time);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('mid-sentence times and defaults require confirmation and display only local date and time', () => {
  const previous = process.env.TZ;
  try {
    for (const [zone, now, text, title, instant, when] of [
      ['UTC', Date.UTC(2026, 9, 14, 12), 'Enviar un mensaje mañana a las 8 de la mañana sobre la prueba',
        'Enviar un mensaje sobre la prueba', Date.UTC(2026, 9, 15, 8), '2026-10-15 8:00 AM'],
      ['UTC', Date.UTC(2026, 9, 14, 12), 'Test mañana',
        'Test', Date.UTC(2026, 9, 15, 10), '2026-10-15 10:00 AM'],
      ['UTC', Date.UTC(2026, 9, 14, 12), 'Test on Friday',
        'Test', Date.UTC(2026, 9, 16, 10), '2026-10-16 10:00 AM'],
      ['UTC', Date.UTC(2026, 9, 14, 12), 'Revisar prueba',
        'Revisar prueba', Date.UTC(2026, 9, 14, 20), '2026-10-14 8:00 PM'],
      ['UTC', Date.UTC(2026, 9, 14, 20), 'Revisar prueba',
        'Revisar prueba', Date.UTC(2026, 9, 15, 10), '2026-10-15 10:00 AM'],
      ['America/New_York', Date.UTC(2026, 9, 14, 12), 'Test mañana',
        'Test', Date.UTC(2026, 9, 15, 14), '2026-10-15 10:00 AM'],
      ['UTC', Date.UTC(2026, 9, 15, 6), 'At 10 am reminde me about the practice equipment',
        'the practice equipment', Date.UTC(2026, 9, 15, 10), '2026-10-15 10:00 AM'],
      ['UTC', Date.UTC(2026, 9, 15, 12), 'At 10 am remind me about the practice equipment',
        'the practice equipment', Date.UTC(2026, 9, 16, 10), '2026-10-16 10:00 AM'],
      ['UTC', Date.UTC(2026, 9, 15, 6), 'Follow up on the sample deployment at 10 am today',
        'Follow up on the sample deployment', Date.UTC(2026, 9, 15, 10), '2026-10-15 10:00 AM'],
      ['UTC', Date.UTC(2026, 9, 15, 6), 'Recordar llamar a Manuel el lunes que viene',
        'llamar a Manuel', Date.UTC(2026, 9, 19, 10), '2026-10-19 10:00 AM'],
      ['UTC', Date.UTC(2026, 9, 15, 6), 'Test el 17 de mayo',
        'Test', Date.UTC(2027, 4, 17, 10), '2027-05-17 10:00 AM'],
      ['UTC', Date.UTC(2026, 9, 15, 6), 'Test hoy a las 3:30 p.m.',
        'Test', Date.UTC(2026, 9, 15, 15, 30), '2026-10-15 3:30 PM'],
      ['UTC', Date.UTC(2026, 9, 15, 6), 'Test on Friday at 3:30 in the afternoon',
        'Test', Date.UTC(2026, 9, 16, 15, 30), '2026-10-16 3:30 PM'],
      ['UTC', Date.UTC(2026, 9, 15, 6), 'Test el jueves al mediodía',
        'Test', Date.UTC(2026, 9, 15, 12), '2026-10-15 12:00 PM'],
      ['UTC', Date.UTC(2026, 9, 15, 11, 37), 'remind me at 8:30 to check out the game',
        'check out the game', Date.UTC(2026, 9, 15, 20, 30), '2026-10-15 8:30 PM'],
      ['UTC', Date.UTC(2026, 9, 15, 21), 'remind me at 8:30 to check out the game',
        'check out the game', Date.UTC(2026, 9, 16, 8, 30), '2026-10-16 8:30 AM'],
      ['UTC', Date.UTC(2026, 9, 15, 11, 37), 'Recuérdame revisar el juego a las ocho',
        'revisar el juego', Date.UTC(2026, 9, 15, 20), '2026-10-15 8:00 PM'],
      ['UTC', Date.UTC(2026, 9, 15, 11, 37), 'Test tomorrow at 8:30',
        'Test', Date.UTC(2026, 9, 16, 8, 30), '2026-10-16 8:30 AM']
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

test('companion settings save, synchronize with bounded delivery, and survive cancellation and invalid input', () => {
  const f = phone();
  const preferences = require('../app/src/pkjs/settings').create(f.storage);
  const value = { amTime: '08:30', pmTime: '19:15', ribbonColor: 226, autoClose: false };
  f.listeners.showConfiguration();
  assert.match(f.urls[0], /^data:text\/html/);
  f.listeners.webviewclosed({ response: encodeURIComponent(JSON.stringify(value)) });
  assert.deepEqual(preferences.read(), value);
  assert.equal(f.deliveries[0].payload.COMMAND, 'settings');
  assert.equal(f.deliveries[0].payload.RIBBON_COLOR, 226);
  assert.equal(f.deliveries[0].payload.AUTO_CLOSE, 0);
  f.deliveries[0].success();
  for (const response of [undefined, '', 'CANCELLED']) f.listeners.webviewclosed({ response });
  assert.equal(f.deliveries.length, 1);
  assert.deepEqual(preferences.read(), value);
  for (const response of ['%', '{}', 'null']) f.listeners.webviewclosed({ response });
  assert.deepEqual(preferences.read(), value);
  assert.equal(f.deliveries.length, 1);
  assert.equal(f.urls.length, 4);
  f.listeners.ready();
  assert.equal(f.deliveries[1].payload.RIBBON_COLOR, 226);
  assert.equal(f.deliveries[1].payload.AUTO_CLOSE, 0);
  assert.equal(f.pins.length, 0);
});

test('configuration storage failures are visible, recoverable, and never change reminder storage', () => {
  const f = phone();
  f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: 'Test in five minutes' } });
  f.deliveries[0].success();
  const saved = f.storage.getItem('quickreminders.pending.v1');
  f.storage.setItem('quickreminders.settings.v1', '{');
  f.listeners.showConfiguration();
  assert.match(decodeURIComponent(f.urls[0]), /Could not load or save settings/);
  const setItem = f.storage.setItem;
  f.storage.setItem = () => { throw new Error('Private disk failure'); };
  f.listeners.webviewclosed({ response: encodeURIComponent(JSON.stringify({
    amTime: '08:30', pmTime: '19:15', ribbonColor: 226, autoClose: false
  })) });
  assert.match(decodeURIComponent(f.urls[1]), /Could not load or save settings/);
  assert.equal(f.deliveries.length, 1);
  assert.doesNotMatch(f.logs.join(''), /Private disk failure|Test in five minutes/);
  assert.equal(f.storage.getItem('quickreminders.pending.v1'), saved);
  f.storage.setItem = setItem;
  f.listeners.webviewclosed({ response: encodeURIComponent(JSON.stringify(require('../app/src/pkjs/defaults').initial)) });
  assert.equal(f.deliveries[1].payload.COMMAND, 'settings');
  assert.equal(f.storage.getItem('quickreminders.pending.v1'), saved);
});

test('settings share the serialized queue and retry on later replies after bounded synchronization failure', () => {
  const f = phone();
  f.listeners.ready();
  f.listeners.webviewclosed({ response: encodeURIComponent(JSON.stringify({
    amTime: '08:30', pmTime: '19:15', ribbonColor: 226, autoClose: false
  })) });
  assert.equal(f.deliveries.length, 1);
  f.deliveries[0].success();
  assert.equal(f.deliveries[1].payload.COMMAND, 'settings');
  for (let i = 1; i <= 3; i++) {
    f.deliveries[i].failure();
    if (i < 3) f.timers.shift()();
  }
  assert.equal(f.timers.length, 0);
  f.listeners.appmessage({ payload: { COMMAND: 'parse', REQUEST_ID: 5, TEXT: 'Test in five minutes' } });
  const draft = f.deliveries[4].payload;
  assert.equal(draft.REQUEST_ID, 5);
  assert.equal(draft.COMMAND, 'parse');
  assert.equal(draft.RIBBON_COLOR, 226);
  assert.equal(draft.AUTO_CLOSE, 0);
  assert.equal(draft.STATUS, 'draft');
  assert.equal(f.pins.length, 0);
});
