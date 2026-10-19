'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../app/src/pkjs/parser');
const reminders = require('../app/src/pkjs/lib/reminders');
const controller = require('../app/src/pkjs/controller');
const defaults = require('../app/src/pkjs/defaults');
const settings = require('../app/src/pkjs/settings');

function fixture() {
  let now = Date.UTC(2026, 9, 14, 12);
  const data = new Map(), pins = [];
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const pebble = { insertTimelinePin: pin => pins.push(pin) };
  const clock = () => now;
  const app = controller.create(storage, pebble, clock);
  function send(COMMAND, extra) { return app.handle(Object.assign({ COMMAND }, extra)); }
  function add(title) {
    const draft = send('parse', { TEXT: title + ' in 20 minutes' });
    send('confirm', { TOKEN: draft.TOKEN });
    return pins[pins.length - 1];
  }
  return { data, storage, pebble, pins, clock, app, send, add, advance: ms => { now += ms; } };
}

test('Timeline selects older exact identity, previews then replaces same pin and fences latest retry', () => {
  const f = fixture();
  const older = f.add('Older synthetic'), newer = f.add('Newer synthetic');
  const latest = f.send('ready');
  const code = older.actions[0].launchCode;
  assert.notEqual(code, newer.actions[0].launchCode);
  assert.deepEqual(older.actions, [{ title: 'Snooze / change time', type: 'openWatchApp', launchCode: code }]);
  let edit = f.send('pin_open', { LAUNCH_CODE: code });
  assert.equal(edit.STATUS, 'schedule');
  assert.equal(edit.TITLE, 'Older synthetic');
  assert.equal(f.send('ready').TOKEN, latest.TOKEN);
  const source = edit.TOKEN;
  edit = f.send('pin_preset', { LAUNCH_CODE: code, TOKEN: source, TEXT: '0' });
  assert.equal(edit.STATUS, 'draft');
  assert.equal(edit.SECONDS_UNTIL, 300);
  assert.equal(f.pins.length, 2);
  f.advance(60000);
  f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: edit.TOKEN });
  const replaced = f.pins[2];
  assert.equal(replaced.id, older.id);
  assert.equal(replaced.time, '2026-10-14T12:05:00.000Z');
  assert.equal(replaced.layout.title, older.layout.title);
  assert.equal(replaced.reminders.length, 1);
  assert.equal(replaced.reminders[0].time, replaced.time);
  assert.equal(replaced.actions[0].launchCode, code);
  assert.throws(() => f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: edit.TOKEN }), /changed|submitted/);
  assert.throws(() => f.send('pin_preset', { LAUNCH_CODE: code, TOKEN: source, TEXT: '1' }), /changed/);
  assert.throws(() => f.send('pin_retry', { LAUNCH_CODE: newer.actions[0].launchCode, TOKEN: edit.TOKEN }), /matching|changed/);
  f.send('pin_retry', { LAUNCH_CODE: code, TOKEN: edit.TOKEN });
  assert.deepEqual(f.pins[3], replaced);

  const g = fixture(), pin = g.add('Latest synthetic');
  const oldToken = g.send('ready').TOKEN;
  const open = g.send('pin_open', { LAUNCH_CODE: pin.actions[0].launchCode });
  const draft = g.send('pin_time', { LAUNCH_CODE: open.LAUNCH_CODE, TOKEN: open.TOKEN, TEXT: 'in half an hour' });
  g.send('pin_confirm', { LAUNCH_CODE: open.LAUNCH_CODE, TOKEN: draft.TOKEN });
  assert.throws(() => g.send('retry', { TOKEN: oldToken }), /matching/);
  const recovery = g.send('ready');
  g.send('retry', { TOKEN: recovery.TOKEN });
  assert.deepEqual(g.pins[2], g.pins[1]);
});

