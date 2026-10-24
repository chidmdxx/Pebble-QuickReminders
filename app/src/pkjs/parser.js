'use strict';

var MINUTE = 60000;
var DAY = 24 * 60 * MINUTE;
var MAX_TITLE_BYTES = 160;
var defaults = require('./defaults');
var weekdays = [
  ['sunday', 'domingo'], ['monday', 'lunes'], ['tuesday', 'martes'],
  ['wednesday', 'miércoles', 'miercoles'], ['thursday', 'jueves'],
  ['friday', 'viernes'], ['saturday', 'sábado', 'sabado']
];
var weekdayNames = weekdays.map(function(names) { return names.join('|'); }).join('|');
var weekdayPattern = '(?:(?:next|this|próximo|proximo) )?(?:' + weekdayNames + ')(?: que viene)?';
var months = [
  ['january', 'enero'], ['february', 'febrero'], ['march', 'marzo'],
  ['april', 'abril'], ['may', 'mayo'], ['june', 'junio'],
  ['july', 'julio'], ['august', 'agosto'], ['september', 'septiembre', 'setiembre'],
  ['october', 'octubre'], ['november', 'noviembre'], ['december', 'diciembre']
];
var monthNames = months.map(function(names) { return names.join('|'); }).join('|');
var monthDayPattern = '(?:(?:' + monthNames + ') \\d{1,2}|\\d{1,2} de (?:' + monthNames + '))';
var todayPeriodPattern = '(?:this (?:morning|afternoon|evening)|tonight|esta (?:mañana|manana|tarde|noche))';
var afterTomorrowPattern = '(?:the day after tomorrow|pasado (?:mañana|manana))';
var dayPattern = '(?:' + afterTomorrowPattern + '|' + todayPeriodPattern + '|today|hoy|tomorrow|mañana|manana|\\d{4}-\\d{2}-\\d{2}|' +
  weekdayPattern + '|' + monthDayPattern + ')';
var dayClause = '(?:(?:on|el) )?(' + dayPattern + ')';
var timeConnector = '(?:at|a las|a la|al)';
var periodPattern = '(?:(?:in the )?(?:morning|afternoon|evening)|(?:at )?night|(?:en la|por la) (?:mañana|manana|tarde|noche))';
var calendarUnitPattern = '(?:days?|días?|dias?|weeks?|semanas?)';
var unitPattern = '(?:minutes?|minutos?|hours?|horas?|' + calendarUnitPattern + ')';
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
// Clock words use hour [minute / y minute / y media / y cuarto], or quarter
// past/to hour / hour menos cuarto. Numeric clocks still require a colon.
// Unmarked hours 1..12 consider both AM and PM. Explicit periods retain their
// bounds: AM/PM 1..12, mañana 1..11, tarde 1..7/13..19, noche 8..11/20..23.
function number(value) {
  value = value.toLowerCase();
  if (/^\d+$/.test(value)) return Number(value);
  return Object.prototype.hasOwnProperty.call(numbers, value) ? numbers[value] : NaN;
}

function relativeInterval(count, unit) {
  if ((/^half(?: an)?$/i.test(count) && /^hour$/i.test(unit)) ||
      (/^media$/i.test(count) && /^hora$/i.test(unit))) return 30 * MINUTE;
  count = /^(a|an)$/i.test(count) ? 1 : number(count);
  return count >= 1 && count <= 10080 ?
    count * (/^(hour|hora)/i.test(unit) ? 60 * MINUTE :
      /^(day|día|dia)/i.test(unit) ? DAY : /^(week|semana)/i.test(unit) ? 7 * DAY : MINUTE) : NaN;
}

function englishClockNumber(value) {
  if (englishSmall.indexOf(value) >= 0 || englishTens.indexOf(value) >= 0) return number(value);
  var pieces = value.split(/[ -]/);
  if (pieces.length === 2 && englishTens.indexOf(pieces[0]) >= 0 &&
      englishSmall.indexOf(pieces[1]) >= 1 && englishSmall.indexOf(pieces[1]) <= 9) return number(value);
  return NaN;
}

