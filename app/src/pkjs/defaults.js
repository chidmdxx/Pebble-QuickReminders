'use strict';

var initial = { amTime: '10:00', pmTime: '20:00', ribbonColor: 224, autoClose: true, snoozeMinutes: [5, 10, 30] };
var colors = [
  { name: 'Deep red', value: 224, hex: '#aa0000' },
  { name: 'Dark blue', value: 194, hex: '#0000aa' },
  { name: 'Dark green', value: 200, hex: '#00aa00' },
  { name: 'Purple', value: 226, hex: '#aa00aa' },
  { name: 'Black', value: 192, hex: '#000000' }
];

function validate(value) {
  var presets = value && Object.prototype.hasOwnProperty.call(value, 'snoozeMinutes') ?
    value.snoozeMinutes : [5, 10, 30];
  if (!value || typeof value !== 'object' ||
      typeof value.amTime !== 'string' || !/^(?:0[0-9]|1[01]):[0-5][0-9]$/.test(value.amTime) ||
      typeof value.pmTime !== 'string' || !/^(?:1[2-9]|2[0-3]):[0-5][0-9]$/.test(value.pmTime) ||
      !colors.some(function(color) { return color.value === value.ribbonColor; }) ||
      typeof value.autoClose !== 'boolean' ||
      !Array.isArray(presets) || presets.length !== 3 ||
      ![0, 1, 2].every(function(index) {
        var minutes = presets[index];
        return typeof minutes === 'number' && isFinite(minutes) &&
          Math.floor(minutes) === minutes && minutes >= 1 && minutes <= 10080;
      })) {
    var error = new Error('Choose valid times, a listed ribbon color, and three presets of 1..10080 minutes.');
    error.userVisible = true;
    throw error;
  }
  return {
    amTime: value.amTime, pmTime: value.pmTime,
    ribbonColor: value.ribbonColor, autoClose: value.autoClose,
    snoozeMinutes: presets.slice()
  };
}

module.exports = { initial: initial, colors: colors, validate: validate };
