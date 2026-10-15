'use strict';

var defaults = require('./defaults');
var KEY = 'quickreminders.settings.v1';

function create(storage) {
  function read() {
    var raw = storage.getItem(KEY);
    if (raw === null || raw === undefined) return defaults.validate(defaults.initial);
    var value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      var invalid = new Error('Saved settings are invalid. Open Settings and save them again.');
      invalid.userVisible = true;
      throw invalid;
    }
    return defaults.validate(value);
  }

  function save(value) {
    value = defaults.validate(value);
    storage.setItem(KEY, JSON.stringify(value));
    return value;
  }

  function message() {
    var value = read();
    return { RIBBON_COLOR: value.ribbonColor, AUTO_CLOSE: value.autoClose ? 1 : 0 };
  }

  return { read: read, save: save, message: message };
}

function page(value, failed) {
  value = defaults.validate(value);
  // All substitutions come from validated settings or the fixed palette.
  var options = defaults.colors.map(function(color) {
    return '<option value="' + color.value + '"' +
      (value.ribbonColor === color.value ? ' selected' : '') + '>' + color.name + '</option>';
  }).join('');
  var html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Quick Reminders settings</title><style>' +
    'body{font:17px system-ui,sans-serif;margin:24px auto;padding:0 20px;max-width:480px;color:#222;background:#fff}' +
    'h1{font-size:26px}label{display:block;font-weight:600;margin-top:24px}' +
    'input[type=time],select,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;margin-top:8px}' +
    'p{line-height:1.5}small{display:block;line-height:1.5;color:#555;margin-top:8px}' +
    '#preview{margin-top:12px;padding:16px;background:#f3f3f3;border-right:28px solid ' +
    defaults.colors.filter(function(color) { return color.value === value.ribbonColor; })[0].hex + '}' +
    '#error{color:#a00}button{cursor:pointer}input[type=checkbox]{width:22px;height:22px;vertical-align:middle}' +
    '</style></head><body><h1>Quick Reminders</h1>' +
    '<p>Defaults apply to new reminders only. Explicit spoken times always win.</p>' +
    '<p id="error" role="alert">' + (failed ? 'Could not load or save settings. Check the values and try saving again.' : '') + '</p>' +
    '<form id="settings"><label for="am">AM default time</label>' +
    '<input id="am" type="time" min="00:00" max="11:59" step="60" required value="' + value.amTime + '">' +
    '<small>Used when a day is named without a time, or tomorrow after the PM default has passed.</small>' +
    '<label for="pm">PM default time</label>' +
    '<input id="pm" type="time" min="12:00" max="23:59" step="60" required value="' + value.pmTime + '">' +
    '<small>Used today when no day or time is spoken, if this time is still ahead.</small>' +
    '<label for="ribbon">Ribbon color</label><select id="ribbon">' + options + '</select>' +
    '<div id="preview">Reminder ribbon preview</div>' +
    '<label for="close"><input id="close" type="checkbox"' + (value.autoClose ? ' checked' : '') +
    '> Auto-close after saving</label>' +
    '<small>Return to the watch face after the phone accepts insertion. This does not confirm delivery. ' +
    'When off, a saved notice stays open; Select records another reminder and Back exits.</small>' +
    '<button type="submit">Save settings</button><button id="cancel" type="button">Cancel</button></form>' +
    '<script>(function(){' +
    'var colors=' + JSON.stringify(defaults.colors) + ';' +
    'function el(id){return document.getElementById(id);}' +
    'el("ribbon").onchange=function(){var value=Number(this.value);colors.forEach(function(c){' +
    'if(c.value===value)el("preview").style.borderRightColor=c.hex;});};' +
    'el("settings").onsubmit=function(event){event.preventDefault();' +
    'var value={amTime:el("am").value,pmTime:el("pm").value,ribbonColor:Number(el("ribbon").value),autoClose:el("close").checked};' +
    'if(!/^(0[0-9]|1[01]):[0-5][0-9]$/.test(value.amTime)||!/^(1[2-9]|2[0-3]):[0-5][0-9]$/.test(value.pmTime)){' +
    'el("error").textContent="Choose an AM time and a PM time.";return;}' +
    'window.location.href="pebblejs://close#"+encodeURIComponent(JSON.stringify(value));};' +
    'el("cancel").onclick=function(){window.location.href="pebblejs://close";};' +
    '})();</script></body></html>';
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

module.exports = { create: create, page: page };
