'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../app/src/pkjs/parser');

function zone(name, run) {
  const previous = process.env.TZ;
  process.env.TZ = name;
  try { run(); } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test('relative phrases use the captured reference, not the confirmation clock', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  const draft = parser.parse('Remind me to Buy milk in 20 minutes', reference);
  assert.equal(draft.title, 'Buy milk');
  assert.equal(draft.instant, reference + 20 * 60000);
  parser.validate(draft, reference + 10 * 60000);
  assert.equal(draft.instant, reference + 20 * 60000);
  assert.throws(() => parser.validate(draft, draft.instant), /passed/);
}));

test('leading relative clauses preserve original-language titles and the captured reference', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12, 34, 56, 789);
  for (const [phrase, title, minutes = 5] of [
    ['recuerdame en 5 minutos ver mensajes', 'ver mensajes'],
    ['remind me in 5 minutes to see message', 'see message'],
    ['Recuérdame en cinco minutos ver mensajes', 'ver mensajes'],
    ['RECUÉRDAME QUE DENTRO DE FIVE MINUTOS TO ¡Ver Café!', '¡Ver Café!'],
    ['Remind me to en cinco minutes revisar ÁNA', 'revisar ÁNA'],
    ['in 5 minutes see message', 'see message'],
    ['en 5 minutos to-do list', 'to-do list'],
    ['in 5 minutes to to-do list', 'to-do list'],
    ['in 5 minutes to 30 minutes of practice', '30 minutes of practice'],
    ['in 5 minutes 30 items to review', '30 items to review'],
    ['in 5 minutes 30 ideas for five minutes of practice', '30 ideas for five minutes of practice'],
    ['in 5 minutes tomorrow planning', 'tomorrow planning'],
    ['en cinco minutos Plan de la mañana', 'Plan de la mañana'],
    ['in an hour to Check in with Ana', 'Check in with Ana', 60],
    ['dentro de veintiún hours revisar Café', 'revisar Café', 21 * 60],
    ['in 10080 minutes to Test', 'Test', 10080],
    ['in 8784 hours to Test', 'Test', 8784 * 60],
    ['Remind me see message in 5 minutes', 'see message']
  ]) {
    const actual = parser.parse(phrase, reference);
    assert.equal(actual.title, title, phrase);
    assert.equal(actual.reference, reference, phrase);
    assert.equal(actual.instant, reference + minutes * 60000, phrase);
    parser.validate(actual, reference + 60000);
    assert.equal(actual.instant, reference + minutes * 60000, phrase);
  }
  assert.equal(parser.parse('in 5 minutes to ' + 'é'.repeat(80), reference).title, 'é'.repeat(80));
  assert.throws(() => parser.parse('in 5 minutes to ' + 'é'.repeat(81), reference), /long/);
  assert.throws(() => parser.parse('in 5 minutes to \ud800', reference), /invalid text/);
}));