test('Timeline cancel, missing target, stale source and reload never replay or select latest', () => {
  const f = fixture(), pin = f.add('Synthetic');
  const code = pin.actions[0].launchCode;
  const open = f.send('pin_open', { LAUNCH_CODE: code });
  f.send('pin_cancel', { LAUNCH_CODE: code, TOKEN: open.TOKEN });
  assert.throws(() => f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: open.TOKEN }));
  for (const LAUNCH_CODE of [undefined, 0, -1, 2147483647, code + 100]) {
    assert.throws(() => f.send('pin_open', { LAUNCH_CODE }));
  }
  const again = f.send('pin_open', { LAUNCH_CODE: code });
  const draft = f.send('pin_time', { LAUNCH_CODE: code, TOKEN: again.TOKEN, TEXT: 'en media hora' });
  f.pebble.insertTimelinePin = () => { throw new Error('synthetic API failure'); };
  assert.throws(() => f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: draft.TOKEN }), /synthetic/);
  const reopened = controller.create(f.storage, f.pebble, f.clock);
  const recovery = reopened.handle({ COMMAND: 'pin_open', LAUNCH_CODE: code });
  assert.equal(recovery.STATUS, 'pending');
  assert.equal(recovery.TOKEN, draft.TOKEN);
  assert.equal(f.pins.length, 1);
  f.pebble.insertTimelinePin = pin => f.pins.push(pin);
  reopened.handle({ COMMAND: 'pin_retry', LAUNCH_CODE: code, TOKEN: recovery.TOKEN });
  assert.equal(f.pins[1].time, '2026-10-14T12:30:00.000Z');
});

test('schedule-only parser shares bounded English/Spanish grammar without title/default fallback', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    const reference = Date.UTC(2026, 9, 14, 12);
    for (const [text, instant] of [
      ['in half an hour', reference + 1800000], ['en media hora', reference + 1800000],
      ['dentro de cinco minutos', reference + 300000], ['in twenty minutes', reference + 1200000],
      ['tomorrow at 8 PM', Date.UTC(2026, 9, 15, 20)], ['mañana a las tres PM', Date.UTC(2026, 9, 15, 15)],
      ['tomorrow', Date.UTC(2026, 9, 15, 10)], ['at 8:30 PM', Date.UTC(2026, 9, 14, 20, 30)]
    ]) {
      const draft = parser.parseTime(text, reference, defaults.initial, 'Preserved Café');
      assert.equal(draft.title, 'Preserved Café', text);
      assert.equal(draft.instant, instant, text);
      assert.equal(draft.reference, reference, text);
    }
    for (const text of ['buy milk', '', 'in zero minutes', 'in 0.5 hours', 'in five minutes 30 seconds',
      'in half an hours', 'tomorrow at 8 PM buy milk', 'buy milk in 5 minutes',
      'in 5 minutes tomorrow', 'at 25:00', 'every day', 'tomorrow at 8 PM UTC']) {
      assert.throws(() => parser.parseTime(text, reference, defaults.initial, 'Preserved'), undefined, text);
    }
    process.env.TZ = 'America/New_York';
    for (const [reference, text] of [
      [Date.UTC(2027, 2, 13, 12), 'tomorrow at 2:30 AM'],
      [Date.UTC(2026, 9, 31, 12), 'tomorrow at 1:30 AM']
    ]) assert.throws(() => parser.parseTime(text, reference, defaults.initial, 'Preserved'), /daylight|ambiguous|exist|twice/i);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('presets migrate missing field only, validate strictly and do not alias arrays', () => {
  const legacy = { amTime: '10:00', pmTime: '20:00', ribbonColor: 224, autoClose: true };
  const a = defaults.validate(legacy), b = defaults.validate(legacy);
  assert.deepEqual(a.snoozeMinutes, [5, 10, 30]);
  a.snoozeMinutes[0] = 99;
  assert.deepEqual(b.snoozeMinutes, [5, 10, 30]);
  for (const snoozeMinutes of [null, undefined, [], new Array(3), [1, 2], [0, 2, 3], [1.5, 2, 3], [1, 2, 10081], ['5', 10, 30]]) {
    assert.throws(() => defaults.validate(Object.assign({}, legacy, { snoozeMinutes })));
  }
});

test('two-days-past cleanup follows insertion, preserves future/active identities and monotonic allocation', () => {
  const f = fixture();
  const deleted = [];
  f.pebble.deleteTimelinePin = id => deleted.push(id);
  const old = f.add('Old'), futureDraft = f.send('parse', { TEXT: 'Future in 100 hours' });
  f.send('confirm', { TOKEN: futureDraft.TOKEN });
  const future = f.pins[1];
  const submitted = JSON.parse(JSON.stringify(f.pins));
  f.advance(49 * 3600000);
  f.add('Trigger');
  const envelope = JSON.parse(f.data.get('quickreminders.pending.v1'));
  assert.equal(envelope.version, 2);
  assert.ok(!envelope.pins.some(pin => pin.id === old.id));
  assert.ok(envelope.pins.some(pin => pin.id === future.id));
  assert.throws(() => f.send('pin_open', { LAUNCH_CODE: old.actions[0].launchCode }));
  assert.ok(f.pins[2].actions[0].launchCode > future.actions[0].launchCode);
  assert.deepEqual(deleted, []);
  assert.deepEqual(f.pins.slice(0, 2), submitted);
});

test('fresh action can reschedule a pin repeatedly; matched reload retains exact pending recovery', () => {
  const f = fixture(), pin = f.add('Synthetic');
  const code = pin.actions[0].launchCode;
  let open = f.send('pin_open', { LAUNCH_CODE: code });
  let draft = f.send('pin_preset', { LAUNCH_CODE: code, TOKEN: open.TOKEN, TEXT: '0' });
  f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: draft.TOKEN });
  assert.equal(f.send('pin_open', { LAUNCH_CODE: code, TOKEN: draft.TOKEN }).STATUS, 'pending');
  open = f.send('pin_open', { LAUNCH_CODE: code, TOKEN: 0 });
  assert.equal(open.STATUS, 'schedule');
  assert.ok(open.TOKEN > draft.TOKEN);
  draft = f.send('pin_preset', { LAUNCH_CODE: code, TOKEN: open.TOKEN, TEXT: '2' });
  f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: draft.TOKEN });
  assert.equal(f.pins[2].id, pin.id);
  assert.equal(f.pins[2].time, '2026-10-14T12:30:00.000Z');
});

