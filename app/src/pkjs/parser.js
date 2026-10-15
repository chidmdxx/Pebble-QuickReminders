'use strict';

var MINUTE = 60000;
var DAY = 24 * 60 * MINUTE;
var MAX_TITLE_BYTES = 160;
var weekdays = [
  ['sunday', 'domingo'], ['monday', 'lunes'], ['tuesday', 'martes'],
  ['wednesday', 'miércoles', 'miercoles'], ['thursday', 'jueves'],
  ['friday', 'viernes'], ['saturday', 'sábado', 'sabado']
];
var dayPattern = '(?:today|hoy|tomorrow|mañana|manana|\\d{4}-\\d{2}-\\d{2}|' +
  weekdays.map(function(names) { return names.join('|'); }).join('|') + ')';
var unitPattern = '(?:minutes?|minutos?|hours?|horas?)';
var englishSmall = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
var spanishSmall = 'cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis veintisiete veintiocho veintinueve'.split(' ');
var englishTens = 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
var spanishTens = 'treinta cuarenta cincuenta sesenta setenta ochenta noventa'.split(' ');
var numbers = {};

function addNumber(word, value) {
  numbers[word] = value;
  numbers[word.replace(/é/g, 'e').replace(/ó/g, 'o')] = value;
}

englishSmall.forEach(function(word, value) { addNumber(word, value); });
spanishSmall.forEach(function(word, value) { addNumber(word, value); });
englishTens.forEach(function(word, index) {
  addNumber(word, (index + 2) * 10);
  for (var i = 1; i <= 9; i++) {
    addNumber(word + ' ' + englishSmall[i], (index + 2) * 10 + i);
    addNumber(word + '-' + englishSmall[i], (index + 2) * 10 + i);
  }
});
spanishTens.forEach(function(word, index) {
  addNumber(word, (index + 3) * 10);
  for (var i = 1; i <= 9; i++) addNumber(word + ' y ' + spanishSmall[i], (index + 3) * 10 + i);
});
addNumber('un', 1);
addNumber('una', 1);
addNumber('veintiún', 21);
addNumber('veintiun', 21);
addNumber('veintiuna', 21);

// Deliberately bounded vocabulary, not general natural-language interpretation:
// written counts 1..99 (one language per count), or digits, with mixed-language
// connectors/units. Relative digits retain the 1..10080 interval bound.
// Clock words use hour [y minute], hour 1..23 / minute 0..59, and require
// AM/PM (hour 1..12) or a Spanish day period: mañana 1..11, tarde 1..7/13..19,
// noche 8..11/20..23. Numeric H:MM retains the explicit 24-hour alternative.
function number(value) {
  value = value.toLowerCase();
  if (/^\d+$/.test(value)) return Number(value);
  return Object.prototype.hasOwnProperty.call(numbers, value) ? numbers[value] : NaN;
}

function relativeInterval(count, unit) {
  count = /^(a|an)$/i.test(count) ? 1 : number(count);
  return count >= 1 && count <= 10080 ?
    count * (/^(hour|hora)/i.test(unit) ? 60 : 1) * MINUTE : NaN;
}

function clock(value) {
  var marker = / (am|pm|de la mañana|de la manana|de la tarde|de la noche)$/i.exec(value);
  // Keep the original English grammar's optional space before AM/PM.
  if (!marker) marker = /(am|pm)$/i.exec(value);
  var meridiem = marker && marker[1].toLowerCase();
  var body = (marker ? value.slice(0, marker.index).trim() : value).toLowerCase();
  var numeric = /^(\d{1,2})(?::(\d{2}))?$/.exec(body);
  var hour, minute = 0;
  if (numeric) {
    hour = Number(numeric[1]);
    minute = numeric[2] === undefined ? 0 : Number(numeric[2]);
    if (!meridiem && numeric[2] === undefined) return null;
  } else {
    if (!meridiem) return null;
    hour = number(body);
    if (isNaN(hour)) {
      // "treinta y cinco" remains a single minute count, not another hour.
      var split = body.indexOf(' y ');
      if (split < 0) return null;
      hour = number(body.slice(0, split));
      minute = number(body.slice(split + 3));
    }
  }
  if (isNaN(hour) || isNaN(minute) || minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  if (meridiem === 'am' || meridiem === 'pm') {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem === 'pm' ? 12 : 0);
  } else if (meridiem) {
    // Avoid guessing noon/midnight or which side of midnight "night" means.
    if (/mañana|manana/.test(meridiem)) {
      if (hour < 1 || hour > 11) return null;
    } else if (/tarde/.test(meridiem)) {
      if (hour >= 1 && hour <= 7) hour += 12;
      else if (hour < 13 || hour > 19) return null;
    } else {
      if (hour >= 8 && hour <= 11) hour += 12;
      else if (hour < 20 || hour > 23) return null;
    }
  }
  return [hour, minute];
}