test('leading relative clauses reject missing titles, modifiers and additional or invalid schedules', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  for (const phrase of [
    'remind me', 'remind me to', 'remind me in five minutes',
    'Recuérdame en cinco minutos', 'in five minutes to', 'in five minutes TO!',
    'in five minutes to .', 'in five minutes .', 'in five minutes to to',
    'remind me in 5 hours 30 minutes to Test',
    'recuerdame en 5 horas 30 minutos ver mensajes',
    'in 5 minutes 30 seconds to Test',
    'in five hours thirty minutes to Test',
    'en cinco horas TREINTA Y CINCO minutos ver mensajes',
    'in five minutes veintidós segundos to Test',
    'in five minutes two days to Test',
    'en cinco minutos dos semanas ver mensajes',
    'in five minutes three months to Test',
    'in five minutes four years to Test',
    'in five minutes 1.5 seconds to Test',
    'in five minutes -30 seconds to Test',
    'in five minutes later see message', 'en cinco minutos más ver mensajes',
    'in five minutes from now to see message', 'in five minutes ago see message',
    'en cinco minutos después ver mensajes', 'in five minutes and see message',
    'in five minutes to Test in ten minutes',
    'in five minutes to Test en -5 minutos',
    'in five minutes to Test tomorrow at 15:30',
    'in five minutes to Test tomorrow',
    'in five minutes to Test at three',
    'in five minutes to Test in two days',
    'in five minutes to Test in half an hour',
    'in five minutes to Test tonight',
    'in five minutes to Test por la tarde',
    'in five minutes to Test at noon',
    'in five minutes to Test at 25:00',
    'in five minutes to Test (en diez minutos)',
    'in five minutes to Test, tomorrow at 15:30',
    'in five minutes to Test daily',
    'in five minutes to Test next Friday',
    'in zero minutes to Test', 'en cero minutos ver mensajes',
    'in -5 minutes to Test', 'in +5 minutes to Test',
    'in 1.5 minutes to Test', 'en 1,5 horas ver mensajes',
    'in twenty y uno minutes to Test', 'en treinta five minutos ver mensajes',
    'in one hundred minutes to Test', 'in a few minutes to Test',
    'en medio minuto ver mensajes', 'in 10081 minutes to Test',
    'in 8785 hours to Test', 'in 10080 hours to Test',
    'in five seconds to Test', 'en cinco días ver mensajes',
    'in five mins to Test', 'in five to Test'
  ]) assert.throws(() => parser.parse(phrase, reference), undefined, phrase);
}));

test('explicit grammar supports today, tomorrow, weekday, ISO date and AM/PM', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  for (const [phrase, instant] of [
    ['Test today at 15:30', Date.UTC(2026, 9, 14, 15, 30)],
    ['Test tomorrow at 3 PM', Date.UTC(2026, 9, 15, 15)],
    ['Test on friday at 12 AM', Date.UTC(2026, 9, 16)],
    ['Test 2026-10-20 at 12 PM', Date.UTC(2026, 9, 20, 12)],
    ['Test in an hour', reference + 3600000]
  ]) assert.equal(parser.parse(phrase, reference).instant, instant);
}));

test('Spanish and English grammar can be mixed independently without changing the title', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  for (const [phrase, title, instant] of [
    ['Recuérdame comprar leche mañana a las 3 PM', 'comprar leche', Date.UTC(2026, 9, 15, 15)],
    ['remind me to llamar a Ana en veinte minutes', 'llamar a Ana', reference + 20 * 60000],
    ['Comprar leche tomorrow at 15:30', 'Comprar leche', Date.UTC(2026, 9, 15, 15, 30)],
    ['Call Sam en cinco minutos', 'Call Sam', reference + 5 * 60000],
    ['Test el miércoles a las 15:30', 'Test', Date.UTC(2026, 9, 14, 15, 30)],
    ['RECUERDAME QUE Llamar a ÁNA hoy at 15:30.', 'Llamar a ÁNA', Date.UTC(2026, 9, 14, 15, 30)],
    ['Recordarme revisar Café Mañana pendiente mañana a la 3 PM!', 'revisar Café Mañana pendiente', Date.UTC(2026, 9, 15, 15)],
    ['Recuérdame que enviar el Diseño in twenty one minutos', 'enviar el Diseño', reference + 21 * 60000],
    ['Test dentro de two horas', 'Test', reference + 120 * 60000],
    ['Test in veintiún hours', 'Test', reference + 21 * 3600000],
    ['Test en 2 hours', 'Test', reference + 2 * 3600000],
    ['Test 2026-10-20 a las 15:30', 'Test', Date.UTC(2026, 9, 20, 15, 30)],
    ['Test el tomorrow a la 3PM', 'Test', Date.UTC(2026, 9, 15, 15)]
  ]) {
    const actual = parser.parse(phrase, reference);
    assert.equal(actual.title, title, phrase);
    assert.equal(actual.instant, instant, phrase);
  }
}));