test('opening another target never replaces an unrelated latest or active edit', () => {
  const f = fixture(), older = f.add('Older'), newer = f.add('Newer');
  const latest = f.send('parse', { TEXT: 'Unrelated draft in 10 minutes' });
  const open = f.send('pin_open', { LAUNCH_CODE: older.actions[0].launchCode });
  assert.throws(() => f.send('pin_open', { LAUNCH_CODE: newer.actions[0].launchCode }), /Another Timeline edit/);
  assert.equal(f.send('ready').TOKEN, latest.TOKEN);
  assert.equal(f.send('pin_state', { LAUNCH_CODE: open.LAUNCH_CODE }).TOKEN, open.TOKEN);
  f.send('pin_cancel', { LAUNCH_CODE: open.LAUNCH_CODE, TOKEN: open.TOKEN });
  assert.equal(f.send('pin_open', { LAUNCH_CODE: newer.actions[0].launchCode }).TITLE, 'Newer');
  assert.equal(f.pins.length, 2);
});

test('already due older pins use fresh captured reference and configured presets, not a moving confirmation clock', () => {
  const f = fixture(), pin = f.add('Older');
  f.add('Newer');
  f.advance(30 * 60000);
  settings.create(f.storage).save(Object.assign({}, defaults.initial, { snoozeMinutes: [7, 15, 45] }));
  const code = pin.actions[0].launchCode;
  const open = f.send('pin_open', { LAUNCH_CODE: code });
  assert.equal(open.STATUS, 'schedule');
  assert.equal(open.CAN_CONFIRM, 0);
  for (const TEXT of ['', '-1', '3', '0.0', 0, null, undefined]) {
    assert.throws(() => f.send('pin_preset', { LAUNCH_CODE: code, TOKEN: open.TOKEN, TEXT }), /preset/);
  }
  assert.throws(() => f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: open.TOKEN }), /changed|submitted/);
  const draft = f.send('pin_preset', { LAUNCH_CODE: code, TOKEN: open.TOKEN, TEXT: '0' });
  assert.equal(draft.SECONDS_UNTIL, 420);
  f.advance(2 * 60000);
  f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: draft.TOKEN });
  assert.equal(f.pins[2].time, '2026-10-14T12:37:00.000Z');
  assert.equal(f.pins[2].id, pin.id);
});

