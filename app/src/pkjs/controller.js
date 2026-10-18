'use strict';

var parser = require('./parser');
var reminders = require('./lib/reminders');
var settings = require('./settings');

function create(storage, pebble, clock) {
  var store = reminders.create(storage, pebble, clock);
  var preferences = settings.create(storage);

  function view(record) {
    if (!record || record.state === 'canceled') return { STATUS: 'home', TOKEN: 0 };
    // read() has checked persisted integrity. Keep a traveled draft visible for
    // cancellation or replacement without making it confirmable in the new zone.
    var changedZone = record.state === 'draft' &&
      record.value.zone !== parser.zoneContext(record.value.reference);
    var now = clock();
    var result = {
      STATUS: record.state === 'draft' ? 'draft' : 'pending',
      TOKEN: record.sequence,
      CAN_CONFIRM: !changedZone && record.value.instant > now ? 1 : 0,
      SECONDS_UNTIL: Math.max(0, Math.ceil((record.value.instant - now) / 1000)),
      TITLE: record.value.title,
      WHEN: parser.localDisplay(record.value.instant)
    };
    if (changedZone) result.ERROR = 'Phone timezone changed. Dictate and review again.';
    return result;
  }

  function current(token) {
    var record = store.read();
    if (!record || record.sequence !== token || record.state !== 'draft') {
      parser.fail('Draft changed. Reopen the app to review.');
    }
    return record;
  }

  function handle(message) {
    if (!message || typeof message.COMMAND !== 'string') parser.fail('Invalid app message.');
    var command = message.COMMAND;
    var record;
    if (command === 'ready') return view(store.read());
    if (command === 'parse') return view(store.next(parser.parse(message.TEXT, clock(), preferences.read())));
    if (command === 'title') {
      record = current(message.TOKEN);
      parser.validate(record.value, clock(), 'edit');
      return view(store.next(parser.draft(message.TEXT, record.value.instant, record.value.reference)));
    }
    if (command === 'time') {
      record = current(message.TOKEN);
      parser.validate(record.value, clock(), 'edit');
      var match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/.exec(message.TEXT || '');
      if (!match) parser.fail('Use YYYY-MM-DD HH:MM.');
      return view(store.next(parser.withTime(record.value, match[1], match[2], clock())));
    }
    if (command === 'confirm') return view(store.confirm(message.TOKEN));
    if (command === 'retry') return view(store.retry(message.TOKEN));
    if (command === 'cancel') {
      store.cancel(message.TOKEN);
      return view(store.read());
    }
    parser.fail('Unknown app command.');
  }

  return { handle: handle };
}

module.exports = { create: create };