test('weekday aliases, articles, accents and case resolve the same phone-local day', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  const aliases = [
    ['sunday', 'domingo'], ['monday', 'lunes'], ['tuesday', 'martes'],
    ['wednesday', 'miércoles', 'miercoles'], ['thursday', 'jueves'],
    ['friday', 'viernes'], ['saturday', 'sábado', 'sabado']
  ];
  aliases.forEach((names, index) => {
    const days = (index - 3 + 7) % 7;
    for (const name of names) {
      for (const article of ['', 'on ', 'el ']) {
        const phrase = 'Test ' + article + name.toUpperCase() + ' a las 15:30';
        assert.equal(parser.parse(phrase, reference).instant, reference + days * 86400000 + 210 * 60000, phrase);
      }
    }
  });
  assert.equal(parser.parse('Test MANANA at 3 PM', reference).instant, Date.UTC(2026, 9, 15, 15));
}));

test('written relative counts are exact, bounded and interchangeable with connectors and units', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  const counts = [
    ['a', 1], ['an', 1], ['one', 1], ['un', 1], ['una', 1], ['uno', 1],
    ['two', 2], ['dos', 2], ['three', 3], ['tres', 3], ['four', 4], ['cuatro', 4],
    ['five', 5], ['cinco', 5], ['six', 6], ['seis', 6], ['seven', 7], ['siete', 7],
    ['eight', 8], ['ocho', 8], ['nine', 9], ['nueve', 9], ['ten', 10], ['diez', 10],
    ['eleven', 11], ['once', 11], ['twelve', 12], ['doce', 12], ['thirteen', 13], ['trece', 13],
    ['fourteen', 14], ['catorce', 14], ['fifteen', 15], ['quince', 15],
    ['sixteen', 16], ['dieciséis', 16], ['dieciseis', 16], ['seventeen', 17], ['diecisiete', 17],
    ['eighteen', 18], ['dieciocho', 18], ['nineteen', 19], ['diecinueve', 19],
    ['twenty', 20], ['veinte', 20], ['twenty one', 21], ['twenty-one', 21], ['veintiuno', 21],
    ['veintidós', 22], ['veintidos', 22], ['veintitrés', 23], ['veintitres', 23],
    ['veintiséis', 26], ['veintiseis', 26], ['veintinueve', 29],
    ['treinta', 30], ['thirty five', 35], ['treinta y cinco', 35],
    ['forty', 40], ['cuarenta y dos', 42], ['fifty', 50], ['cincuenta y uno', 51],
    ['sixty', 60], ['sesenta y dos', 62], ['seventy', 70], ['setenta y tres', 73],
    ['eighty', 80], ['ochenta y cuatro', 84], ['ninety nine', 99], ['noventa y nueve', 99],
    ['100', 100], ['10080', 10080]
  ];
  for (const [count, value] of counts) {
    for (const connector of ['in', 'en', 'dentro de']) {
      for (const unit of ['minute', 'minutes', 'minuto', 'minutos', 'hour', 'hours', 'hora', 'horas']) {
        // The existing interval limit is 10080; draft() still bounds the result to a year.
        if (value === 10080 && /hour|hora/.test(unit)) continue;
        const phrase = `Test ${connector} ${count.toUpperCase()} ${unit}`;
        assert.equal(parser.parse(phrase, reference).instant, reference + value * (/hour|hora/.test(unit) ? 60 : 1) * 60000, phrase);
        const leading = `${connector} ${count.toUpperCase()} ${unit} to Test`;
        const actual = parser.parse(leading, reference);
        assert.equal(actual.title, 'Test', leading);
        assert.equal(actual.instant, reference + value * (/hour|hora/.test(unit) ? 60 : 1) * 60000, leading);
      }
    }
  }
}));

