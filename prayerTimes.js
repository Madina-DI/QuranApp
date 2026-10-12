// Расчёт времени намаза на устройстве (астрономический алгоритм PrayTimes),
// без интернета. Время выводится в часовом поясе выбранного места.

export const PRAYER_METHODS = {
  russia: { name: 'ДУМ России (16° / 15°)', fajr: 16, isha: 15 },
  mwl: { name: 'Всемирная исламская лига (18° / 17°)', fajr: 18, isha: 17 },
  turkey: { name: 'Диянет, Турция (18° / 17°)', fajr: 18, isha: 17 },
  makkah: { name: 'Умм аль-Кура, Мекка', fajr: 18.5, ishaMinutes: 90 },
  egypt: { name: 'Египет (19,5° / 17,5°)', fajr: 19.5, isha: 17.5 },
  karachi: { name: 'Карачи (18° / 18°)', fajr: 18, isha: 18 },
  isna: { name: 'ISNA, Северная Америка (15° / 15°)', fajr: 15, isha: 15 },
  gulf: { name: 'Страны Залива (19,5°, иша +90 мин)', fajr: 19.5, ishaMinutes: 90 },
  singapore: { name: 'Сингапур, Малайзия, Индонезия (20° / 18°)', fajr: 20, isha: 18 }
};

export const PRAYER_NAMES = [
  ['fajr', 'Фаджр'],
  ['sunrise', 'Восход'],
  ['dhuhr', 'Зухр'],
  ['asr', 'Аср'],
  ['maghrib', 'Магриб'],
  ['isha', 'Иша']
];

const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
const fixHour = h => fix(h, 24);

function julian(year, month, day) {
  if (month <= 2) { year -= 1; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

function sunPosition(jd) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = fixHour(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15);
  return {
    declination: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))),
    equation: q / 15 - RA
  };
}

// Возвращает время в часах UTC (может быть < 0 или > 24) для календарной даты места
function computeUtcHours({ year, month, day }, lat, lon, method, asrFactor) {
  const jDate = julian(year, month, day) - lon / (15 * 24);
  const midDay = t => fixHour(12 - sunPosition(jDate + t).equation);
  const sunAngleTime = (angle, t, ccw) => {
    const decl = sunPosition(jDate + t).declination;
    const noon = midDay(t);
    const cosT = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) /
      (Math.cos(rad(decl)) * Math.cos(rad(lat)));
    if (cosT < -1 || cosT > 1) return NaN; // солнце не опускается/не поднимается до этого угла
    const T = deg(Math.acos(cosT)) / 15;
    return noon + (ccw ? -T : T);
  };
  const asrTime = (factor, t) => {
    const decl = sunPosition(jDate + t).declination;
    const angle = -deg(Math.atan(1 / (factor + Math.tan(rad(Math.abs(lat - decl))))));
    return sunAngleTime(angle, t);
  };

  // Два уточняющих прохода от грубого приближения
  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 };
  for (let i = 0; i < 2; i++) {
    const p = {};
    for (const k in t) p[k] = (Number.isFinite(t[k]) ? t[k] : { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, maghrib: 18, isha: 18 }[k]) / 24;
    t = {
      fajr: sunAngleTime(method.fajr, p.fajr, true),
      sunrise: sunAngleTime(0.833, p.sunrise, true),
      dhuhr: midDay(p.dhuhr),
      asr: asrTime(asrFactor, p.asr),
      maghrib: sunAngleTime(0.833, p.maghrib),
      isha: method.isha ? sunAngleTime(method.isha, p.isha) : NaN
    };
  }
  if (method.ishaMinutes) t.isha = t.maghrib + method.ishaMinutes / 60;

  // Высокие широты (летом в Москве, Казани и севернее): метод «доли ночи по углу»
  if (Number.isFinite(t.sunrise) && Number.isFinite(t.maghrib)) {
    const night = fixHour(t.sunrise - t.maghrib);
    const fajrPortion = (method.fajr / 60) * night;
    if (!Number.isFinite(t.fajr) || fixHour(t.sunrise - t.fajr) > fajrPortion) t.fajr = t.sunrise - fajrPortion;
    if (!method.ishaMinutes) {
      const ishaPortion = (method.isha / 60) * night;
      if (!Number.isFinite(t.isha) || fixHour(t.isha - t.maghrib) > ishaPortion) t.isha = t.maghrib + ishaPortion;
    }
  }

  // Переход от местного солнечного времени к UTC
  const shift = -lon / 15;
  for (const k in t) t[k] += shift;
  t.dhuhr += 1 / 60; // зухр — через минуту после зенита
  return t;
}

