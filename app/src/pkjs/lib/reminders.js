/**
 * Copyright 2025 Google LLC
 * Licensed under the Apache License, Version 2.0 (see LICENSE).
 *
 * Adapted from TomBolger/Billy app/src/pkjs/lib/reminders.js.
 * Modified for QuickReminders: deterministic IDs, validation, persistence before
 * insertion, explicit confirmation, no transcript logging, and no task database.
 */
'use strict';

var parser = require('../parser');
var KEY = 'quickreminders.pending.v1';

function create(storage, pebble, now) {
  function read() {
    var raw = storage.getItem(KEY);
    if (!raw) return null;
    var record;
    try {
      record = JSON.parse(raw);
    } catch (error) {
      parser.fail('Stored reminder is invalid. Phone app data needs recovery.');
    }
    if (!record || record.version !== 1 || typeof record.sequence !== 'number' ||
        record.sequence < 0 || Math.floor(record.sequence) !== record.sequence ||
        record.sequence > 2147483646 || !isFinite(record.sequence) ||
        ['draft', 'confirmed', 'insertion-requested', 'canceled'].indexOf(record.state) < 0 ||
        typeof record.id !== 'string' || !/^qr-[a-z0-9]+-\d+$/.test(record.id) ||
        (record.state !== 'canceled' && (!record.value ||
          typeof record.value.title !== 'string' || typeof record.value.zone !== 'string' ||
          typeof record.value.instant !== 'number' || !isFinite(record.value.instant) ||
          typeof record.value.reference !== 'number' || !isFinite(record.value.reference) ||
          isNaN(new Date(record.value.instant).getTime()) ||
          isNaN(new Date(record.value.reference).getTime()) ||
          record.value.instant <= record.value.reference ||
          record.value.instant > record.value.reference + 366 * 86400000 ||
          parser.title(record.value.title) !== record.value.title))) {
      parser.fail('Stored reminder is invalid. Phone app data needs recovery.');
    }
    return record;
  }

  function save(record) {
    storage.setItem(KEY, JSON.stringify(record));
  }

  function next(value) {
    parser.validate(value, now(), 'edit');
    var previous = read();
    var sequence = previous ? previous.sequence + 1 : 1;
    if (sequence > 2147483646) parser.fail('Reminder sequence exhausted. Phone app data needs recovery.');
    var record = {
      version: 1,
      sequence: sequence,
      id: 'qr-' + now().toString(36) + '-' + sequence,
      state: 'draft',
      value: value
    };
    save(record);
    return record;
  }

  function confirm(token) {
    var record = read();
    if (!record || record.sequence !== token || record.state !== 'draft') {
      parser.fail('Draft changed or was already submitted. Review again.');
    }
    parser.validate(record.value, now());
    record.state = 'confirmed';
    save(record);
    return insert(record);
  }

  function insert(record) {
    parser.validate(record.value, now(), 'retry');
    if (typeof pebble.insertTimelinePin !== 'function') {
      parser.fail('Update the Pebble phone app: local pins are unavailable.');
    }
    var pin = buildPin(record);
    record.state = 'insertion-requested';
    save(record);
    // The documented API has no delivery callback. Never report watch sync here.
    pebble.insertTimelinePin(pin);
    return record;
  }

  function retry(token) {
    var record = read();
    if (!record || record.sequence !== token ||
        (record.state !== 'confirmed' && record.state !== 'insertion-requested')) {
      parser.fail('No matching pending insertion to retry.');
    }
    return insert(record);
  }

  function cancel(token) {
    var record = read();
    if (!record || record.sequence !== token) parser.fail('Draft changed. Reopen the app.');
    if (record.state !== 'draft') parser.fail('Already submitted. Remove the pin in Timeline.');
    record.state = 'canceled';
    delete record.value;
    save(record);
  }

  return { read: read, next: next, confirm: confirm, retry: retry, cancel: cancel };
}

function buildPin(record) {
  var time = new Date(record.value.instant).toISOString();
  return {
    id: record.id,
    time: time,
    layout: {
      type: 'genericPin',
      title: record.value.title,
      tinyIcon: 'system://images/NOTIFICATION_REMINDER'
    },
    reminders: [{
      time: time,
      layout: {
        type: 'genericReminder',
        title: record.value.title,
        tinyIcon: 'system://images/NOTIFICATION_REMINDER'
      }
    }]
  };
}

module.exports = { create: create, buildPin: buildPin };