test('clock words require an explicit, conservatively bounded AM/PM or Spanish day period', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  for (const [clock, hour, minute] of [
    ['tres PM', 15, 0], ['una AM', 1, 0], ['doce AM', 0, 0], ['doce PM', 12, 0],
    ['TRES Y TREINTA Y CINCO PM', 15, 35], ['tres y five PM', 15, 5],
    ['three y veinte PM', 15, 20], ['veintitrés y cincuenta y nueve de la noche', 23, 59],
    ['tres de la tarde', 15, 0], ['quince de la tarde', 15, 0],
    ['once de la mañana', 11, 0], ['once de la manana', 11, 0],
    ['ocho y cero de la noche', 20, 0], ['veinte de la noche', 20, 0],
    ['3:05 de la tarde', 15, 5], ['23:59', 23, 59], ['0:00', 0, 0]
  ]) {
    const phrase = 'Test mañana a las ' + clock;
    assert.equal(parser.parse(phrase, reference).instant, Date.UTC(2026, 9, 15, hour, minute), phrase);
  }
  for (const clock of [
    'tres', 'quince', 'three', '3', '3 de la noche', '12 de la noche',
    'doce de la mañana', 'doce de la tarde', 'ocho de la tarde', 'cero AM',
    'veintitrés PM', 'veinticuatro de la noche', 'tres y sesenta PM',
    'tres y media PM', 'tres y cuarto PM', 'tres menos cinco PM',
    'three thirty PM', '3:5 PM', '3 y -5 PM', '3 y 1.5 PM'
  ]) assert.throws(() => parser.parse('Test mañana a las ' + clock, reference), undefined, clock);
}));

test('title extraction preserves original accents, case and punctuation, with existing whitespace and byte rules', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  const what = '¡Llamar a ÁNA! — Café, pingüino & MIÉRCOLES especial';
  assert.equal(parser.parse('Recuérdame que ' + what + ' mañana a las 3 PM', reference).title, what);
  assert.equal(parser.parse('  RECUÉRDAME   Café   con ÁNA  en cinco minutos  ', reference).title, 'Café con ÁNA');
  assert.equal(parser.parse('é'.repeat(80) + ' en cinco minutos', reference).title, 'é'.repeat(80));
  assert.throws(() => parser.parse('é'.repeat(81) + ' en cinco minutos', reference), /long/);
  assert.throws(() => parser.parse('\ud800 en cinco minutos', reference), /invalid text/);
  // Prefixes are anchored full words, not substring replacement or locale detection.
  assert.equal(parser.parse('Recordar el café en cinco minutos', reference).title, 'Recordar el café');
  assert.equal(parser.parse('Mi recuérdame favorito en cinco minutos', reference).title, 'Mi recuérdame favorito');
}));

test('competing schedules cannot silently become title text, but overlapping ordinary words can', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  for (const phrase of [
    'Test in five minutes en diez minutos',
    'Test en cinco minutos tomorrow at 15:30',
    'Test tomorrow at 3 PM en cinco minutos',
    'Test hoy a las tres PM tomorrow at 15:30',
    'Test mañana a las tres tomorrow at 15:30',
    'Test tomorrow today at 15:30',
    'Test tomorrow and hoy at 15:30',
    'Test at 3 PM tomorrow at 15:30',
    'Test a las tres PM en cinco minutos',
    'Test at 15:30 en cinco minutos',
    'Test in half an hour en cinco minutos',
    'Test en -5 minutos in twenty minutes',
    'Check in with Ana en cinco minutos in ten minutes',
    'Test in five minutes, tomorrow at 15:30',
    'Test (en cinco minutos) tomorrow at 15:30',
    'Test (a las tres PM), en cinco minutos',
    'Test tomorrow, hoy at 15:30',
    'Discuss today at home and tomorrow at three en cinco minutos',
    'Test de lunes a viernes a las 15:30',
    'Test Monday through Friday at 15:30'
  ]) assert.throws(() => parser.parse(phrase, reference), undefined, phrase);
  for (const what of [
    'tomorrow planning', 'mañana planning', 'Call Friday team', 'Go in with Ana',
    'Pensar en Ana', 'Ir dentro de casa', 'Look at one point', 'Mirar a la niña',
    'Read at home', 'Comprar el miércoles especial', 'Revisar minutos y horas',
    'Plan de la mañana', 'Call on Sam', 'Research at scale'
  ]) {
    assert.equal(parser.parse(what + ' en cinco minutes', reference).title, what);
    assert.equal(parser.parse(what + ' tomorrow at 15:30', reference).title, what);
  }
}));