// Календарная дата (год, месяц, день) в часовом поясе места
export function localDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date);
  const get = type => parseInt(parts.find(p => p.type === type).value, 10);
  return { year: get('year'), month: get('month'), day: get('day') };
}

// Времена намазов (объекты Date) на календарный день места
export function getPrayerTimes(dateParts, { lat, lon }, methodKey = 'mwl', asr = 'hanafi') {
  const method = PRAYER_METHODS[methodKey] || PRAYER_METHODS.mwl;
  const hours = computeUtcHours(dateParts, lat, lon, method, asr === 'hanafi' ? 2 : 1);
  const base = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day);
  const out = {};
  for (const [key] of PRAYER_NAMES) {
    const h = hours[key];
    out[key] = Number.isFinite(h) ? new Date(Math.round((base + h * 3600000) / 60000) * 60000) : null;
  }
  return out;
}

export function formatTime(date, timeZone) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

// Метод и мазхаб по умолчанию — по часовому поясу места
export function defaultMethodFor(timeZone = '') {
  const tz = timeZone;
  const russia = ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Europe/Volgograd', 'Europe/Kirov', 'Europe/Ulyanovsk', 'Europe/Saratov', 'Europe/Astrakhan', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk', 'Asia/Barnaul', 'Asia/Tomsk', 'Asia/Novokuznetsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Chita', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Sakhalin', 'Asia/Kamchatka', 'Europe/Minsk'];
  const centralAsia = ['Asia/Almaty', 'Asia/Qostanay', 'Asia/Aqtobe', 'Asia/Aqtau', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qyzylorda', 'Asia/Tashkent', 'Asia/Samarkand', 'Asia/Bishkek', 'Asia/Dushanbe', 'Asia/Ashgabat', 'Asia/Baku'];
  if (russia.includes(tz)) return { method: 'russia', asr: 'hanafi' };
  if (centralAsia.includes(tz)) return { method: 'mwl', asr: 'hanafi' };
  if (tz === 'Europe/Istanbul') return { method: 'turkey', asr: 'standard' };
  if (tz === 'Asia/Riyadh') return { method: 'makkah', asr: 'standard' };
  if (['Asia/Dubai', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Muscat'].includes(tz)) return { method: 'gulf', asr: 'standard' };
  if (['Africa/Cairo', 'Africa/Khartoum', 'Asia/Damascus', 'Asia/Beirut', 'Asia/Amman', 'Asia/Baghdad'].includes(tz)) return { method: 'egypt', asr: 'standard' };
  if (['Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Kabul'].includes(tz)) return { method: 'karachi', asr: 'hanafi' };
  if (['Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Jakarta', 'Asia/Makassar', 'Asia/Brunei'].includes(tz)) return { method: 'singapore', asr: 'standard' };
  if (tz.startsWith('America/')) return { method: 'isna', asr: 'standard' };
  return { method: 'mwl', asr: 'standard' };
}

// Крупные города мира — поиск работает и без интернета
export const WORLD_CITIES = [
  ['Москва', 'Россия', 55.7558, 37.6173, 'Europe/Moscow'],
  ['Санкт-Петербург', 'Россия', 59.9343, 30.3351, 'Europe/Moscow'],
  ['Казань', 'Россия', 55.7963, 49.1088, 'Europe/Moscow'],
  ['Уфа', 'Россия', 54.7388, 55.9721, 'Asia/Yekaterinburg'],
  ['Грозный', 'Россия', 43.3178, 45.6949, 'Europe/Moscow'],
  ['Махачкала', 'Россия', 42.9849, 47.5047, 'Europe/Moscow'],
  ['Нальчик', 'Россия', 43.4853, 43.6071, 'Europe/Moscow'],
  ['Екатеринбург', 'Россия', 56.8389, 60.6057, 'Asia/Yekaterinburg'],
  ['Новосибирск', 'Россия', 55.0084, 82.9357, 'Asia/Novosibirsk'],
  ['Самара', 'Россия', 53.1959, 50.1002, 'Europe/Samara'],
  ['Нижний Новгород', 'Россия', 56.2965, 43.9361, 'Europe/Moscow'],
  ['Ростов-на-Дону', 'Россия', 47.2357, 39.7015, 'Europe/Moscow'],
  ['Астана', 'Казахстан', 51.1694, 71.4491, 'Asia/Almaty'],
  ['Алматы', 'Казахстан', 43.2220, 76.8512, 'Asia/Almaty'],
  ['Шымкент', 'Казахстан', 42.3417, 69.5901, 'Asia/Almaty'],
  ['Ташкент', 'Узбекистан', 41.2995, 69.2401, 'Asia/Tashkent'],
  ['Самарканд', 'Узбекистан', 39.6542, 66.9597, 'Asia/Samarkand'],
  ['Бишкек', 'Кыргызстан', 42.8746, 74.5698, 'Asia/Bishkek'],
  ['Ош', 'Кыргызстан', 40.5283, 72.7985, 'Asia/Bishkek'],
  ['Душанбе', 'Таджикистан', 38.5598, 68.7870, 'Asia/Dushanbe'],
  ['Ашхабад', 'Туркменистан', 37.9601, 58.3261, 'Asia/Ashgabat'],
  ['Баку', 'Азербайджан', 40.4093, 49.8671, 'Asia/Baku'],
  ['Минск', 'Беларусь', 53.9045, 27.5615, 'Europe/Minsk'],
  ['Киев', 'Украина', 50.4501, 30.5234, 'Europe/Kyiv'],
  ['Стамбул', 'Турция', 41.0082, 28.9784, 'Europe/Istanbul'],
  ['Анкара', 'Турция', 39.9334, 32.8597, 'Europe/Istanbul'],
  ['Мекка', 'Саудовская Аравия', 21.4225, 39.8262, 'Asia/Riyadh'],
  ['Медина', 'Саудовская Аравия', 24.4672, 39.6111, 'Asia/Riyadh'],
  ['Эр-Рияд', 'Саудовская Аравия', 24.7136, 46.6753, 'Asia/Riyadh'],
  ['Дубай', 'ОАЭ', 25.2048, 55.2708, 'Asia/Dubai'],
  ['Абу-Даби', 'ОАЭ', 24.4539, 54.3773, 'Asia/Dubai'],
  ['Доха', 'Катар', 25.2854, 51.5310, 'Asia/Qatar'],
  ['Каир', 'Египет', 30.0444, 31.2357, 'Africa/Cairo'],
  ['Иерусалим', 'Палестина', 31.7683, 35.2137, 'Asia/Jerusalem'],
  ['Амман', 'Иордания', 31.9454, 35.9284, 'Asia/Amman'],
  ['Тегеран', 'Иран', 35.6892, 51.3890, 'Asia/Tehran'],
  ['Карачи', 'Пакистан', 24.8607, 67.0011, 'Asia/Karachi'],
  ['Дели', 'Индия', 28.6139, 77.2090, 'Asia/Kolkata'],
  ['Дакка', 'Бангладеш', 23.8103, 90.4125, 'Asia/Dhaka'],
  ['Куала-Лумпур', 'Малайзия', 3.1390, 101.6869, 'Asia/Kuala_Lumpur'],
  ['Джакарта', 'Индонезия', -6.2088, 106.8456, 'Asia/Jakarta'],
  ['Лондон', 'Великобритания', 51.5074, -0.1278, 'Europe/London'],
  ['Берлин', 'Германия', 52.5200, 13.4050, 'Europe/Berlin'],
  ['Париж', 'Франция', 48.8566, 2.3522, 'Europe/Paris'],
  ['Вена', 'Австрия', 48.2082, 16.3738, 'Europe/Vienna'],
  ['Прага', 'Чехия', 50.0755, 14.4378, 'Europe/Prague'],
  ['Варшава', 'Польша', 52.2297, 21.0122, 'Europe/Warsaw'],
  ['Рим', 'Италия', 41.9028, 12.4964, 'Europe/Rome'],
  ['Мадрид', 'Испания', 40.4168, -3.7038, 'Europe/Madrid'],
  ['Амстердам', 'Нидерланды', 52.3676, 4.9041, 'Europe/Amsterdam'],
  ['Стокгольм', 'Швеция', 59.3293, 18.0686, 'Europe/Stockholm'],
  ['Нью-Йорк', 'США', 40.7128, -74.0060, 'America/New_York'],
  ['Лос-Анджелес', 'США', 34.0522, -118.2437, 'America/Los_Angeles'],
  ['Чикаго', 'США', 41.8781, -87.6298, 'America/Chicago'],
  ['Торонто', 'Канада', 43.6532, -79.3832, 'America/Toronto'],
  ['Сидней', 'Австралия', -33.8688, 151.2093, 'Australia/Sydney'],
  ['Токио', 'Япония', 35.6762, 139.6503, 'Asia/Tokyo'],
  ['Пекин', 'Китай', 39.9042, 116.4074, 'Asia/Shanghai'],
  ['Сеул', 'Южная Корея', 37.5665, 126.9780, 'Asia/Seoul'],
  ['Касабланка', 'Марокко', 33.5731, -7.5898, 'Africa/Casablanca'],
  ['Лагос', 'Нигерия', 6.5244, 3.3792, 'Africa/Lagos'],
  ['Найроби', 'Кения', -1.2921, 36.8219, 'Africa/Nairobi']
].map(([name, country, lat, lon, tz]) => ({ name, country, lat, lon, tz }));
