/**
 * Copyright 2025 Google LLC
 * Licensed under the Apache License, Version 2.0 (see LICENSE).
 * Adapted from TomBolger/Billy app/src/pkjs/lib/reminders.js.
 */
'use strict';

var parser = require('../parser');
var KEY = 'quickreminders.pending.v1';
var MAX = 2147483646;

function integer(value, minimum) {
  return typeof value === 'number' && isFinite(value) &&
    Math.floor(value) === value && value >= minimum && value <= MAX;
}

function invalid() {
  parser.fail('Stored reminder is invalid. Phone app data needs recovery.');
}

function valueValid(value) {
  return value && typeof value.title === 'string' && typeof value.zone === 'string' && value.zone.length > 0 &&
    typeof value.instant === 'number' && isFinite(value.instant) &&
    typeof value.reference === 'number' && isFinite(value.reference) &&
    Math.floor(value.instant) === value.instant && Math.floor(value.reference) === value.reference &&
    !isNaN(new Date(value.instant).getTime()) && !isNaN(new Date(value.reference).getTime()) &&
    value.instant > value.reference && value.instant <= value.reference + 366 * 86400000 &&
    parser.title(value.title) === value.title;
}

function identity(record) {
  return record && typeof record.id === 'string' && /^qr-[a-z0-9]+-\d+$/.test(record.id);
}

function sameValue(a, b) {
  return a.title === b.title && a.instant === b.instant && a.reference === b.reference && a.zone === b.zone;
}