test('relative candidates require clarification for conflicting dates and unresolved written clocks', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  for (const phrase of [
    'Prueba mañana en veinte minutos',
    'Test 2026-10-20 en veinte minutos',
    'Prueba a las tres en veinte minutos',
    'Test tomorrow in twenty minutes',
    'Prueba MANANA dentro de twenty minutos',
    'Test el miércoles en veinte minutos',
    'Test on Friday in twenty minutes',
    'Test at three in twenty minutes',
    'Test a la una en veinte minutos',
    'Test at twenty one en veinte minutos',
    'Test a las tres y treinta y cinco en veinte minutos',
    'Test at three, en veinte minutos',
    'Test at three and in twenty minutes',
    'Test a las tres tomorrow at 15:30'
  ]) assert.throws(() => parser.parse(phrase, reference), undefined, phrase);
  for (const what of ['Look at one point', 'tomorrow planning', 'mañana planning', 'Plan de la mañana']) {
    const result = parser.parse(what + ' en veinte minutos', reference);
    assert.equal(result.title, what);
    assert.equal(result.instant, reference + 20 * 60000);
  }
}));

test('Spanish and mixed unsupported, negative, fractional, recurring and next expressions are rejected', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  for (const phrase of [
    'Recuérdame en cinco minutos',
    'Test en cero minutos', 'Test en zero hours', 'Test en -1 minutos', 'Test in +1 hours',
    'Test en 1.5 minutos', 'Test en 1,5 horas', 'Test en menos cinco minutos',
    'Test en una y media horas', 'Test en medio minuto', 'Test in a few minutes',
    'Test in twenty y uno minutes', 'Test en treinta five minutos',
    'Test en cien minutos', 'Test in one hundred minutes', 'Test en 10081 minutos',
    'Test en veintiunodos minutos', 'Test in twenty zero minutes', 'Test en dos minutos más',
    'Test la próxima semana a las 15:30', 'Test próximo viernes a las 15:30',
    'Test proximo viernes a las 15:30', 'Test el siguiente miércoles a las 15:30',
    'Test cada día en cinco minutos', 'Test todos los días tomorrow at 15:30',
    'Test todas las semanas en cinco minutos', 'Test diariamente mañana at 15:30',
    'Test semanalmente in two hours', 'Test mensual en cinco minutos',
    'Test recurrente hoy at 15:30', 'Test a diario en cinco minutos',
    'Test (cada día) en cinco minutos', 'Test:próximo viernes en cinco minutos',
    'Test los lunes a las 15:30', 'Test los sábados in five minutes',
    'Test Mondays en cinco minutos', 'Test on weekdays tomorrow at 15:30',
    'Test hoy a las 11:59', 'Test el miércoles a las 11:00',
    'Test 2027-02-30 a las 15:30', 'Test mañana a las 24:00',
    'Test mañana a las 3', 'Test mañana a las 15:60'
  ]) assert.throws(() => parser.parse(phrase, reference), undefined, phrase);
}));

test('empty, ambiguous, invalid, past and unsupported expressions require clarification', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 12);
  for (const phrase of [
    '', 'Test tomorrow at 3', 'Test next friday at 13:00',
    'Test daily at 13:00', 'Test in 0 minutes', 'Test in -1 hours', 'Test in 99999 hours',
    'Test today at 11:59', 'Test wednesday at 11:00', 'Test 2027-02-30 at 13:00',
    'Test 2026-13-01 at 13:00', 'Test tomorrow at 24:00', 'Test tomorrow at 15:60',
    'Test tomorrow at 0 PM', 'Test tomorrow at 13 AM', 'Test 2028-01-01 at 13:00'
  ]) assert.throws(() => parser.parse(phrase, reference), undefined, phrase);
  assert.throws(() => parser.parse('Test in 1 hour', NaN), /clock/);
}));

