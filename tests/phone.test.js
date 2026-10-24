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

test('recognition additions phone creation and Timeline edits share exact confirmed schedules', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    for (const [schedule, instant, when] of [
      ['at eight thirty', Date.UTC(2026, 9, 14, 20, 30), '2026-10-14 8:30 PM'],
      ['a las ocho y cuarto p. m.', Date.UTC(2026, 9, 14, 20, 15), '2026-10-14 8:15 PM'],
      ['at quarter to twelve AM', Date.UTC(2026, 9, 14, 23, 45), '2026-10-14 11:45 PM'],
      ['tonight', Date.UTC(2026, 9, 14, 20), '2026-10-14 8:00 PM'],
      ['pasado mañana', Date.UTC(2026, 9, 16, 10), '2026-10-16 10:00 AM'],
      ['in two days', Date.UTC(2026, 9, 16, 12), '2026-10-16 12:00 PM'],
      ['dentro de una semana', Date.UTC(2026, 9, 21, 12), '2026-10-21 12:00 PM']
    ]) {
      for (const edit of [false, true]) {
        let now = Date.UTC(2026, 9, 14, 12);
        const f = phone(undefined, () => now);
        function exchange(COMMAND, extra) {
          const index = f.deliveries.length;
          f.listeners.appmessage({ payload: Object.assign({ COMMAND }, extra) });
          const result = f.deliveries[index].payload;
          f.deliveries[index].success();
          return result;
        }
        let open, code, id;
        if (edit) {
          const original = exchange('parse', { TEXT: 'Preserved Café in five minutes' });
          exchange('confirm', { TOKEN: original.TOKEN });
          code = f.pins[0].actions[0].launchCode;
          id = f.pins[0].id;
          open = exchange('pin_open', { LAUNCH_CODE: code });
        }
        const draft = edit ?
          exchange('pin_time', { LAUNCH_CODE: code, TOKEN: open.TOKEN, TEXT: schedule }) :
          exchange('parse', { TEXT: 'Por favor recuérdame Preserved Café ' + schedule });
        assert.equal(draft.STATUS, 'draft', schedule);
        assert.equal(draft.TITLE, 'Preserved Café', schedule);
        assert.equal(draft.WHEN, when, schedule);
        assert.equal(draft.CAN_CONFIRM, 1, schedule);
        assert.equal(draft.SECONDS_UNTIL, (instant - now) / 1000, schedule);
        assert.equal(f.pins.length, edit ? 1 : 0);
        now += 60000;
        const replay = edit ?
          exchange('pin_open', { LAUNCH_CODE: code, TOKEN: draft.TOKEN }) : exchange('ready');
        assert.equal(replay.TOKEN, draft.TOKEN);
        assert.equal(replay.WHEN, when);
        assert.equal(f.pins.length, edit ? 1 : 0);
        exchange(edit ? 'pin_confirm' : 'confirm', { LAUNCH_CODE: code, TOKEN: draft.TOKEN });
        assert.equal(f.pins.length, edit ? 2 : 1);
        const pin = f.pins.at(-1);
        if (edit) assert.equal(pin.id, id);
        assert.equal(pin.layout.title, 'Preserved Café');
        assert.equal(pin.time, new Date(instant).toISOString());
        assert.equal(pin.reminders.length, 1);
        assert.equal(pin.reminders[0].time, pin.time);
        exchange(edit ? 'pin_confirm' : 'confirm', { LAUNCH_CODE: code, TOKEN: draft.TOKEN });
        assert.equal(f.pins.length, edit ? 2 : 1);
        assert.doesNotMatch(f.logs.join(''), /Café|quarter|semana|recuerda|eight/i);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('recognition additions phone errors, cancellation and travel never submit unreviewed times', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    for (const phrase of [
      'Test at eight sixty', 'Test at 8 p.', 'Test in zero days',
      'Test in two days tomorrow', 'Test this morning',
      'Test 2027-02-30 at quarter to twelve AM',
      'Test pasado mañana at 8 PM in five minutes'
    ]) {
      const f = phone();
      f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: phrase } });
      const error = f.deliveries[0].payload;
      f.deliveries[0].success();
      assert.ok(error.ERROR, phrase);
      assert.notEqual(error.CAN_CONFIRM, 1, phrase);
      f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: error.TOKEN } });
      assert.equal(f.pins.length, 0);
      assert.doesNotMatch(f.logs.join(''), /eight|zero|mañana|Test/);
    }
    for (const travel of [false, true]) {
      process.env.TZ = 'UTC';
      const f = phone();
      function exchange(COMMAND, extra) {
        const index = f.deliveries.length;
        f.listeners.appmessage({ payload: Object.assign({ COMMAND }, extra) });
        const result = f.deliveries[index].payload;
        f.deliveries[index].success();
        return result;
      }
      const draft = exchange('parse', { TEXT: "Don't forget to Test en dos días" });
      assert.equal(draft.STATUS, 'draft');
      if (travel) {
        process.env.TZ = 'America/New_York';
        const restored = exchange('ready');
        assert.equal(restored.CAN_CONFIRM, 0);
        assert.match(restored.ERROR, /timezone/);
      } else {
        assert.equal(exchange('cancel', { TOKEN: draft.TOKEN }).STATUS, 'home');
      }
      assert.ok(exchange('confirm', { TOKEN: draft.TOKEN }).ERROR);
      assert.equal(f.pins.length, 0);
      assert.doesNotMatch(f.logs.join(''), /forget|Test|dos/);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('Recuerda time-only phone drafts use today and insert only after confirmation', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const f = phone();
    function exchange(COMMAND, extra) {
      const index = f.deliveries.length;
      f.listeners.appmessage({ payload: Object.assign({ COMMAND }, extra) });
      const result = f.deliveries[index].payload;
      f.deliveries[index].success();
      return result;
    }
    const draft = exchange('parse', { TEXT: 'Recuerda a las 8:00 poner a lavar' });
    assert.equal(draft.STATUS, 'draft');
    assert.equal(draft.TITLE, 'poner a lavar');
    assert.equal(draft.WHEN, '2026-10-14 8:00 PM');
    assert.equal(draft.CAN_CONFIRM, 1);
    assert.equal(draft.SECONDS_UNTIL, 8 * 3600);
    assert.equal(f.pins.length, 0);
    f.listeners.ready();
    assert.equal(f.deliveries.at(-1).payload.TOKEN, draft.TOKEN);
    f.deliveries.at(-1).success();
    assert.equal(f.pins.length, 0);
    exchange('confirm', { TOKEN: draft.TOKEN });
    assert.equal(f.pins.length, 1);
    assert.equal(f.pins[0].layout.title, 'poner a lavar');
    assert.equal(f.pins[0].time, '2026-10-14T20:00:00.000Z');
    assert.equal(f.pins[0].reminders.length, 1);
    assert.equal(f.pins[0].reminders[0].time, f.pins[0].time);
    assert.deepEqual(f.logs, []);
    exchange('confirm', { TOKEN: draft.TOKEN });
    assert.equal(f.pins.length, 1);
    assert.doesNotMatch(f.logs.join(''), /Recuerda|poner|lavar|8:00/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('Recuerda and English clock-boundary drafts cancel without inserting or replaying', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    for (const [hour, when, seconds] of [
      [8, '2026-10-14 8:00 PM', 12 * 3600],
      [20, '2026-10-15 8:00 AM', 12 * 3600]
    ]) {
      for (const [phrase, title] of [
        ['Recuerda a las 8:00 revisar Cafe', 'revisar Cafe'],
        ['Remind me at 8:00 to Check AM radio', 'Check AM radio']
      ]) {
        const f = phone(undefined, () => Date.UTC(2026, 9, 14, hour));
        function exchange(COMMAND, extra) {
          const index = f.deliveries.length;
          f.listeners.appmessage({ payload: Object.assign({ COMMAND }, extra) });
          const result = f.deliveries[index].payload;
          f.deliveries[index].success();
          return result;
        }
        const draft = exchange('parse', { TEXT: phrase });
        assert.equal(draft.STATUS, 'draft');
        assert.equal(draft.TITLE, title);
        assert.equal(draft.WHEN, when);
        assert.equal(draft.CAN_CONFIRM, 1);
        assert.equal(draft.SECONDS_UNTIL, seconds);
        assert.equal(f.pins.length, 0);
        assert.deepEqual(f.logs, []);
        assert.equal(exchange('cancel', { TOKEN: draft.TOKEN }).STATUS, 'home');
        assert.ok(exchange('confirm', { TOKEN: draft.TOKEN }).ERROR);
        f.listeners.ready();
        f.deliveries.at(-1).success();
        assert.equal(f.pins.length, 0);
        assert.deepEqual(f.logs, ['QuickReminders: request failed.']);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('Recuerda invalid clocks cannot fall back to defaults or insert a pin', () => {
  const f = phone();
  f.listeners.appmessage({ payload: { COMMAND: 'parse', TEXT: 'Recuerda a las 8:60 poner a lavar' } });
  const rejected = f.deliveries[0].payload;
  assert.ok(rejected.ERROR);
  assert.notEqual(rejected.CAN_CONFIRM, 1);
  f.deliveries[0].success();
  f.listeners.appmessage({ payload: { COMMAND: 'confirm', TOKEN: rejected.TOKEN } });
  assert.equal(f.pins.length, 0);
  assert.doesNotMatch(f.logs.join(''), /Recuerda|poner|lavar|8:60/);
});

test('Timeline timezone-error replay can cancel its exact draft and then open another pin', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const f = phone();
    function exchange(COMMAND, extra) {
      const index = f.deliveries.length;
      f.listeners.appmessage({ payload: Object.assign({ COMMAND }, extra) });
      const result = f.deliveries[index].payload;
      f.deliveries[index].success();
      return result;
    }
    const older = exchange('parse', { TEXT: 'Older synthetic in 20 minutes' });
    exchange('confirm', { TOKEN: older.TOKEN });
    const newer = exchange('parse', { TEXT: 'Newer synthetic in 30 minutes' });
    exchange('confirm', { TOKEN: newer.TOKEN });
    const code = f.pins[0].actions[0].launchCode, other = f.pins[1].actions[0].launchCode;
    const open = exchange('pin_open', { LAUNCH_CODE: code });
    const draft = exchange('pin_time', { LAUNCH_CODE: code, TOKEN: open.TOKEN, TEXT: 'tomorrow at 8 PM' });
    process.env.TZ = 'Europe/Paris';
    for (let replay = 0; replay < 2; replay++) {
      const error = exchange('pin_open', { LAUNCH_CODE: code, TOKEN: draft.TOKEN });
      assert.equal(error.STATUS, 'draft');
      assert.equal(error.CAN_CONFIRM, 0);
      assert.equal(error.TOKEN, draft.TOKEN);
      assert.equal(error.LAUNCH_CODE, code);
      assert.match(error.ERROR, /timezone/);
    }
    const blocked = exchange('pin_open', { LAUNCH_CODE: other });
    assert.equal(blocked.STATUS, 'error');
    assert.match(blocked.ERROR, /Another Timeline edit/);
    const canceled = exchange('pin_cancel', { LAUNCH_CODE: code, TOKEN: draft.TOKEN });
    assert.equal(canceled.STATUS, 'home');
    assert.equal(canceled.TOKEN, 0);
    assert.equal(canceled.LAUNCH_CODE, code);
    assert.equal(JSON.parse(f.storage.getItem('quickreminders.pending.v1')).edit, null);
    const switched = exchange('pin_open', { LAUNCH_CODE: other });
    assert.equal(switched.STATUS, 'schedule');
    assert.equal(switched.TITLE, 'Newer synthetic');
    assert.equal(switched.LAUNCH_CODE, other);
    assert.equal(f.pins.length, 2);
    assert.doesNotMatch(f.logs.join(''), /Older|Newer|synthetic/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('Timeline cancellation failure recovers exact open edit; pending uncertain edits cannot be canceled', () => {
  for (const submitted of [false, true]) {
    const f = phone();
    function exchange(COMMAND, extra) {
      const index = f.deliveries.length;
      f.listeners.appmessage({ payload: Object.assign({ COMMAND }, extra) });
      const result = f.deliveries[index].payload;
      f.deliveries[index].success();
      return result;
    }
    const draft = exchange('parse', { TEXT: 'Older synthetic in 20 minutes' });
    exchange('confirm', { TOKEN: draft.TOKEN });
    const newer = exchange('parse', { TEXT: 'Newer synthetic in 30 minutes' });
    exchange('confirm', { TOKEN: newer.TOKEN });
    const code = f.pins[0].actions[0].launchCode, other = f.pins[1].actions[0].launchCode;
    let edit = exchange('pin_open', { LAUNCH_CODE: code });
    const write = f.storage.setItem;
    if (submitted) {
      edit = exchange('pin_preset', { LAUNCH_CODE: code, TOKEN: edit.TOKEN, TEXT: '0' });
      f.pebble.insertTimelinePin = () => { throw new Error('Private synthetic platform failure'); };
      const error = exchange('pin_confirm', { LAUNCH_CODE: code, TOKEN: edit.TOKEN });
      assert.equal(error.STATUS, 'pending');
      assert.ok(error.ERROR);
    } else {
      f.storage.setItem = () => { throw new Error('Private synthetic storage failure'); };
    }
    const failed = exchange('pin_cancel', { LAUNCH_CODE: code, TOKEN: edit.TOKEN });
    assert.ok(failed.ERROR);
    assert.notEqual(failed.STATUS, 'home');
    assert.equal(failed.TOKEN, edit.TOKEN);
    assert.equal(failed.LAUNCH_CODE, code);
    assert.equal(failed.CAN_CONFIRM, 0);
    f.storage.setItem = write;
    const recovery = exchange('pin_open', { LAUNCH_CODE: code, TOKEN: edit.TOKEN });
    assert.equal(recovery.STATUS, submitted ? 'pending' : 'schedule');
    assert.equal(recovery.TOKEN, edit.TOKEN);
    if (submitted) {
      assert.equal(exchange('pin_open', { LAUNCH_CODE: other }).STATUS, 'error');
      assert.equal(JSON.parse(f.storage.getItem('quickreminders.pending.v1')).edit.state, 'insertion-requested');
    } else {
      assert.equal(exchange('pin_cancel', { LAUNCH_CODE: code, TOKEN: edit.TOKEN }).STATUS, 'home');
      assert.equal(exchange('pin_open', { LAUNCH_CODE: other }).STATUS, 'schedule');
    }
    assert.equal(f.pins.length, 2);
    assert.doesNotMatch(f.logs.join(''), /Private|Older|Newer|synthetic/);
  }
});

test('Timeline phone wire selects exact older pin, captures voice reference and replaces only after confirmation', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    let now = Date.UTC(2026, 9, 14, 12);
    const f = phone(undefined, () => now);
    let request = 0;
    function exchange(COMMAND, extra) {
      const index = f.deliveries.length;
      f.listeners.appmessage({ payload: Object.assign({ COMMAND, REQUEST_ID: ++request }, extra) });
      const result = f.deliveries[index].payload;
      assert.equal(result.COMMAND, COMMAND);
      assert.equal(result.REQUEST_ID, request);
      f.deliveries[index].success();
      return result;
    }
    const a = exchange('parse', { TEXT: 'Older synthetic in 20 minutes' });
    exchange('confirm', { TOKEN: a.TOKEN });
    const b = exchange('parse', { TEXT: 'Newer synthetic in 30 minutes' });
    exchange('confirm', { TOKEN: b.TOKEN });
    const code = f.pins[0].actions[0].launchCode;
    // Initial unsolicited readiness is unrelated to the requested Timeline item.
    f.listeners.ready();
    assert.equal(f.deliveries.at(-1).payload.TITLE, 'Newer synthetic');
    assert.equal(f.deliveries.at(-1).payload.REQUEST_ID, 0);
    f.deliveries.at(-1).success();
    let edit = exchange('pin_open', { LAUNCH_CODE: code, TOKEN: 0 });
    assert.equal(edit.STATUS, 'schedule');
    assert.equal(edit.TITLE, 'Older synthetic');
    assert.equal(edit.LAUNCH_CODE, code);
    assert.deepEqual([edit.SNOOZE_1, edit.SNOOZE_2, edit.SNOOZE_3], [5, 10, 30]);
    edit = exchange('pin_time', { LAUNCH_CODE: code, TOKEN: edit.TOKEN, TEXT: 'en media hora' });
    assert.equal(edit.STATUS, 'draft');
    assert.equal(edit.TITLE, 'Older synthetic');
    assert.equal(edit.WHEN, '2026-10-14 12:30 PM');
    assert.equal(edit.CAN_CONFIRM, 1);
    assert.equal(edit.SECONDS_UNTIL, 1800);
    assert.equal(f.pins.length, 2);
    now += 5 * 60000;
    const pending = exchange('pin_confirm', { LAUNCH_CODE: code, TOKEN: edit.TOKEN });
    assert.equal(pending.STATUS, 'pending');
    assert.equal(pending.TOKEN, edit.TOKEN);
    assert.equal(pending.LAUNCH_CODE, code);
    assert.equal(f.pins.length, 3);
    assert.equal(f.pins[2].id, f.pins[0].id);
    assert.equal(f.pins[2].actions[0].launchCode, code);
    assert.equal(f.pins[2].time, '2026-10-14T12:30:00.000Z');
    assert.equal(f.pins[2].reminders.length, 1);
    assert.equal(f.pins[2].reminders[0].time, f.pins[2].time);
    assert.deepEqual(f.logs, []);
    exchange('pin_confirm', { LAUNCH_CODE: code, TOKEN: edit.TOKEN });
    assert.equal(f.pins.length, 3);
    assert.doesNotMatch(f.logs.join(''), /Older|Newer|synthetic|media/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('Timeline phone errors never recover latest, enable failed previews, insert on cancellation or expose payloads', () => {
  const f = phone();
  function exchange(COMMAND, extra) {
    const index = f.deliveries.length;
    f.listeners.appmessage({ payload: Object.assign({ COMMAND }, extra) });
    const result = f.deliveries[index].payload;
    f.deliveries[index].success();
    return result;
  }
  const latest = exchange('parse', { TEXT: 'Unrelated private synthetic in 20 minutes' });
  exchange('confirm', { TOKEN: latest.TOKEN });
  const code = f.pins[0].actions[0].launchCode;
  const open = exchange('pin_open', { LAUNCH_CODE: code });
  for (const TEXT of ['in zero minutes', 'tomorrow at 8 PM extra title', 'ordinary title only']) {
    const error = exchange('pin_time', { LAUNCH_CODE: code, TOKEN: open.TOKEN, TEXT });
    assert.equal(error.STATUS, 'schedule');
    assert.equal(error.LAUNCH_CODE, code);
    assert.equal(error.CAN_CONFIRM, 0);
    assert.ok(error.ERROR);
    assert.equal(f.pins.length, 1);
  }
  for (const LAUNCH_CODE of [undefined, 0, code + 100]) {
    const error = exchange('pin_open', { LAUNCH_CODE });
    assert.equal(error.STATUS, 'error');
    assert.equal(error.TITLE, undefined);
    assert.equal(error.TOKEN, undefined);
    assert.ok(error.ERROR);
  }
  const preview = exchange('pin_preset', { LAUNCH_CODE: code, TOKEN: open.TOKEN, TEXT: '2' });
  exchange('pin_cancel', { LAUNCH_CODE: code, TOKEN: preview.TOKEN });
  const error = exchange('pin_confirm', { LAUNCH_CODE: code, TOKEN: preview.TOKEN });
  assert.notEqual(error.CAN_CONFIRM, 1);
  assert.equal(f.pins.length, 1);
  assert.doesNotMatch(f.logs.join(''), /private|synthetic|extra|ordinary/);
});

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
      'Tomorrow at eight sixty p.m., remind me to buy bread',
      ...['Tomorrow at 8', 'Mañana a las ocho', 'At 8'].flatMap(schedule =>
        ['p.', 'a.', 'p', 'a', 'a ', 'p '].flatMap(qualifier =>
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
  const value = { amTime: '08:30', pmTime: '19:15', ribbonColor: 226, autoClose: false, snoozeMinutes: [7, 15, 45] };
  f.listeners.showConfiguration();
  assert.match(f.urls[0], /^data:text\/html/);
  f.listeners.webviewclosed({ response: encodeURIComponent(JSON.stringify(value)) });
  assert.deepEqual(preferences.read(), value);
  assert.equal(f.deliveries[0].payload.COMMAND, 'settings');
  assert.equal(f.deliveries[0].payload.RIBBON_COLOR, 226);
  assert.equal(f.deliveries[0].payload.AUTO_CLOSE, 0);
  assert.deepEqual([f.deliveries[0].payload.SNOOZE_1, f.deliveries[0].payload.SNOOZE_2,
    f.deliveries[0].payload.SNOOZE_3], [7, 15, 45]);
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