function create(storage, pebble, now) {
  function save(envelope) {
    storage.setItem(KEY, JSON.stringify(envelope));
  }

  function snapshot() {
    var raw = storage.getItem(KEY);
    if (raw === null || raw === undefined) {
      return { version: 2, sequence: 0, latest: null, edit: null, pins: [] };
    }
    var envelope, migrated = false;
    try { envelope = JSON.parse(raw); } catch (error) { invalid(); }
    if (envelope && envelope.version === 1) {
      var legacy = envelope;
      if (!integer(legacy.sequence, 0) || !identity(legacy) ||
          ['draft', 'confirmed', 'insertion-requested', 'canceled'].indexOf(legacy.state) < 0 ||
          (legacy.state !== 'canceled' && !valueValid(legacy.value))) invalid();
      delete legacy.version;
      // The v1 validator ignored canceled values; v2 stores only the cancellation.
      if (legacy.state === 'canceled') delete legacy.value;
      legacy.sequence = Math.max(1, legacy.sequence);
      legacy.launchCode = Math.max(1, legacy.sequence);
      envelope = { version: 2, sequence: Math.max(1, legacy.sequence), latest: legacy, edit: null, pins: [] };
      if (legacy.state === 'confirmed' || legacy.state === 'insertion-requested') {
        envelope.pins.push({
          id: legacy.id, launchCode: legacy.launchCode, value: legacy.value,
          revision: legacy.sequence, uncertain: true
        });
      }
      migrated = true;
    }
    if (!envelope || envelope.version !== 2 || !integer(envelope.sequence, 0) ||
        !Array.isArray(envelope.pins) || !Object.prototype.hasOwnProperty.call(envelope, 'latest') ||
        !Object.prototype.hasOwnProperty.call(envelope, 'edit')) invalid();
    var codes = {}, ids = {};
    envelope.pins.forEach(function(pin) {
      if (!identity(pin) || !integer(pin.launchCode, 1) || pin.launchCode > envelope.sequence ||
          !integer(pin.revision, pin.launchCode) || pin.revision > envelope.sequence ||
          !valueValid(pin.value) || typeof pin.uncertain !== 'boolean' ||
          codes[pin.launchCode] || ids[pin.id]) invalid();
      codes[pin.launchCode] = pin;
      ids[pin.id] = pin;
    });
    ['latest', 'edit'].forEach(function(slot) {
      var record = envelope[slot];
      if (record === null) return;
      if (!identity(record) || !integer(record.sequence, 1) || record.sequence > envelope.sequence ||
          !integer(record.launchCode, 1) || record.launchCode > envelope.sequence ||
          record.sequence < record.launchCode ||
          ['open', 'draft', 'confirmed', 'insertion-requested', 'canceled'].indexOf(record.state) < 0 ||
          (slot === 'latest' && record.state === 'open') ||
          (slot === 'edit' && record.state === 'canceled') ||
          (record.state !== 'canceled' && !valueValid(record.value)) ||
          (record.state === 'canceled' && Object.prototype.hasOwnProperty.call(record, 'value')) ||
          (slot === 'edit' && (!integer(record.sourceRevision, record.launchCode) ||
            record.sourceRevision >= record.sequence))) invalid();
      var pin = codes[record.launchCode];
      if ((pin && pin.id !== record.id) || (ids[record.id] && ids[record.id].launchCode !== record.launchCode)) invalid();
      if (slot === 'latest' && (record.state === 'draft' || record.state === 'canceled') && pin) invalid();
      if (slot === 'edit' && record.state !== 'canceled' &&
          (!pin || record.value.title !== pin.value.title ||
           (record.state === 'open' && !sameValue(record.value, pin.value)))) invalid();
      if (slot === 'edit' && (!pin || (pin.revision !== record.sourceRevision &&
          !((record.state === 'confirmed' || record.state === 'insertion-requested') &&
            pin.revision === record.sequence)))) invalid();
      if ((record.state === 'confirmed' || record.state === 'insertion-requested') &&
          (!pin || pin.revision !== record.sequence ||
            !sameValue(pin.value, record.value))) invalid();
    });
    if (envelope.latest && envelope.edit && envelope.latest.sequence === envelope.edit.sequence &&
        envelope.latest.id !== envelope.edit.id) invalid();
    if (migrated) save(envelope);
    return envelope;
  }

  function allocate(envelope) {
    if (envelope.sequence >= MAX) parser.fail('Reminder sequence exhausted. Phone app data needs recovery.');
    return ++envelope.sequence;
  }

  function read() { return snapshot().latest; }

  function next(value) {
    parser.validate(value, now(), 'edit');
    var envelope = snapshot();
    var sequence = allocate(envelope);
    var record = {
      sequence: sequence, id: 'qr-' + now().toString(36) + '-' + sequence,
      launchCode: sequence, state: 'draft', value: value
    };
    envelope.latest = record;
    save(envelope);
    return record;
  }

  function pinFor(envelope, code) {
    if (!integer(code, 1)) parser.fail('Missing or invalid Timeline target.');
    var pin = envelope.pins.filter(function(pin) { return pin.launchCode === code; })[0];
    if (!pin) parser.fail('This Timeline reminder is unavailable or expired.');
    return pin;
  }

  function open(code, token) {
    var envelope = snapshot(), pin = pinFor(envelope, code);
    if (envelope.edit && envelope.edit.launchCode === code && envelope.edit.state !== 'canceled') {
      var state = envelope.edit.state;
      if (state === 'open' || state === 'draft' ||
          (pin.value.instant > now() && (pin.uncertain ||
            (token && token === envelope.edit.sequence)))) return envelope.edit;
    }
    if (envelope.edit && envelope.edit.launchCode !== code && envelope.edit.state !== 'canceled') {
      var previousPin = pinFor(envelope, envelope.edit.launchCode);
      if (envelope.edit.state === 'open' || envelope.edit.state === 'draft' || previousPin.uncertain) {
        parser.fail('Another Timeline edit needs recovery. Open its pin to cancel or retry first.');
      }
    }
    envelope.edit = {
      sequence: allocate(envelope), id: pin.id, launchCode: code, state: 'open',
      value: pin.value, sourceRevision: pin.revision
    };
    save(envelope);
    return envelope.edit;
  }

  function matching(envelope, slot, token, code) {
    var record = envelope[slot];
    if (!record || record.sequence !== token || (slot === 'edit' && record.launchCode !== code)) {
      parser.fail('No matching draft or pending insertion. Draft changed.');
    }
    if (slot === 'edit') {
      var pin = pinFor(envelope, code);
      var expected = record.state === 'confirmed' || record.state === 'insertion-requested' ?
        record.sequence : record.sourceRevision;
      if (pin.revision !== expected) parser.fail('Source reminder changed. Open its Timeline action again.');
    }
    return record;
  }

  function edit(code, token, makeValue) {
    var envelope = snapshot(), record = matching(envelope, 'edit', token, code);
    if (record.state !== 'open' && record.state !== 'draft') parser.fail('Draft changed or already submitted.');
    var reference = now();
    var value = makeValue(record.value.title, reference);
    parser.validate(value, reference);
    record.sequence = allocate(envelope);
    record.state = 'draft';
    record.value = value;
    save(envelope);
    return record;
  }

  function prune(envelope) {
    envelope.pins = envelope.pins.filter(function(pin) {
      return pin.uncertain || pin.value.instant >= now() - 2 * 86400000 ||
        ['latest', 'edit'].some(function(slot) {
          var record = envelope[slot];
          return record && record.state !== 'canceled' && record.id === pin.id;
        });
    });
  }

  function insert(envelope, record) {
    parser.validate(record.value, now(), 'retry');
    if (typeof pebble.insertTimelinePin !== 'function') {
      parser.fail('Update the Pebble phone app: local pins are unavailable.');
    }
    var pin = pinFor(envelope, record.launchCode);
    if (pin.revision !== record.sequence) parser.fail('Source reminder changed. Do not retry the old insertion.');
    record.state = 'insertion-requested';
    pin.uncertain = true;
    save(envelope);
    // There is no watch-delivery acknowledgement. A throw is an uncertain call.
    pebble.insertTimelinePin(buildPin(record));
    pin.uncertain = false;
    prune(envelope);
    save(envelope);
    return record;
  }

  function confirm(token, code) {
    var envelope = snapshot(), slot = code === undefined ? 'latest' : 'edit';
    var record = matching(envelope, slot, token, code);
    if (record.state !== 'draft') parser.fail('Draft changed or was already submitted. Review again.');
    parser.validate(record.value, now());
    record.state = 'confirmed';
    var pin = envelope.pins.filter(function(pin) { return pin.launchCode === record.launchCode; })[0];
    if (!pin) {
      pin = { id: record.id, launchCode: record.launchCode };
      envelope.pins.push(pin);
    }
    pin.value = record.value;
    pin.revision = record.sequence;
    pin.uncertain = true;
    if (slot === 'edit' && envelope.latest && envelope.latest.id === record.id) {
      envelope.latest = {
        sequence: record.sequence, id: record.id, launchCode: record.launchCode,
        state: record.state, value: record.value
      };
    }
    save(envelope);
    return insert(envelope, record);
  }

  function retry(token, code) {
    var envelope = snapshot();
    var record = matching(envelope, code === undefined ? 'latest' : 'edit', token, code);
    if (record.state !== 'confirmed' && record.state !== 'insertion-requested') {
      parser.fail('No matching pending insertion to retry.');
    }
    return insert(envelope, record);
  }

  function cancel(token, code) {
    var envelope = snapshot();
    var slot = code === undefined ? 'latest' : 'edit';
    var record = matching(envelope, slot, token, code);
    if (record.state !== 'draft' && record.state !== 'open') {
      parser.fail('Already submitted. Remove the pin in Timeline.');
    }
    if (slot === 'edit') envelope.edit = null;
    else {
      record.state = 'canceled';
      delete record.value;
    }
    save(envelope);
  }

  return { read: read, snapshot: snapshot, next: next, open: open, edit: edit,
    confirm: confirm, retry: retry, cancel: cancel };
}

function buildPin(record) {
  var time = new Date(record.value.instant).toISOString();
  return {
    id: record.id, time: time,
    layout: { type: 'genericPin', title: record.value.title, tinyIcon: 'system://images/NOTIFICATION_REMINDER' },
    reminders: [{
      time: time,
      layout: { type: 'genericReminder', title: record.value.title, tinyIcon: 'system://images/NOTIFICATION_REMINDER' }
    }],
    actions: [{ title: 'Snooze', type: 'openWatchApp', launchCode: record.launchCode }]
  };
}

module.exports = { create: create, buildPin: buildPin };