test('rejects DST gaps and overlaps, including half-hour transitions', () => {
  zone('America/New_York', () => {
    assert.throws(() => parser.resolveWall([2027, 3, 14, 2, 30]), /gap/);
    assert.throws(() => parser.resolveWall([2026, 11, 1, 1, 30]), /twice/);
    assert.equal(parser.resolveWall([2026, 11, 1, 3, 0]), Date.UTC(2026, 10, 1, 8));
  });
  zone('Australia/Lord_Howe', () => {
    assert.throws(() => parser.resolveWall([2026, 10, 4, 2, 15]), /gap/);
    assert.throws(() => parser.resolveWall([2027, 4, 4, 1, 45]), /twice/);
  });
});

test('bilingual absolute parsing keeps DST gap and overlap rejection unchanged', () => {
  zone('America/New_York', () => {
    assert.throws(() => parser.parse('Recuérdame probar 2027-03-14 a las dos y treinta AM', Date.UTC(2027, 2, 13, 12)), /gap/);
    assert.throws(() => parser.parse('Test 2026-11-01 a la una y treinta AM', Date.UTC(2026, 9, 31, 12)), /twice/);
    assert.equal(parser.parse('Test 2026-11-01 a las tres AM', Date.UTC(2026, 9, 31, 12)).instant, Date.UTC(2026, 10, 1, 8));
    const reference = Date.UTC(2026, 9, 31, 12);
    assert.equal(parser.parse('Test en cuarenta y ocho hours', reference).instant, reference + 48 * 3600000);
  });
  zone('Australia/Lord_Howe', () => {
    assert.throws(() => parser.parse('Test 2026-10-04 a las dos y quince AM', Date.UTC(2026, 9, 3, 0)), /gap/);
    assert.throws(() => parser.parse('Test 2027-04-04 a las una y cuarenta y cinco AM', Date.UTC(2027, 3, 3, 0)), /twice/);
  });
});

test('timezone travel invalidates a draft, ordinary clock/DST progress does not', () => {
  const reference = Date.UTC(2026, 9, 31, 12);
  let draft;
  zone('America/New_York', () => {
    draft = parser.parse('Test in 48 hours', reference);
    parser.validate(draft, reference + 24 * 3600000);
    assert.equal(parser.localDisplay(draft.instant), '2026-11-02\n07:00');
  });
  zone('Europe/Paris', () => assert.throws(() => parser.validate(draft, reference), /timezone/));
});

test('titles have a UTF-8 byte bound and reject malformed Unicode', () => {
  assert.equal(parser.title('  Buy   milk  '), 'Buy milk');
  assert.equal(parser.title('a'.repeat(160)).length, 160);
  assert.equal(parser.title('é'.repeat(80)).length, 80);
  assert.throws(() => parser.title('é'.repeat(81)), /long/);
  assert.throws(() => parser.title('\ud800'), /invalid text/);
  assert.throws(() => parser.title(' '), /title/);
});

test('manual editing resolves phone wall time and still requires future valid dates', () => zone('UTC', () => {
  const now = Date.UTC(2026, 9, 14, 12);
  const draft = parser.parse('Test in 20 minutes', now);
  const edited = parser.withTime(draft, '2026-10-15', '16:45', now);
  assert.equal(edited.instant, Date.UTC(2026, 9, 15, 16, 45));
  assert.throws(() => parser.withTime(draft, '2026-02-30', '16:45', now), /Invalid date/);
  assert.throws(() => parser.withTime(draft, '2026-10-15', '24:00', now), /valid date/);
  assert.throws(() => parser.validate({ ...draft, reference: draft.instant + 1 }, now), /invalid/);
}));

