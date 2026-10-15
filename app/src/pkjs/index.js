'use strict';

var controller = require('./controller').create(localStorage, Pebble, Date.now);
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
      var saved = controller.handle({ COMMAND: 'ready' });
      saved.ERROR = response.ERROR;
      response = saved;
    } catch (restoreError) {
      console.error('QuickReminders: saved state unavailable.');
    }
    console.error('QuickReminders: request failed.');
  }
  response.COMMAND = message && typeof message.COMMAND === 'string' ? message.COMMAND : 'invalid';
  response.REQUEST_ID = message && typeof message.REQUEST_ID === 'number' ? message.REQUEST_ID : 0;
  queue.push({ payload: response, attempts: 0 });
  flush();
}

Pebble.addEventListener('ready', function() { receive({ COMMAND: 'ready' }); });
Pebble.addEventListener('appmessage', function(event) { receive(event.payload); });
