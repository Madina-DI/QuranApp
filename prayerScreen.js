// Экран «Время намаза»: место (геолокация или поиск города), расписание, следующий намаз
import {
  PRAYER_METHODS, PRAYER_NAMES, WORLD_CITIES,
  getPrayerTimes, formatTime, localDateParts, defaultMethodFor
} from './prayerTimes.js';

const LOCATION_KEY = 'al_bayan_location';
const SETTINGS_KEY = 'al_bayan_prayer_settings';
const DEVICE_TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'; } catch { return 'Europe/Moscow'; }
})();

const ps = {
  location: null, // { name, lat, lon, tz, source: 'gps' | 'city' | 'guess' }
  method: null,
  asr: null,
  askedGps: false,
  timer: null,
  searchSeq: 0,
  onChange: () => {}
};

const $ = id => document.getElementById(id);

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* хранилище недоступно */ }
}

function distanceKm(a, b) {
  const r = d => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Без разрешения на геолокацию угадываем город по часовому поясу устройства
function guessLocation() {
  const city = WORLD_CITIES.find(c => c.tz === DEVICE_TZ) || WORLD_CITIES[0];
  return { name: city.name, lat: city.lat, lon: city.lon, tz: city.tz, source: 'guess' };
}

export function initPrayerTimes(onChange) {
  ps.onChange = onChange || (() => {});
  const saved = readJSON(LOCATION_KEY);
  ps.location = saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon) && saved.tz ? saved : guessLocation();
  const settings = readJSON(SETTINGS_KEY);
  const defaults = defaultMethodFor(ps.location.tz);
  ps.method = settings?.method && PRAYER_METHODS[settings.method] ? settings.method : defaults.method;
  ps.asr = settings?.asr === 'standard' || settings?.asr === 'hanafi' ? settings.asr : defaults.asr;

  const methodSelect = $('prayerMethodSelect');
  if (methodSelect) {
    methodSelect.innerHTML = Object.entries(PRAYER_METHODS)
      .map(([key, m]) => `<option value="${key}">${m.name}</option>`).join('');
  }
  const input = $('prayerCityInput');
  if (input) {
    let debounce;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => searchCities(input.value), 300);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') togglePrayerSearch(false);
      if (e.key === 'Enter') $('prayerCityResults')?.querySelector('button')?.click();
    });
  }

  window.detectPrayerLocation = () => detectLocation(true);
  window.togglePrayerSearch = togglePrayerSearch;
  window.setPrayerMethod = value => { ps.method = value; saveSettings(); renderPrayerTimes(); };
  window.setPrayerAsr = value => { ps.asr = value; saveSettings(); renderPrayerTimes(); };

  renderPrayerTimes();
  ps.onChange(ps.location);
}

// Вызывается при открытии вкладки «Намаз»: в первый раз просим геолокацию
export function onPrayerScreenShown() {
  renderPrayerTimes();
  clearInterval(ps.timer);
  ps.timer = setInterval(() => {
    if (document.getElementById('screen-namaz')?.classList.contains('active')) renderPrayerTimes();
    else clearInterval(ps.timer);
  }, 30000);
  if (ps.location.source === 'guess' && !ps.askedGps) detectLocation(false);
}

function saveSettings() {
  writeJSON(SETTINGS_KEY, { method: ps.method, asr: ps.asr });
}

function setStatus(text) {
  const el = $('prayerStatus');
  if (el) el.textContent = text || '';
}

function setLocation(loc, { resetMethod = true } = {}) {
  ps.location = loc;
  writeJSON(LOCATION_KEY, loc);
  // Метод по умолчанию следует за страной, пока пользователь не выбрал свой
  if (resetMethod && !readJSON(SETTINGS_KEY)) {
    const d = defaultMethodFor(loc.tz);
    ps.method = d.method;
    ps.asr = d.asr;
  }
  togglePrayerSearch(false);
  setStatus('');
  renderPrayerTimes();
  ps.onChange(loc);
}

