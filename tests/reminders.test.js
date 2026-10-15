'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../app/src/pkjs/parser');
const reminders = require('../app/src/pkjs/lib/reminders');
const controller = require('../app/src/pkjs/controller');

function fixture() {
  let now = Date.UTC(2026, 9, 14, 12);
  let raw = null;
  let failWrite = false;
  const pins = [];
  const storage = {
    getItem: () => raw,
    setItem: (key, value) => {
      if (failWrite) throw new Error('disk failure');
      raw = value;
    }
  };
  const pebble = { insertTimelinePin: pin => pins.push(pin) };
  const clock = () => now;
  return {
    storage, pebble, clock, pins,
    store: reminders.create(storage, pebble, clock),
    app: controller.create(storage, pebble, clock),
    draft: () => parser.parse('Synthetic example in 20 minutes', now),
    corrupt: value => { raw = value; },
    failWrite: () => { failWrite = true; },
    advance: milliseconds => { now += milliseconds; }
  };
}

test('draft/cancel/resume cause zero insertions; confirmation creates exactly one pin and reminder', () => {
  const f = fixture();
  const draft = f.store.next(f.draft());
  assert.equal(f.store.read().state, 'draft');
  assert.equal(f.pins.length, 0);
  f.store.cancel(draft.sequence);
  assert.equal(f.pins.length, 0);
  const next = f.store.next(f.draft());
  f.store.confirm(next.sequence);
  assert.equal(f.pins.length, 1);
  const pin = f.pins[0];
  assert.equal(pin.reminders.length, 1);
  assert.equal(pin.time, pin.reminders[0].time);
  assert.equal(pin.layout.title, 'Synthetic example');
  assert.equal(pin.createNotification, undefined);
  assert.equal(pin.actions, undefined);
  assert.ok(pin.id.length < 64);
  assert.equal(f.store.read().state, 'insertion-requested');
});

test('double confirm and stale tokens cannot mutate; retry preserves exact identity and time', () => {
  const f = fixture();
  const stale = f.store.next(f.draft());
  const current = f.store.next(f.draft());
  assert.throws(() => f.store.confirm(stale.sequence), /changed/);
  assert.throws(() => f.store.cancel(stale.sequence), /changed/);
  f.store.confirm(current.sequence);
  assert.throws(() => f.store.confirm(current.sequence), /submitted/);
  assert.throws(() => f.store.cancel(current.sequence), /submitted/);
  assert.throws(() => f.store.retry(stale.sequence), /matching/);
  f.advance(60000);
  f.store.retry(current.sequence);
  assert.deepEqual(f.pins[1], f.pins[0]);
});

test('reopening never replays pending insertion, including after a synchronous API failure', () => {
  const f = fixture();
  const draft = f.store.next(f.draft());
  f.pebble.insertTimelinePin = () => { throw new Error('phone failure'); };
  assert.throws(() => f.store.confirm(draft.sequence), /phone failure/);
  assert.equal(f.store.read().state, 'insertion-requested');
  const reopened = controller.create(f.storage, f.pebble, f.clock);
  assert.equal(reopened.handle({ COMMAND: 'ready' }).STATUS, 'pending');
  assert.equal(f.pins.length, 0);
});

test('persistence failures prevent mutation and unsupported local API remains recoverable', () => {
  const f = fixture();
  const draft = f.store.next(f.draft());
  f.failWrite();
  assert.throws(() => f.store.confirm(draft.sequence), /disk/);
  assert.equal(f.pins.length, 0);
  const g = fixture();
  const other = g.store.next(g.draft());
  delete g.pebble.insertTimelinePin;
  assert.throws(() => g.store.confirm(other.sequence), /Update the Pebble/);
  assert.equal(g.store.read().state, 'confirmed');
});

test('expired drafts and corrupt records fail explicitly without timeline calls', () => {
  const f = fixture();
  const draft = f.store.next(f.draft());
  f.advance(21 * 60000);
  assert.throws(() => f.store.confirm(draft.sequence), /passed/);
  for (const raw of [
    'not json', '{}', 'null',
    JSON.stringify({ version: 1, sequence: 1, state: 'bogus', id: 'qr-abc-1' }),
    JSON.stringify({ version: 1, sequence: 1, state: 'draft', id: 'qr-abc-1', value: {} })
  ]) {
    f.corrupt(raw);
    assert.throws(() => f.store.read(), /Stored reminder/);
  }
  assert.equal(f.pins.length, 0);
});