test('atomic v1 migration seeds only submitted identities and never inserts or automatically retries', () => {
  for (const state of ['draft', 'confirmed', 'insertion-requested', 'canceled']) {
    const f = fixture();
    const value = parser.parse('Legacy synthetic in 20 minutes', f.clock());
    const record = { version: 1, sequence: 12, id: 'qr-legacy-12', state };
    if (state !== 'canceled') record.value = value;
    f.data.set('quickreminders.pending.v1', JSON.stringify(record));
    f.send('ready');
    const saved = JSON.parse(f.data.get('quickreminders.pending.v1'));
    assert.equal(saved.version, 2);
    assert.equal(saved.sequence, 12);
    assert.equal(saved.latest.id, record.id);
    assert.equal(saved.edit, null);
    assert.equal(saved.pins.length, /confirmed|insertion-requested/.test(state) ? 1 : 0);
    assert.equal(f.pins.length, 0);
    const next = f.send('parse', { TEXT: 'Following synthetic in 10 minutes' });
    assert.equal(next.TOKEN, 13);
  }
});

test('v2 validation rejects corrupt nested identities, revisions, bounds, schedules and source snapshots', () => {
  const f = fixture(), pin = f.add('Synthetic');
  const open = f.send('pin_open', { LAUNCH_CODE: pin.actions[0].launchCode });
  const baseline = f.data.get('quickreminders.pending.v1');
  const corruptions = [
    e => { e.sequence = 0; }, e => { e.sequence = 2147483647; }, e => { e.sequence = 1.5; },
    e => { delete e.latest; }, e => { e.pins = {}; }, e => { e.pins.push(e.pins[0]); },
    e => { e.pins[0].launchCode = 0; }, e => { e.pins[0].revision = 0; },
    e => { delete e.pins[0].uncertain; }, e => { e.pins[0].value.instant = null; },
    e => { e.pins[0].value.instant = e.pins[0].value.reference; },
    e => { e.pins[0].value.instant = e.pins[0].value.reference + 367 * 86400000; },
    e => { e.latest.id = 'qr-other-1'; }, e => { e.latest.value.title = 'Changed'; },
    e => { e.edit.sourceRevision = open.TOKEN; }, e => { e.edit.sourceRevision = 0; },
    e => { e.edit.value.title = 'Wrong source'; }, e => { e.edit.value.instant += 60000; },
    e => { e.edit.state = 'invented'; }
  ];
  for (const mutate of corruptions) {
    const value = JSON.parse(baseline);
    mutate(value);
    f.data.set('quickreminders.pending.v1', JSON.stringify(value));
    assert.throws(() => f.send('pin_open', { LAUNCH_CODE: open.LAUNCH_CODE }), /Stored reminder/);
    assert.equal(f.pins.length, 1);
  }
  f.data.set('quickreminders.pending.v1', baseline);
  const exhausted = JSON.parse(baseline);
  exhausted.sequence = 2147483646;
  f.data.set('quickreminders.pending.v1', JSON.stringify(exhausted));
  assert.throws(() => f.send('parse', { TEXT: 'New in 10 minutes' }), /exhausted/);
  assert.equal(JSON.parse(f.data.get('quickreminders.pending.v1')).sequence, 2147483646);
});