function countLike(value) {
  var first = value.toLowerCase().split(' ')[0];
  return /^[-+\d]/.test(first) || !isNaN(number(first)) ||
    /^(?:a|an|half|quarter|minus|negative|medio|media|cuarto|menos)$/.test(first);
}

function competingSchedule(value) {
  var boundary = '(?:^|[^a-záéíóúüñ0-9])';
  var relative = new RegExp(boundary + '(?:in|en|dentro de) (.+?) ' + unitPattern + '(?=$|[^a-záéíóúüñ0-9])', 'gi');
  var match;
  while ((match = relative.exec(value))) {
    if (countLike(match[1])) return true;
    // An ordinary "in ..." in the title must not hide a later time anchor.
    relative.lastIndex = match.index + 1;
  }
  var dated = new RegExp(boundary + '(?:(?:on|el) )?' + dayPattern + ' (?:at|a las|a la) (.+)', 'gi');
  while ((match = dated.exec(value))) {
    if (countLike(match[1])) return true;
    dated.lastIndex = match.index + 1;
  }
  if (!/de la (?:mañana|manana)$/i.test(value) &&
      new RegExp(boundary + '(?:(?:on|el) )?' + dayPattern + '(?: (?:and|or|y|o|to|through|a|hasta))?[,.!?;:)]*$', 'i').test(value)) return true;
  // A second explicit clock is ambiguous even without its own date. Do not
  // mistake ordinary title phrases such as "at one point" for a clock.
  var times = new RegExp(boundary + '(?:at|a las|a la) (.+)', 'gi');
  while ((match = times.exec(value))) {
    var words = match[1].split(' ');
    for (var i = 1; i <= words.length; i++) {
      if (clock(words.slice(0, i).join(' ').replace(/[,.!?;:)]*$/, ''))) return true;
    }
    if (/^\d{1,2}(?= |:|$)/.test(match[1])) return true;
    // A complete bare written clock still needs clarification, not a guessed
    // meridiem. Require the whole remaining phrase so "at one point" is a title.
    var bare = match[1].toLowerCase().replace(/[,.!?;:)]*$/, '')
      .replace(/ (?:and|or|y|o)$/, '').split(' y ');
    var hour = number(bare[0]);
    var minute = bare.length > 1 ? number(bare.slice(1).join(' y ')) : 0;
    if (hour >= 1 && hour <= 23 && minute >= 0 && minute <= 59) return true;
    times.lastIndex = match.index + 1;
  }
  return false;
}

function morningContext(value) {
  return /(?:^| )(?:de la|por la|en la|esta)$/i.test(value.trim());
}

function containsDay(value) {
  var pattern = new RegExp('(?:^|[^a-záéíóúüñ0-9])' + dayPattern + '(?=$|[^a-záéíóúüñ0-9])', 'gi');
  var match;
  while ((match = pattern.exec(value))) {
    if (!morningContext(value.slice(0, match.index))) return true;
  }
  return false;
}