function clock(value) {
  value = value.replace(/(\d) *: *(\d)/g, '$1:$2').replace(/([ap]) *\.? *m\.?$/i, '$1m');
  if (/^(?:noon|mediodía|mediodia)$/i.test(value)) return [12, 0];
  var marker = / (am|pm|in the afternoon|in the evening|at night|de la mañana|de la manana|de la tarde|de la noche)$/i.exec(value);
  // Keep the original English grammar's optional space before AM/PM.
  if (!marker) marker = /(am|pm)$/i.exec(value);
  var meridiem = marker && marker[1].toLowerCase();
  var body = (marker ? value.slice(0, marker.index).trim() : value).toLowerCase();
  var numeric = /^(\d{1,2})(?::(\d{2}))?$/.exec(body);
  var hour, minute = 0, subtractQuarter = false, hasMinutes = false, spokenClock = false;
  if (numeric) {
    hour = Number(numeric[1]);
    minute = numeric[2] === undefined ? 0 : Number(numeric[2]);
    hasMinutes = numeric[2] !== undefined;
  } else {
    hour = number(body);
    if (isNaN(hour)) {
      var quarter = /^quarter (past|to) (.+)$|^(.+) menos cuarto$/.exec(body);
      if (quarter) {
        spokenClock = true;
        hour = number(quarter[2] || quarter[3]);
        subtractQuarter = quarter[1] === 'to' || !!quarter[3];
        minute = subtractQuarter ? 45 : 15;
      } else {
        // "treinta y cinco" remains a single minute count, not another hour.
        var split = body.indexOf(' y ');
        if (split >= 0) {
          hour = number(body.slice(0, split));
          var remainder = body.slice(split + 3);
          minute = remainder === 'media' ? 30 : remainder === 'cuarto' ? 15 : number(remainder);
          spokenClock = remainder === 'media' || remainder === 'cuarto';
        } else {
          for (split = body.indexOf(' '); split >= 0; split = body.indexOf(' ', split + 1)) {
            var spokenHour = englishClockNumber(body.slice(0, split));
            var spokenMinute = englishClockNumber(body.slice(split + 1));
            if (!isNaN(spokenHour) && !isNaN(spokenMinute)) {
              hour = spokenHour;
              minute = spokenMinute;
              spokenClock = true;
              break;
            }
          }
        }
      }
      hasMinutes = true;
    }
  }
  if (isNaN(hour) || isNaN(minute) || minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  var inferMeridiem = !meridiem && hour >= 1 && hour <= 12;
  if (meridiem === 'am' || meridiem === 'pm' || meridiem === 'in the afternoon') {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem === 'am' ? 0 : 12);
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
  var dayOffset = 0;
  if (subtractQuarter) {
    hour--;
    if (hour < 0) {
      hour += 24;
      dayOffset = -1;
    }
  }
  if (inferMeridiem) hour %= 12;
  // Day offsets anchor "quarter to twelve AM" to the preceding calendar day.
  return [hour, minute, inferMeridiem, dayOffset, hasMinutes, spokenClock];
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
  var dated = new RegExp(boundary + '(?:(?:on|el) )?' + dayPattern + ' ' + timeConnector + ' (.+)', 'gi');
  while ((match = dated.exec(value))) {
    if (countLike(match[1]) || clock(match[1])) return true;
    dated.lastIndex = match.index + 1;
  }
  if (!/de la (?:mañana|manana)$/i.test(value) &&
      new RegExp(boundary + '(?:(?:on|el) )?' + dayPattern + '(?: (?:and|or|y|o|to|through|a|hasta))?[,.!?;:)]*$', 'i').test(value)) return true;
  // A second explicit clock is ambiguous even without its own date. Do not
  // mistake ordinary title phrases such as "at one point" for a clock.
  var times = new RegExp(boundary + timeConnector + ' (.+)', 'gi');
  while ((match = times.exec(value))) {
    var words = match[1].split(' ');
    for (var i = 1; i <= words.length; i++) {
      var clockValue = words.slice(0, i).join(' ').replace(/[,.!?;:)]*$/, '');
      var parsedClock = clock(clockValue);
      if (parsedClock && (i === words.length || parsedClock[5] || attemptedTime(clockValue))) return true;
    }
    if (/^\d{1,2}(?= |:|$)/.test(match[1])) return true;
    // A second bare written clock conflicts too; require the complete phrase
    // so ordinary titles such as "at one point" remain intact.
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
  if (/\d{1,2}:\d+|\d\s*(?:[ap]\.?m\.?)\b/i.test(value)) return true;
  if (new RegExp(boundary + dayPattern + ' ' + timeConnector + '(?: |$)', 'i').test(value)) return true;
  if (/(?:^| )(?:noon|midnight|mediodía|mediodia|medianoche|tonight|morning|afternoon|evening|night|yesterday|ayer|anteayer|anteanoche|(?:por la|en la|esta) (?:mañana|manana|tarde|noche|madrugada)|de la (?:tarde|noche))(?=$|[ ,.?!])/i.test(value)) return true;
  var relative = new RegExp(boundary + '(?:in|en|dentro de) (.+?) (?:' +
    unitPattern + '|seconds?|segundos?|days?|días?|dias?|weeks?|semanas?|months?|mes(?:es)?|years?|años?)' + end, 'gi');
  if (relative.test(value)) return true;
  var match;
  var clocks = new RegExp(boundary + '(?:' + timeConnector + '|in|en|dentro de) (.+)', 'gi');
  while ((match = clocks.exec(value))) {
    if (countLike(match[1])) return true;
    clocks.lastIndex = match.index + 1;
  }
  var periods = new RegExp(boundary + '([^ ]+?) ?(?:[ap] *\\.? *m\\.?|de la mañana|de la manana|de la tarde|de la noche)' + end, 'gi');
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
    ' ' + (date.getHours() % 12 || 12) + ':' + two(date.getMinutes()) +
    (date.getHours() < 12 ? ' AM' : ' PM');
}

function stripPrompt(value) {
  return value.replace(/^(?:(?:remind|reminde) me(?: to| about)?|remember to|don['’]t forget to|(?:recuérdame|recuerdame|recuerda|recordarme|recordar|avísame|avisame)(?: que)?|no olvides(?: que)?)(?:\s+|$)/i, '');
}

function timezoneQualifier(value) {
  // Only inspect the raw schedule boundary, never words inside an introduced title.
  var abbreviations = 'utc|gmt|ut|z|[ecmp](?:[sd])?t|[ah]st|a[dk]t|akst|akdt|nst|ndt|' +
    'wet|west|cet|cest|eet|eest|bst|ist|msk|pkt|hkt|sgt|jst|kst|' +
    'aest|aedt|acst|acdt|awst|nzst|nzdt|chast|chadt|chst';
  var iana = '(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc|US|Canada|Brazil|Mexico|Chile)/[a-z0-9_+.-]+(?:/[a-z0-9_+.-]+)*';
  return new RegExp('^(?:[ap]\\.?m\\.? *)?(?:\\(|\\[)? *(?:(?:in|en) )?(?:' +
    abbreviations + '|[+−-] *\\d{1,2}(?::?\\d{2})?|' + iana + ')(?=$|[^a-záéíóúüñ0-9_])', 'i').test(value);
}

function invalidScheduleBoundary(value, afterClock, completeClock) {
  // Inspect the raw boundary, before a prompt or "to" introduces title text.
  if (timezoneQualifier(value)) return true;
  if (!afterClock) return new RegExp('^' + timeConnector + '(?=$|[^a-záéíóúüñ0-9])', 'i').test(value);
  if (/^:|^[ap](?= *(?:$|[,;:!?]))|^(?:[ap](?: *\.? *m\.?| *\.)|p|de la (?:mañana|manana|tarde|noche)|in the (?:afternoon|evening)|at night)(?=$|[^a-záéíóúüñ0-9])/i.test(value)) return true;
  // A complete clock can introduce a numbered title without a prompt. Only
  // bare hours still need protection against unsupported minute continuations.
  if (completeClock) return false;
  var first = value.toLowerCase().split(/[ ,.!?;:]/)[0];
  // Unsupported minute fragments must not turn a shorter hour into a schedule.
  return /^[-+\d]/.test(first) || !isNaN(number(first)) ||
    /^(?:half|quarter|minus|negative|hundred|thousand|medio|media|cuarto|menos|cien|ciento|mil)$/.test(first);
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

function calendarDate(year, month, day, advance) {
  var date = new Date(Date.UTC(year, month - 1, day + advance, 12));
  return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

function periodTime(period, amTime, pmTime) {
  return /afternoon|evening|night|tarde|noche/i.test(period) ? pmTime : amTime;
}

function parse(text, reference, settings, preservedTitle) {
  var scheduleOnly = preservedTitle !== undefined;
  if (scheduleOnly) preservedTitle = title(preservedTitle);
  settings = defaults.validate(settings === undefined ? defaults.initial : settings);
  var amTime = settings.amTime.split(':').map(Number);
  var pmTime = settings.pmTime.split(':').map(Number);
  if (typeof text !== 'string' || !text.trim() || text.length > 512) fail('Dictate a short reminder.');
  if (!validInstant(reference)) fail('Phone clock is invalid.');
  var input = stripPrompt(text.trim().replace(/\s+/g, ' '));
  var unsupported = input.replace(new RegExp('(?:^|\\b)(?:(?:next|this|próximo|proximo) (?:' +
    weekdayNames + ')|(?:' + weekdayNames + ') que viene)(?=$|[^a-záéíóúüñ])', 'gi'), '');
  if (/\b(every|daily|weekly|monthly|yearly|recurring|next)\b/i.test(unsupported) ||
      /\b(?:sundays|mondays|tuesdays|wednesdays|thursdays|fridays|saturdays|weekdays|weekends)\b/i.test(input) ||
      /(?:^|[^a-záéíóúüñ])(?:los|las) (?:domingos|lunes|martes|miércoles|miercoles|jueves|viernes|sábados|sabados)(?=$|[^a-záéíóúüñ])/i.test(input) ||
      /(?:^|[^a-záéíóúüñ])(?:cada|todos|todas|diariamente|semanalmente|mensualmente|anualmente|recurrentes?|repetir|diari[oa]s?|semanal(?:es)?|mensual(?:es)?|anual(?:es)?|próxim[oa]s?|proxim[oa]s?|siguientes?)(?=$|[^a-záéíóúüñ])/i.test(unsupported)) {
    fail('Use a single supported date and time, not a repeating expression.');
  }
  if (/\b(?:after|before) tomorrow\b/i.test(input.replace(new RegExp(afterTomorrowPattern, 'gi'), ''))) {
    fail('Use an explicit date for that expression.');
  }
  var relativePattern = new RegExp('^(?:in|en|dentro de) (.+) (' + unitPattern + ')[.!]?$', 'i');
  var topic = '(?: ((?:about|sobre) .+))?[.!]?$';
  var absolutePattern = new RegExp('^' + dayClause + ' ' + timeConnector + ' (.+?)' + topic, 'i');
  var reversedPattern = new RegExp('^' + timeConnector + ' (.+?) ' + dayClause + topic, 'i');
  var clockOnlyPattern = new RegExp('^' + timeConnector + ' (.+?)' + topic, 'i');
  var firstDay = new RegExp('^' + dayClause + '(?:, *| )(.*)$', 'i').exec(input);
  var periodStart = new RegExp('^' + periodPattern + '(?:, *| |$)', 'i');
  var dayPeriod = firstDay && periodStart.exec(firstDay[2]);
  var firstPeriod = !firstDay && periodStart.exec(input);
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
          /^[-+]?\d+(?:[.,]\d+)?$/.test(continuation[1]) ||
          /^(?:a|an|half(?: an?)?|media)$/i.test(continuation[1]))) {
        fail('Use one clear schedule, like "tomorrow at 8 AM".');
      }
      candidates.push({
        title: stripPrompt(leading[3] || '').replace(/^to(?: |$)/i, '').trim(),
        interval: interval,
        calendar: new RegExp('^' + calendarUnitPattern + '$', 'i').test(leading[2]),
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
        candidates.push({
          title: what,
          interval: interval,
          calendar: new RegExp('^' + calendarUnitPattern + '$', 'i').test(relative[2])
        });
      }
    }
    if (absolute && (!/^(?:mañana|manana)$/i.test(absolute[1]) || !morningContext(what))) {
      var time = clock(absolute[2]);
      if (time) candidates.push({ title: what, tail: absolute[3] || '', day: absolute[1].toLowerCase(), time: time });
    }
    var reversed = reversedPattern.exec(suffix);
    if (reversed) {
      time = clock(reversed[1]);
      if (time) candidates.push({ title: what, tail: reversed[3] || '', day: reversed[2].toLowerCase(), time: time });
    }
    var clockOnly = clockOnlyPattern.exec(suffix);
    if (clockOnly) {
      time = clock(clockOnly[1]);
      if (time) candidates.push({ title: what, tail: clockOnly[2] || '', time: time });
    }
  }
  // Keep the longest complete leading schedule; a comma may separate its title.
  if (!candidates.some(function(candidate) { return !candidate.title; })) {
    var leadingSchedule;
    var completeClock;
    var spokenClock;
    for (var end = 1; end <= input.length; end++) {
      if (end < input.length && input.charAt(end - 1) !== ' ' && input.charAt(end - 1) !== ',') continue;
      var prefix = input.slice(0, end).trim().replace(/,$/, '').trim();
      absolute = absolutePattern.exec(prefix);
      reversed = reversedPattern.exec(prefix);
      clockOnly = clockOnlyPattern.exec(prefix);
      time = null;
      var clockText;
      var leadingDay = null;
      if (absolute && !absolute[3]) {
        clockText = absolute[2];
        time = clock(clockText);
        if (time) leadingDay = absolute[1].toLowerCase();
      }
      if (!time && reversed && !reversed[3]) {
        clockText = reversed[1];
        time = clock(clockText);
        if (time) leadingDay = reversed[2].toLowerCase();
      }
      if (!time && clockOnly && !clockOnly[2]) {
        clockText = clockOnly[1];
        time = clock(clockText);
      }
      if (time) {
        var leadingTitle = input.slice(end).trim();
        completeClock = time[4] || (!time[2] && isNaN(number(clockText)));
        spokenClock = time[5];
        leadingSchedule = {
          title: stripPrompt(leadingTitle).replace(/^to(?: |$)/i, ''),
          day: leadingDay,
          time: time,
          leading: true
        };
      }
    }
    if (leadingSchedule) {
      // Check before stripping the prompt so punctuation inside a title stays intact.
      // Malformed clock continuations must not fall back to a shorter valid hour.
      if (invalidScheduleBoundary(leadingTitle, true, completeClock && !spokenClock)) {
        fail('Use one clear schedule, like "tomorrow at 8 AM".');
      }
      candidates.push(leadingSchedule);
    }
  }
  // Explicit schedules win. Defaults apply only after ruling out attempted times,
  // then choosing a named day, or finally an entirely unscheduled title.
  var defaulted = false;
  if (!candidates.length) {
    if (firstDay) {
      var remainder = firstDay[2];
      if (dayPeriod) remainder = remainder.slice(dayPeriod[0].length);
      if (invalidScheduleBoundary(remainder, false)) fail('Use one clear schedule, like "tomorrow at 8 AM".');
      candidates.push({
        title: stripPrompt(remainder).replace(/^to(?: |$)/i, ''),
        day: firstDay[1].toLowerCase(),
        time: periodTime(dayPeriod ? dayPeriod[0] : firstDay[1], amTime, pmTime),
        leading: true
      });
    }
    if (!candidates.length && firstPeriod) {
      remainder = input.slice(firstPeriod[0].length);
      if (invalidScheduleBoundary(remainder, false)) fail('Use one clear schedule, like "tomorrow at 8 AM".');
      candidates.push({
        title: stripPrompt(remainder).replace(/^to(?: |$)/i, ''),
        time: periodTime(firstPeriod[0], amTime, pmTime),
        leading: true
      });
    }
    if (!candidates.length) {
      var dayPeriodPattern = new RegExp('^' + dayClause + ' (' + periodPattern + ')[.!]?$', 'i');
      for (index = 0; index < input.length; index++) {
        if (index && input.charAt(index - 1) !== ' ') continue;
        what = input.slice(0, index).trim();
        var lastPeriod = dayPeriodPattern.exec(input.slice(index));
        if (lastPeriod && !morningContext(what)) {
          if (attemptedTime(what)) fail('Use one clear schedule, like "tomorrow at 8 AM".');
          candidates.push({
            title: what,
            day: lastPeriod[1].toLowerCase(),
            time: periodTime(lastPeriod[2], amTime, pmTime)
          });
        }
      }
    }
    if (!candidates.length) {
      if (attemptedTime(input.replace(new RegExp(todayPeriodPattern, 'gi'), ''))) {
        fail('Use one clear schedule, like "tomorrow at 8 AM".');
      }
      var dayOnlyPattern = new RegExp('^' + dayClause + topic, 'i');
      for (index = 0; index < input.length; index++) {
        if (index && input.charAt(index - 1) !== ' ') continue;
        what = input.slice(0, index).trim();
        var dayOnly = dayOnlyPattern.exec(input.slice(index));
        if (dayOnly && !morningContext(what)) {
          candidates.push({
            title: what, tail: dayOnly[2] || '', day: dayOnly[1].toLowerCase(),
            time: periodTime(dayOnly[1], amTime, pmTime)
          });
        }
      }
    }
    if (!candidates.length) {
      if (containsDay(input) || competingSchedule(input)) fail('Use one clear schedule, like "tomorrow at 8 AM".');
      if (scheduleOnly) fail('Speak only a supported date or time.');
      var now = new Date(reference);
      var nextDay = now.getHours() * 60 + now.getMinutes() >= pmTime[0] * 60 + pmTime[1];
      var defaultTime = nextDay ? amTime : pmTime;
      var targetDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (nextDay ? 1 : 0), 12);
      return draft(input, resolveWall([
        targetDay.getFullYear(), targetDay.getMonth() + 1, targetDay.getDate(), defaultTime[0], defaultTime[1]
      ]), reference);
    }
    defaulted = true;
  }
  // Prefer the complete date clause over its article/qualifier-free variants
  // and the clock-only suffix within the same clause.
  candidates = candidates.filter(function(candidate) {
    return !candidates.some(function(other) {
      if (other.title.length >= candidate.title.length) return false;
      var extra = candidate.title.slice(other.title.length).trim();
      return /^(?:(?:on|el) )?(?:next|this|próximo|proximo)$|^(?:on|el)$/i.test(extra) ||
        (other.day && extra.toLowerCase() + ' ' + candidate.day === other.day) ||
        (!candidate.day && other.day && new RegExp('^' + dayClause + '$', 'i').test(extra));
    });
  });
  if (candidates.length !== 1) fail('Use one clear schedule, like "tomorrow at 8 AM".');
  var selected = candidates[0];
  if (!defaulted && new RegExp('^' + todayPeriodPattern + '$', 'i').test(selected.day || '')) {
    fail('Use one clear schedule, like "today at 8 AM".');
  }
  if (firstPeriod && !selected.leading) fail('Use one clear schedule, like "tomorrow at 8 AM".');
  if (firstDay && !selected.leading && selected.title &&
      (dayPeriod || stripPrompt(firstDay[2]) !== firstDay[2])) {
    fail('Use one clear schedule, like "tomorrow at 8 AM".');
  }
  if (selected.leading) {
    if (!scheduleOnly && /^(?:to)?[.!?,;:]*$/i.test(selected.title)) fail('A reminder needs a title.');
    // A leading schedule must not turn modifiers or a second schedule into a title.
    if (attemptedTime(selected.title) ||
        /^(?:more|later|from now|ago|before|after|and|or|más|mas|antes|después|despues|desde|y|o)(?=$|[ ,.?!])/i.test(selected.title)) {
      fail('Use one clear schedule, like "tomorrow at 8 AM".');
    }
  }
  var tail = selected.tail || '';
  what = selected.title + (tail ? ' ' + tail : '');
  if (scheduleOnly && what.trim()) fail('Speak only a supported date or time, without a title.');
  if (competingSchedule(selected.title) || competingSchedule(tail) || competingSchedule(what) ||
      (!selected.day && !selected.interval &&
        (attemptedTime(what) || /(?:^| )de la (?:mañana|manana)$/i.test(what))) ||
      (defaulted && (containsDay(selected.title) || containsDay(tail)))) {
    fail('Use one clear schedule, like "tomorrow at 8 AM".');
  }
  if (selected.interval) {
    var relativeInstant = reference + selected.interval;
    if (selected.calendar) {
      var captured = new Date(reference);
      var shifted = calendarDate(captured.getFullYear(), captured.getMonth() + 1,
        captured.getDate(), selected.interval / DAY);
      relativeInstant = resolveWall(shifted.concat([captured.getHours(), captured.getMinutes()])) +
        captured.getSeconds() * 1000 + captured.getMilliseconds();
    }
    return draft(scheduleOnly ? preservedTitle : selected.title, relativeInstant, reference);
  }
  var local = new Date(reference);
  var day = selected.day;
  var y = local.getFullYear(), m = local.getMonth() + 1, d = local.getDate();
  var lastClockMinute = selected.time[0] * 60 + selected.time[1] + (selected.time[2] ? 12 * 60 : 0) +
    (day && selected.time[3] ? selected.time[3] * 24 * 60 : 0);
  var currentMinute = local.getHours() * 60 + local.getMinutes();
  var monthDay = day && new RegExp('^(' + monthNames + ') (\\d{1,2})$|^(\\d{1,2}) de (' + monthNames + ')$', 'i').exec(day);
  if (monthDay) {
    var monthName = monthDay[1] || monthDay[4];
    months.forEach(function(names, index) {
      if (names.indexOf(monthName) >= 0) m = index + 1;
    });
    d = Number(monthDay[2] || monthDay[3]);
    // Validate the calendar date before considering its next annual occurrence.
    var calendar = new Date(Date.UTC(2000, m - 1, d));
    if (calendar.getUTCMonth() !== m - 1 || calendar.getUTCDate() !== d) fail('Invalid date. Choose another date.');
    var beforeToday = m < local.getMonth() + 1 ||
      (m === local.getMonth() + 1 && d < local.getDate());
    var passedToday = m === local.getMonth() + 1 && d === local.getDate() &&
      lastClockMinute <= currentMinute;
    if (beforeToday || passedToday) y++;
  } else if (day && /^\d{4}-/.test(day)) {
    var pieces = day.split('-');
    y = Number(pieces[0]); m = Number(pieces[1]); d = Number(pieces[2]);
  } else if (!day || (day !== 'today' && day !== 'hoy' &&
      !new RegExp('^' + todayPeriodPattern + '$', 'i').test(day))) {
    var next = day && /^(?:next|próximo|proximo) | que viene$/.test(day);
    var plainDay = day && day.replace(/^(?:next|this|próximo|proximo) /, '').replace(/ que viene$/, '');
    var weekday = -1;
    weekdays.forEach(function(names, index) {
      if (names.indexOf(plainDay) >= 0) weekday = index;
    });
    var advance;
    if (!day) advance = lastClockMinute <= currentMinute ? 1 : 0;
    else advance = new RegExp('^' + afterTomorrowPattern + '$', 'i').test(day) ? 2 :
      /^(tomorrow|mañana|manana)$/.test(day) ? 1 : (weekday - local.getDay() + 7) % 7;
    if (next && !advance) advance = 7;
    var target = calendarDate(y, m, d, advance);
    y = target[0]; m = target[1]; d = target[2];
  }
  if (day && selected.time[3]) {
    var anchor = new Date(Date.UTC(y, m - 1, d));
    if (anchor.getUTCFullYear() !== y || anchor.getUTCMonth() !== m - 1 || anchor.getUTCDate() !== d) {
      fail('Invalid date. Choose another date.');
    }
    target = calendarDate(y, m, d, selected.time[3]);
    y = target[0]; m = target[1]; d = target[2];
  }
  var instant = resolveWall([y, m, d, selected.time[0], selected.time[1]]);
  if (selected.time[2] && instant <= reference) {
    instant = resolveWall([y, m, d, selected.time[0] + 12, selected.time[1]]);
  }
  return draft(scheduleOnly ? preservedTitle : what, instant, reference);
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
  parseTime: function(text, reference, settings, preservedTitle) {
    return parse(text, reference, settings, title(preservedTitle));
  },
  draft: draft,
  validate: validate,
  withTime: withTime,
  title: title,
  localDisplay: localDisplay,
  zoneContext: zoneContext,
  resolveWall: resolveWall,
  fail: fail
};