test('failed edit persistence/API and post-insertion cleanup writes retain exact retry, without replay', () => {
  for (const failure of ['confirm', 'API', 'cleanup']) {
    const f = fixture(), pin = f.add('Synthetic');
    const code = pin.actions[0].launchCode;
    const open = f.send('pin_open', { LAUNCH_CODE: code });
    const draft = f.send('pin_time', { LAUNCH_CODE: code, TOKEN: open.TOKEN, TEXT: 'in ten minutes' });
    const originalWrite = f.storage.setItem;
    let writes = 0;
    f.storage.setItem = (key, value) => {
      writes++;
      if ((failure === 'confirm' && writes === 1) || (failure === 'cleanup' && writes === 3)) {
        throw new Error('Synthetic storage failure');
      }
      originalWrite(key, value);
    };
    if (failure === 'API') f.pebble.insertTimelinePin = () => { throw new Error('Synthetic API failure'); };
    assert.throws(() => f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: draft.TOKEN }), /Synthetic/);
    const count = f.pins.length;
    f.storage.setItem = originalWrite;
    f.pebble.insertTimelinePin = pin => f.pins.push(pin);
    const recovered = controller.create(f.storage, f.pebble, f.clock);
    const state = recovered.handle({ COMMAND: 'pin_open', LAUNCH_CODE: code, TOKEN: draft.TOKEN });
    assert.equal(state.TOKEN, draft.TOKEN);
    assert.equal(f.pins.length, count);
    recovered.handle({ COMMAND: failure === 'confirm' ? 'pin_confirm' : 'pin_retry',
      LAUNCH_CODE: code, TOKEN: state.TOKEN });
    assert.equal(f.pins.at(-1).id, pin.id);
    assert.equal(f.pins.at(-1).time, '2026-10-14T12:10:00.000Z');
    assert.equal(f.pins.at(-1).actions[0].launchCode, code);
  }
});

test('retention keeps boundary, active open edit, uncertain API record and future pin after insertion only', () => {
  const f = fixture(), active = f.add('Active'), uncertain = f.add('Uncertain');
  const draft = f.send('parse', { TEXT: 'Uncertain request in 20 minutes' });
  f.pebble.insertTimelinePin = () => { throw new Error('Synthetic'); };
  assert.throws(() => f.send('confirm', { TOKEN: draft.TOKEN }));
  f.pebble.insertTimelinePin = pin => f.pins.push(pin);
  f.send('pin_open', { LAUNCH_CODE: active.actions[0].launchCode });
  f.advance(48 * 3600000 + 20 * 60000);
  f.add('At boundary');
  let envelope = JSON.parse(f.data.get('quickreminders.pending.v1'));
  assert.ok(envelope.pins.some(pin => pin.id === uncertain.id));
  f.advance(1);
  // Reading is deliberately not a cleanup operation.
  f.send('ready');
  assert.ok(JSON.parse(f.data.get('quickreminders.pending.v1')).pins.some(pin => pin.id === uncertain.id));
  f.add('After boundary');
  envelope = JSON.parse(f.data.get('quickreminders.pending.v1'));
  assert.ok(!envelope.pins.some(pin => pin.id === uncertain.id));
  assert.ok(envelope.pins.some(pin => pin.id === active.id));
  assert.ok(envelope.pins.some(pin => pin.id.endsWith('-' + draft.TOKEN) && pin.uncertain));
  const edit = f.send('pin_state', { LAUNCH_CODE: active.actions[0].launchCode });
  f.send('pin_cancel', { LAUNCH_CODE: edit.LAUNCH_CODE, TOKEN: edit.TOKEN });
  f.add('After cancellation');
  assert.equal(f.send('ready').STATUS, 'pending');
  assert.equal(JSON.parse(f.data.get('quickreminders.pending.v1')).edit, null);
  assert.throws(() => f.send('pin_open', { LAUNCH_CODE: active.actions[0].launchCode }), /expired/);
});

test('Timeline spoken edits fence timezone travel and preserve exact submitted retry across zones', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const f = fixture(), pin = f.add('Synthetic');
    const code = pin.actions[0].launchCode;
    const open = f.send('pin_open', { LAUNCH_CODE: code });
    const draft = f.send('pin_time', { LAUNCH_CODE: code, TOKEN: open.TOKEN, TEXT: 'tomorrow at 8 PM' });
    process.env.TZ = 'Europe/Paris';
    assert.equal(f.send('pin_open', { LAUNCH_CODE: code, TOKEN: draft.TOKEN }).CAN_CONFIRM, 0);
    assert.throws(() => f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: draft.TOKEN }), /timezone/);
    assert.equal(f.pins.length, 1);
    process.env.TZ = 'America/New_York';
    f.send('pin_confirm', { LAUNCH_CODE: code, TOKEN: draft.TOKEN });
    process.env.TZ = 'Europe/Paris';
    f.send('pin_retry', { LAUNCH_CODE: code, TOKEN: draft.TOKEN });
    assert.deepEqual(f.pins[2], f.pins[1]);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