test('an explicit time before a topic preserves the title and morning means AM, not tomorrow', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 6);
  for (const [text, title, instant] of [
    ['Enviar un mensaje mañana a las 8 de la mañana sobre la prueba', 'Enviar un mensaje sobre la prueba', Date.UTC(2026, 9, 15, 8)],
    ['Enviar un mensaje mañana a las ocho de la mañana sobre la prueba', 'Enviar un mensaje sobre la prueba', Date.UTC(2026, 9, 15, 8)],
    ['Enviar un mensaje hoy a las 8 de la mañana sobre la prueba', 'Enviar un mensaje sobre la prueba', Date.UTC(2026, 9, 14, 8)],
    ['Send a message tomorrow at 8 AM about the test', 'Send a message about the test', Date.UTC(2026, 9, 15, 8)],
    ['Enviar un mensaje tomorrow at 8AM SOBRE ¡La PRUEBA!', 'Enviar un mensaje SOBRE ¡La PRUEBA!', Date.UTC(2026, 9, 15, 8)],
    ['Test on Friday at 15:30 about Café', 'Test about Café', Date.UTC(2026, 9, 16, 15, 30)],
    ['Tomorrow at 8 AM about the test', 'about the test', Date.UTC(2026, 9, 15, 8)],
    ['Check in tomorrow at 8 AM about the test', 'Check in about the test', Date.UTC(2026, 9, 15, 8)]
  ]) {
    const actual = parser.parse(text, reference);
    assert.equal(actual.title, title, text);
    assert.equal(actual.instant, instant, text);
  }
  assert.throws(() => parser.parse('é'.repeat(75) + ' tomorrow at 8 AM about the test', reference), /long/);
}));

test('named days without a time default to 10 AM, keeping phone-local dates and past-date rejection', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 6);
  for (const [text, title, instant] of [
    ['Test tomorrow', 'Test', Date.UTC(2026, 9, 15, 10)],
    ['Recuérdame probar mañana', 'probar', Date.UTC(2026, 9, 15, 10)],
    ['Test MANANA', 'Test', Date.UTC(2026, 9, 15, 10)],
    ['Mañana revisar prueba', 'revisar prueba', Date.UTC(2026, 9, 15, 10)],
    ['Test mañana sobre la prueba', 'Test sobre la prueba', Date.UTC(2026, 9, 15, 10)],
    ['Test today', 'Test', Date.UTC(2026, 9, 14, 10)],
    ['Test hoy', 'Test', Date.UTC(2026, 9, 14, 10)],
    ['Test el miércoles', 'Test', Date.UTC(2026, 9, 14, 10)],
    ['Test on Friday', 'Test', Date.UTC(2026, 9, 16, 10)],
    ['El viernes revisar prueba', 'revisar prueba', Date.UTC(2026, 9, 16, 10)],
    ['Test 2026-10-20', 'Test', Date.UTC(2026, 9, 20, 10)]
  ]) {
    const actual = parser.parse(text, reference);
    assert.equal(actual.title, title, text);
    assert.equal(actual.instant, instant, text);
  }
  for (const now of [Date.UTC(2026, 9, 14, 10), Date.UTC(2026, 9, 14, 21)]) {
    assert.throws(() => parser.parse('Test today', now), /passed/);
    assert.throws(() => parser.parse('Test miércoles', now), /passed/);
    assert.equal(parser.parse('Test mañana', now).instant, Date.UTC(2026, 9, 15, 10));
  }
}));