function attemptedTime(value) {
  var boundary = '(?:^|[^a-záéíóúüñ0-9])';
  var end = '(?=$|[^a-záéíóúüñ0-9])';
  if (/\d{1,2}:\d+|\d\s*(?:am|pm)\b/i.test(value)) return true;
  if (new RegExp(boundary + dayPattern + ' (?:at|a las|a la)(?: |$)', 'i').test(value)) return true;
  if (/(?:^| )(?:noon|midnight|mediodía|mediodia|medianoche|tonight|morning|afternoon|evening|night|yesterday|ayer|anteayer|anteanoche|(?:por la|en la|esta) (?:mañana|manana|tarde|noche)|de la (?:tarde|noche))(?=$|[ ,.?!])/i.test(value)) return true;
  var relative = new RegExp(boundary + '(?:in|en|dentro de) (.+?) (?:' +
    unitPattern + '|seconds?|segundos?|days?|días?|dias?|weeks?|semanas?|months?|mes(?:es)?|years?|años?)' + end, 'gi');
  if (relative.test(value)) return true;
  var match;
  var clocks = new RegExp(boundary + '(?:at|a las|a la|in|en|dentro de) (.+)', 'gi');
  while ((match = clocks.exec(value))) {
    if (countLike(match[1])) return true;
    clocks.lastIndex = match.index + 1;
  }
  var periods = new RegExp(boundary + '([^ ]+?) ?(?:am|pm|de la mañana|de la manana|de la tarde|de la noche)' + end, 'gi');
  while ((match = periods.exec(value))) {
    if (countLike(match[1])) return true;
  }
  return false;
}

function fail(message) {
  var error = new Error(message);
  error.userVisible = true;
  throw error;
}

function validInstant(value) {
  return typeof value === 'number' && isFinite(value) && !isNaN(new Date(value).getTime());
}

function title(value) {
  if (typeof value !== 'string') fail('A reminder needs a title.');
  var clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) fail('A reminder needs a title.');
  var bytes;
  try {
    bytes = encodeURIComponent(clean).replace(/%[0-9a-f]{2}|./gi, 'x').length;
  } catch (error) {
    fail('Reminder title contains invalid text. Dictate again.');
  }
  if (bytes > MAX_TITLE_BYTES) fail('Title too long. Dictate a shorter title.');
  return clean;
}

function zoneContext(reference) {
  if (!validInstant(reference)) fail('Phone clock is invalid.');
  var date = new Date(reference);
  var offsets = [];
  // Sample a full year on either side so travel across DST regimes invalidates a draft.
  for (var i = -12; i <= 12; i++) {
    offsets.push(new Date(date.getFullYear(), date.getMonth() + i, 15, 12).getTimezoneOffset());
  }
  return date.toString() + '|' + offsets.join(',');
}

function sameWall(date, parts) {
  return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 &&
    date.getDate() === parts[2] && date.getHours() === parts[3] && date.getMinutes() === parts[4];
}

function resolveWall(parts) {
  var naive = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4]);
  var offsets = {};
  var matches = [];
  // Enumerate offsets around the wall date, then round-trip candidates. Date alone
  // silently normalizes gaps and picks one occurrence of a repeated local time.
  for (var delta = -2 * DAY; delta <= 2 * DAY; delta += 6 * 60 * MINUTE) {
    offsets[new Date(naive + delta).getTimezoneOffset()] = true;
  }
  Object.keys(offsets).forEach(function(offset) {
    var instant = naive + Number(offset) * MINUTE;
    if (sameWall(new Date(instant), parts) && matches.indexOf(instant) < 0) matches.push(instant);
  });
  if (!matches.length) fail('Invalid date or daylight-saving gap. Choose another time.');
  if (matches.length !== 1) fail('That time occurs twice. Choose a time outside the clock change.');
  return matches[0];
}

function two(value) {
  return value < 10 ? '0' + value : String(value);
}

function localDisplay(instant) {
  var date = new Date(instant);
  return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate()) +
    '\n' + two(date.getHours()) + ':' + two(date.getMinutes());
}

function draft(what, instant, reference) {
  if (!validInstant(reference) || !validInstant(instant)) fail('Phone clock is invalid.');
  if (instant <= reference) fail('That time has passed. Choose a future time.');
  if (instant > reference + 366 * DAY) fail('Choose a reminder within the next year.');
  return {
    title: title(what),
    instant: instant,
    reference: reference,
    zone: zoneContext(reference)
  };
}