test('controller edits invalidate old tokens, and all mutation requires exact confirmation', () => {
  const f = fixture();
  assert.equal(f.app.handle({ COMMAND: 'ready' }).STATUS, 'home');
  let response = f.app.handle({ COMMAND: 'parse', TEXT: 'Synthetic example in 20 minutes' });
  const original = response.TOKEN;
  response = f.app.handle({ COMMAND: 'title', TOKEN: original, TEXT: 'Edited title' });
  assert.equal(response.TITLE, 'Edited title');
  assert.notEqual(response.TOKEN, original);
  assert.throws(() => f.app.handle({ COMMAND: 'confirm', TOKEN: original }), /changed/);
  response = f.app.handle({ COMMAND: 'time', TOKEN: response.TOKEN, TEXT: '2026-10-15 16:45' });
  assert.match(response.WHEN, /2026-10-15/);
  assert.equal(f.pins.length, 0);
  assert.equal(f.app.handle({ COMMAND: 'confirm', TOKEN: response.TOKEN }).STATUS, 'pending');
  assert.equal(f.pins.length, 1);
});

test('controller cancellation and invalid inputs cannot create pins', () => {
  const f = fixture();
  const draft = f.app.handle({ COMMAND: 'parse', TEXT: 'Synthetic example in 20 minutes' });
  assert.throws(() => f.app.handle({ COMMAND: 'time', TOKEN: draft.TOKEN, TEXT: 'bad' }), /Use/);
  assert.equal(f.app.handle({ COMMAND: 'cancel', TOKEN: draft.TOKEN }).STATUS, 'home');
  assert.throws(() => f.app.handle({ COMMAND: 'retry', TOKEN: draft.TOKEN }), /matching/);
  assert.throws(() => f.app.handle({ COMMAND: 'invented' }), /Unknown/);
  assert.throws(() => f.app.handle(null), /Invalid/);
  assert.equal(f.pins.length, 0);
});

test('expired drafts reopen as nonconfirmable and can be rescheduled or canceled', () => {
  const f = fixture();
  let response = f.app.handle({ COMMAND: 'parse', TEXT: 'Synthetic in 1 minute' });
  assert.equal(response.CAN_CONFIRM, 1);
  f.advance(2 * 60000);
  response = f.app.handle({ COMMAND: 'ready' });
  assert.equal(response.STATUS, 'draft');
  assert.equal(response.CAN_CONFIRM, 0);
  assert.throws(() => f.app.handle({ COMMAND: 'confirm', TOKEN: response.TOKEN }), /passed/);
  response = f.app.handle({ COMMAND: 'time', TOKEN: response.TOKEN, TEXT: '2026-10-15 16:45' });
  assert.equal(response.CAN_CONFIRM, 1);
  assert.equal(f.pins.length, 0);
  f.app.handle({ COMMAND: 'confirm', TOKEN: response.TOKEN });
  assert.equal(f.pins.length, 1);

  const g = fixture();
  const draft = g.store.next(g.draft());
  g.advance(21 * 60000);
  assert.equal(g.app.handle({ COMMAND: 'ready' }).CAN_CONFIRM, 0);
  g.app.handle({ COMMAND: 'cancel', TOKEN: draft.sequence });
  assert.equal(g.pins.length, 0);
});

test('timezone travel fences draft confirmation but preserves exact confirmed retry payload', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const f = fixture();
    const draft = f.store.next(f.draft());
    const g = fixture();
    const unconfirmed = g.store.next(g.draft());
    f.store.confirm(draft.sequence);
    process.env.TZ = 'Europe/Paris';
    assert.equal(f.app.handle({ COMMAND: 'ready' }).STATUS, 'pending');
    f.app.handle({ COMMAND: 'retry', TOKEN: draft.sequence });
    assert.deepEqual(f.pins[1], f.pins[0]);
    assert.throws(() => g.store.confirm(unconfirmed.sequence), /timezone/);
    assert.equal(g.store.read().state, 'draft');
    assert.equal(g.pins.length, 0);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