test('no day or time defaults to 8 PM today before the cutoff, otherwise 10 AM tomorrow', () => zone('UTC', () => {
  for (const [reference, expected] of [
    [Date.UTC(2026, 9, 14, 0), Date.UTC(2026, 9, 14, 20)],
    [Date.UTC(2026, 9, 14, 19, 59, 59, 999), Date.UTC(2026, 9, 14, 20)],
    [Date.UTC(2026, 9, 14, 20), Date.UTC(2026, 9, 15, 10)],
    [Date.UTC(2026, 9, 14, 23, 59), Date.UTC(2026, 9, 15, 10)],
    [Date.UTC(2026, 11, 31, 21), Date.UTC(2027, 0, 1, 10)]
  ]) {
    for (const text of ['Revisar la prueba', 'Remind me to revisar la prueba', 'Plan de la mañana']) {
      const actual = parser.parse(text, reference);
      assert.equal(actual.title, text.replace('Remind me to ', ''));
      assert.equal(actual.instant, expected, text);
    }
  }
  const reference = Date.UTC(2026, 9, 14, 19, 59);
  const pending = parser.parse('Test', reference);
  parser.validate(pending, reference + 30000);
  assert.throws(() => parser.validate(pending, Date.UTC(2026, 9, 14, 20)), /passed/);
  assert.equal(pending.instant, Date.UTC(2026, 9, 14, 20));
}));

test('default wall times follow the phone timezone and DST rather than fixed elapsed hours', () => {
  zone('America/New_York', () => {
    assert.equal(parser.parse('Test', Date.UTC(2026, 9, 15, 0)).instant, Date.UTC(2026, 9, 15, 14));
    assert.equal(parser.parse('Test mañana', Date.UTC(2026, 9, 14, 12)).instant, Date.UTC(2026, 9, 15, 14));
    assert.equal(parser.parse('Test tomorrow', Date.UTC(2027, 2, 13, 12)).instant, Date.UTC(2027, 2, 14, 14));
    assert.equal(parser.parse('Test', Date.UTC(2026, 10, 1, 1)).instant, Date.UTC(2026, 10, 1, 15));
    assert.equal(parser.parse('Test today', Date.UTC(2026, 10, 1, 5)).instant, Date.UTC(2026, 10, 1, 15));
  });
  zone('Europe/Madrid', () => {
    assert.equal(parser.parse('Test', Date.UTC(2026, 9, 14, 17, 59)).instant, Date.UTC(2026, 9, 14, 18));
    assert.equal(parser.parse('Test', Date.UTC(2026, 9, 14, 18)).instant, Date.UTC(2026, 9, 15, 8));
    assert.equal(parser.parse('Test mañana', Date.UTC(2026, 11, 31, 22)).instant, Date.UTC(2027, 0, 1, 9));
  });
});

test('invalid or conflicting time expressions never silently become defaulted reminders', () => zone('UTC', () => {
  const reference = Date.UTC(2026, 9, 14, 6);
  for (const text of [
    'Test mañana a las 3', 'Test at 8PM', 'Test at three', 'Test 8 de la mañana',
    'Test eight AM', 'Test 25:00', 'Test tomorrow at noon', 'Tomorrow Test at three',
    'Test in zero minutes', 'Test en pocos minutos', 'Test in three days', 'Test in 10', 'Test en 2 mins',
    'Test por la mañana', 'Test esta mañana', 'Test de la mañana a las 8 AM',
    'Test mañana a las 8 de la mañana sobre',
    'Test tomorrow today', 'Tomorrow Test Friday', 'Test mañana sobre el viernes',
    'Test tomorrow at 8 AM about tomorrow at 9 AM',
    'Test tomorrow at 8 AM about a check in five minutes',
    'Test tomorrow at 8 AM about tomorrow',
    'Test tomorrow tomorrow at 8 AM about the test',
    'Test tomorrow at 8 AM UTC about the test',
    'Test pasado mañana', 'Test pasado manana', 'Test the day after tomorrow',
    'Test pasado mañana a las 8 AM', 'Test the day after tomorrow at 8 AM',
    'Mañana por la tarde revisar prueba', 'Tomorrow afternoon review the test',
    'Test mañana por la noche', 'Test tomorrow evening', 'Test in the morning',
    'Test yesterday', 'Test ayer', 'Test anteayer',
    'mañana', 'tomorrow', 'Recuérdame'
  ]) assert.throws(() => parser.parse(text, reference), undefined, text);
}));