function parse(text, reference) {
  if (typeof text !== 'string' || !text.trim() || text.length > 512) fail('Dictate a short reminder.');
  if (!validInstant(reference)) fail('Phone clock is invalid.');
  var input = text.trim().replace(/\s+/g, ' ')
    .replace(/^(?:remind me(?: to)?|(?:recuérdame|recuerdame|recordarme)(?: que)?)(?:\s+|$)/i, '');
  if (/\b(every|daily|weekly|monthly|yearly|recurring|next)\b/i.test(input) ||
      /\b(?:sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|weekdays|weekends)\b/i.test(input) ||
      /(?:^|[^a-záéíóúüñ])(?:los|las) (?:domingos|lunes|martes|miércoles|miercoles|jueves|viernes|sábados|sabados)(?=$|[^a-záéíóúüñ])/i.test(input) ||
      /(?:^|[^a-záéíóúüñ])(?:cada|todos|todas|diariamente|semanalmente|mensualmente|anualmente|recurrentes?|repetir|diari[oa]s?|semanal(?:es)?|mensual(?:es)?|anual(?:es)?|próxim[oa]s?|proxim[oa]s?|siguientes?)(?=$|[^a-záéíóúüñ])/i.test(input)) {
    fail('Use a single date and time, not a repeating or "next" expression.');
  }
  if (/\b(?:after|before) tomorrow\b|\bpasado (?:mañana|manana)\b/i.test(input)) {
    fail('Use an explicit date for that expression.');
  }
  var relativePattern = new RegExp('^(?:in|en|dentro de) (.+) (' + unitPattern + ')[.!]?$', 'i');
  var absolutePattern = new RegExp('^(?:(?:on|el) )?(' + dayPattern + ') (?:at|a las|a la) (.+?)(?: ((?:about|sobre) .+))?[.!]?$', 'i');
  var candidates = [];
  var leading = new RegExp('^(?:in|en|dentro de) (.+?) (' + unitPattern + ')(?: (.*))?$', 'i').exec(input);
  if (leading) {
    var interval = relativeInterval(leading[1], leading[2]);
    if (!isNaN(interval)) {
      var continuation = new RegExp('^(.+?) (?:' + unitPattern +
        '|seconds?|segundos?|days?|días?|dias?|weeks?|semanas?|months?|mes(?:es)?|years?|años?)(?=$|[ ,.?!])', 'i').exec(leading[3] || '');
      // Check before removing "to": an explicit title marker separates a
      // numbered subject from an unsupported compound interval.
      if (continuation && (!isNaN(number(continuation[1])) ||
          /^[-+]?\d+(?:[.,]\d+)?$/.test(continuation[1]))) {
        fail('Use one clear schedule, like "tomorrow at 8 AM".');
      }
      candidates.push({
        title: (leading[3] || '').replace(/^to(?: |$)/i, '').trim(),
        interval: interval,
        leading: true
      });
    }
  }
  for (var index = 0; index < input.length; index++) {
    if (index && input.charAt(index - 1) !== ' ') continue;
    var what = input.slice(0, index).trim();
    var suffix = input.slice(index);
    var relative = relativePattern.exec(suffix);
    var absolute = absolutePattern.exec(suffix);
    if (relative) {
      interval = relativeInterval(relative[1], relative[2]);
      if (!isNaN(interval) && !(leading && index === 0)) {
        candidates.push({ title: what, interval: interval });
      }
    }
    if (absolute && (!/^(?:mañana|manana)$/i.test(absolute[1]) || !morningContext(what))) {
      var time = clock(absolute[2]);
      if (time) candidates.push({ title: what, tail: absolute[3] || '', day: absolute[1].toLowerCase(), time: time });
    }
  }
  // Explicit schedules win. Defaults apply only after ruling out attempted times,
  // then choosing a named day, or finally an entirely unscheduled title.
  var defaulted = false;
  if (!candidates.length) {
    if (attemptedTime(input)) fail('Use one clear schedule, like "tomorrow at 8 AM".');
    var dayOnlyPattern = new RegExp('^(?:(?:on|el) )?(' + dayPattern + ')(?: ((?:about|sobre) .+))?[.!]?$', 'i');
    for (index = 0; index < input.length; index++) {
      if (index && input.charAt(index - 1) !== ' ') continue;
      what = input.slice(0, index).trim();
      var dayOnly = dayOnlyPattern.exec(input.slice(index));
      if (dayOnly && !morningContext(what)) {
        candidates.push({ title: what, tail: dayOnly[2] || '', day: dayOnly[1].toLowerCase(), time: [10, 0] });
      }
    }
    if (!candidates.length) {
      var firstDay = new RegExp('^(?:(?:on|el) )?(' + dayPattern + ') (.+)$', 'i').exec(input);
      if (firstDay) candidates.push({ title: firstDay[2], day: firstDay[1].toLowerCase(), time: [10, 0] });
    }
    if (!candidates.length) {
      if (containsDay(input) || competingSchedule(input)) fail('Use one clear schedule, like "tomorrow at 8 AM".');
      var now = new Date(reference);
      var nextDay = now.getHours() >= 20;
      var targetDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (nextDay ? 1 : 0), 12);
      return draft(input, resolveWall([
        targetDay.getFullYear(), targetDay.getMonth() + 1, targetDay.getDate(), nextDay ? 10 : 20, 0
      ]), reference);
    }
    defaulted = true;
  }
  // "el miércoles" / "on Wednesday" are one anchor, not a competing bare-day
  // interpretation leaving the article in the title.
  candidates = candidates.filter(function(candidate) {
    return !candidates.some(function(other) {
      return other.title.length < candidate.title.length &&
        /^(?:on|el)$/i.test(candidate.title.slice(other.title.length).trim());
    });
  });
  if (candidates.length !== 1) fail('Use one clear schedule, like "tomorrow at 8 AM".');
  var selected = candidates[0];
  if (selected.leading) {
    if (/^(?:to)?[.!?,;:]*$/i.test(selected.title)) fail('A reminder needs a title.');
    // A leading interval ends at the unit; modifiers and additional unsupported
    // schedules must not be reinterpreted as the reminder's title.
    if (attemptedTime(selected.title) ||
        /^(?:more|later|from now|ago|before|after|and|or|más|mas|antes|después|despues|desde|y|o)(?=$|[ ,.?!])/i.test(selected.title)) {
      fail('Use one clear schedule, like "tomorrow at 8 AM".');
    }
  }
  var tail = selected.tail || '';
  what = selected.title + (tail ? ' ' + tail : '');
  if (competingSchedule(selected.title) || competingSchedule(tail) || competingSchedule(what) ||
      (defaulted && (containsDay(selected.title) || containsDay(tail)))) {
    fail('Use one clear schedule, like "tomorrow at 8 AM".');
  }
  if (selected.interval) return draft(selected.title, reference + selected.interval, reference);
  var local = new Date(reference);
  var day = selected.day;
  var y = local.getFullYear(), m = local.getMonth() + 1, d = local.getDate();
  if (/^\d/.test(day)) {
    var pieces = day.split('-');
    y = Number(pieces[0]); m = Number(pieces[1]); d = Number(pieces[2]);
  } else if (day !== 'today' && day !== 'hoy') {
    var weekday = -1;
    weekdays.forEach(function(names, index) {
      if (names.indexOf(day) >= 0) weekday = index;
    });
    var advance = /^(tomorrow|mañana|manana)$/.test(day) ? 1 : (weekday - local.getDay() + 7) % 7;
    var target = new Date(y, m - 1, d + advance, 12);
    y = target.getFullYear(); m = target.getMonth() + 1; d = target.getDate();
  }
  return draft(what, resolveWall([y, m, d, selected.time[0], selected.time[1]]), reference);
}