function detectLocation(userAsked) {
  ps.askedGps = true;
  if (!navigator.geolocation) {
    if (userAsked) setStatus('Браузер не поддерживает геолокацию. Найдите город через поиск.');
    return;
  }
  setStatus('Определяем местоположение…');
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const near = WORLD_CITIES
        .map(c => ({ c, d: distanceKm({ lat, lon }, c) }))
        .sort((a, b) => a.d - b.d)[0];
      let name = near && near.d < 40 ? near.c.name : 'Моё местоположение';
      setLocation({ name, lat, lon, tz: DEVICE_TZ, source: 'gps' });
      if (!(near && near.d < 40)) {
        const placeName = await reverseGeocode(lat, lon);
        if (placeName && ps.location.source === 'gps' && ps.location.lat === lat) {
          ps.location = { ...ps.location, name: placeName };
          writeJSON(LOCATION_KEY, ps.location);
          renderPrayerTimes();
          ps.onChange(ps.location);
        }
      }
    },
    () => {
      setStatus(userAsked
        ? 'Нет доступа к геолокации. Разрешите её в настройках браузера или найдите город через поиск.'
        : `Показано время для города ${ps.location.name}. Чтобы определить место точно, нажмите на значок геолокации или выберите город.`);
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 }
  );
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ru`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.city || data.locality || data.principalSubdivision || null;
  } catch {
    return null;
  }
}

function togglePrayerSearch(open) {
  const box = $('prayerSearchBox');
  const btn = $('prayerLocationBtn');
  if (!box) return;
  box.hidden = !open;
  btn?.setAttribute('aria-expanded', String(!!open));
  if (open) {
    const input = $('prayerCityInput');
    input.value = '';
    renderCityResults(WORLD_CITIES.slice(0, 8));
    input.focus();
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

let currentResults = [];
function renderCityResults(list, note) {
  currentResults = list;
  const box = $('prayerCityResults');
  if (!box) return;
  box.innerHTML = list.map((c, i) =>
    `<button class="prayer-city-option" role="option" data-i="${i}">
       <span class="prayer-city-name">${escapeHtml(c.name)}</span>
       <span class="prayer-city-country">${escapeHtml([c.region, c.country].filter(Boolean).join(', '))}</span>
     </button>`
  ).join('') + (note ? `<p class="prayer-city-note">${escapeHtml(note)}</p>` : '');
  box.querySelectorAll('.prayer-city-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = currentResults[Number(btn.dataset.i)];
      setLocation({ name: c.name, lat: c.lat, lon: c.lon, tz: c.tz, source: 'city' });
    });
  });
}

async function searchCities(query) {
  const q = query.trim().toLowerCase();
  if (!q) { renderCityResults(WORLD_CITIES.slice(0, 8)); return; }
  const local = WORLD_CITIES.filter(c => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
  renderCityResults(local.slice(0, 8), q.length >= 2 ? 'Ищем по всему миру…' : '');
  if (q.length < 2) return;

  const seq = ++ps.searchSeq;
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=10&language=ru&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (seq !== ps.searchSeq) return; // пришёл ответ на старый запрос
    const remote = (data.results || [])
      .filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude) && r.timezone)
      .map(r => ({ name: r.name, region: r.admin1 && r.admin1 !== r.name ? r.admin1 : '', country: r.country || '', lat: r.latitude, lon: r.longitude, tz: r.timezone }));
    const merged = [...local];
    remote.forEach(r => {
      if (!merged.some(m => distanceKm(m, r) < 15)) merged.push(r);
    });
    renderCityResults(merged.slice(0, 10), merged.length ? '' : 'Город не найден. Попробуйте написать по-другому.');
  } catch {
    if (seq !== ps.searchSeq) return;
    renderCityResults(local.slice(0, 8), local.length
      ? 'Нет интернета: показаны только крупные города.'
      : 'Нет интернета. Без сети доступны только крупные города, или нажмите на значок геолокации.');
  }
}

function formatCountdown(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `через ${m} мин`;
  return `через ${h} ч ${m} мин`;
}

export function renderPrayerTimes() {
  const loc = ps.location;
  if (!loc || !$('prayerList')) return;
  const tz = loc.tz;
  const now = new Date();
  const today = localDateParts(now, tz);
  const times = getPrayerTimes(today, loc, ps.method, ps.asr);

  $('prayerLocationName').textContent = loc.name;
  const methodSelect = $('prayerMethodSelect');
  if (methodSelect) methodSelect.value = ps.method;
  const asrSelect = $('prayerAsrSelect');
  if (asrSelect) asrSelect.value = ps.asr;

  let dateText = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  try {
    const hijri = new Intl.DateTimeFormat('ru-RU-u-ca-islamic-umalqura', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }).format(now);
    dateText += ` · ${hijri.replace(/\s*AH$/, ' х.')}`;
  } catch { /* календарь хиджры не поддерживается */ }
  if (tz !== DEVICE_TZ) dateText += ` · местное время ${formatTime(now, tz)}`;
  $('prayerDate').textContent = dateText;

  // Следующий намаз (восход — не намаз, но показываем его в списке)
  const order = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
  let nextKey = order.find(k => times[k] && times[k] > now);
  let nextTime = nextKey ? times[nextKey] : null;
  if (!nextKey) {
    const tomorrowParts = localDateParts(new Date(now.getTime() + 24 * 3600000), tz);
    nextKey = 'fajr';
    nextTime = getPrayerTimes(tomorrowParts, loc, ps.method, ps.asr).fajr;
  }
  const names = Object.fromEntries(PRAYER_NAMES);
  let currentKey = [...order].reverse().find(k => times[k] && times[k] <= now);
  // После восхода время фаджра закончилось, до зухра нет текущего намаза
  if (currentKey === 'fajr' && times.sunrise && now >= times.sunrise) currentKey = null;

  $('prayerNext').innerHTML = nextTime
    ? `<span class="prayer-next-label">Следующий намаз</span>
       <span class="prayer-next-name">${names[nextKey]} <span class="prayer-next-time">${formatTime(nextTime, tz)}</span></span>
       <span class="prayer-next-left">${formatCountdown(nextTime - now)}</span>`
    : '';

  $('prayerList').innerHTML = PRAYER_NAMES.map(([key, name]) => {
    const cls = [
      'prayer-row',
      key === 'sunrise' ? 'is-sunrise' : '',
      key === currentKey ? 'is-current' : '',
      key === nextKey && times[key] > now ? 'is-next' : ''
    ].filter(Boolean).join(' ');
    return `<li class="${cls}"><span class="prayer-row-name">${name}</span><span class="prayer-row-time">${formatTime(times[key], tz)}</span></li>`;
  }).join('');

  const polar = PRAYER_NAMES.some(([k]) => !times[k]);
  if (polar) setStatus('В этом месте сегодня солнце не заходит или не восходит, поэтому часть времени не рассчитывается.');
}
