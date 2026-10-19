'use strict';

var controller = require('./controller').create(localStorage, Pebble, Date.now);
var settings = require('./settings');
var preferences = settings.create(localStorage);
var queue = [];
var sending = false;

function flush() {
  if (sending || !queue.length) return;
  sending = true;
  var item = queue[0];
  Pebble.sendAppMessage(item.payload, function() {
    queue.shift();
    sending = false;
    flush();
  }, function() {
    sending = false;
    item.attempts++;
    if (item.attempts < 3) {
      setTimeout(flush, 1000);
    } else {
      queue.shift();
      // The watch also has a response timeout. Reopening retrieves the saved state.
      console.error('QuickReminders: watch-message delivery failed.');
      flush();
    }
  });
}

function receive(message) {
  var response;
  try {
    response = controller.handle(message);
  } catch (error) {
    // Only application-authored messages are displayed; raw platform errors may
    // contain private data and are never logged or forwarded.
    response = {
      STATUS: 'error',
      ERROR: error && error.userVisible === true ? error.message :
        'Could not save or insert. Reopen to check before retrying.'
    };
    try {
      var timeline = message && typeof message.COMMAND === 'string' && message.COMMAND.indexOf('pin_') === 0;
      var saved = controller.handle(timeline ?
        { COMMAND: 'pin_state', LAUNCH_CODE: message.LAUNCH_CODE } : { COMMAND: 'ready' });
      saved.ERROR = response.ERROR;
      if (timeline) saved.CAN_CONFIRM = 0;
      response = saved;
    } catch (restoreError) {
      console.error('QuickReminders: saved state unavailable.');
    }
    console.error('QuickReminders: request failed.');
  }
  try {
    var configuration = preferences.message();
    response.RIBBON_COLOR = configuration.RIBBON_COLOR;
    response.AUTO_CLOSE = configuration.AUTO_CLOSE;
    response.SNOOZE_1 = configuration.SNOOZE_1;
    response.SNOOZE_2 = configuration.SNOOZE_2;
    response.SNOOZE_3 = configuration.SNOOZE_3;
  } catch (error) {
    console.error('QuickReminders: settings unavailable. Open Settings to recover.');
    response.ERROR = 'Settings unavailable. Open Settings and save them again.';
    response.CAN_CONFIRM = 0;
  }
  if (message && typeof message.LAUNCH_CODE === 'number') response.LAUNCH_CODE = message.LAUNCH_CODE;
  response.COMMAND = message && typeof message.COMMAND === 'string' ? message.COMMAND : 'invalid';
  response.REQUEST_ID = message && typeof message.REQUEST_ID === 'number' ? message.REQUEST_ID : 0;
  queue.push({ payload: response, attempts: 0 });
  flush();
}

Pebble.addEventListener('ready', function() { receive({ COMMAND: 'ready' }); });
Pebble.addEventListener('appmessage', function(event) { receive(event.payload); });

Pebble.addEventListener('showConfiguration', function() {
  var value;
  var failed = false;
  try {
    value = preferences.read();
  } catch (error) {
    failed = true;
    value = require('./defaults').initial;
    console.error('QuickReminders: settings unavailable. Save Settings to recover.');
  }
  Pebble.openURL(settings.page(value, failed));
});

Pebble.addEventListener('webviewclosed', function(event) {
  if (!event || !event.response || event.response === 'CANCELLED') return;
  var value;
  try {
    value = preferences.save(JSON.parse(decodeURIComponent(event.response)));
  } catch (error) {
    console.error('QuickReminders: settings not saved.');
    Pebble.openURL(settings.page(require('./defaults').initial, true));
    return;
  }
  queue.push({ payload: {
    COMMAND: 'settings',
    RIBBON_COLOR: value.ribbonColor,
    AUTO_CLOSE: value.autoClose ? 1 : 0,
    SNOOZE_1: value.snoozeMinutes[0], SNOOZE_2: value.snoozeMinutes[1], SNOOZE_3: value.snoozeMinutes[2]
  }, attempts: 0 });
  flush();
});