function validate(value, now, mode) {
  if (!value || !validInstant(value.reference) || !validInstant(value.instant) || !validInstant(now)) {
    fail('Reminder data is invalid. Dictate again.');
  }
  if (title(value.title) !== value.title) fail('Reminder title is invalid.');
  if (value.instant <= value.reference) fail('Reminder data is invalid. Dictate again.');
  if (mode !== 'retry' && value.zone !== zoneContext(value.reference)) {
    fail('Phone timezone changed. Dictate and review again.');
  }
  if (mode !== 'edit' && value.instant <= now) fail('That time has passed. Choose a future time.');
  if (value.instant > value.reference + 366 * DAY) fail('Reminder is too far in the future.');
  return value;
}

function withTime(value, date, time, now) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  var clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock || Number(clock[1]) > 23 || Number(clock[2]) > 59) {
    fail('Choose a valid date and 24-hour time.');
  }
  return draft(value.title, resolveWall([
    Number(match[1]), Number(match[2]), Number(match[3]), Number(clock[1]), Number(clock[2])
  ]), now);
}

module.exports = {
  parse: parse,
  draft: draft,
  validate: validate,
  withTime: withTime,
  title: title,
  localDisplay: localDisplay,
  zoneContext: zoneContext,
  resolveWall: resolveWall,
  fail: fail
};
