// Кибла: направление на Каабу и живой компас по датчику ориентации телефона
const KAABA = { lat: 21.422487, lon: 39.826206 };
const ALIGN_TOLERANCE = 5; // градусов

const qs = {
  bearing: null,
  heading: null, // куда смотрит верх телефона, градусы от севера
  live: false,
  aligned: false,
  lastEventAt: 0,
  watchdog: null
};

const $ = id => document.getElementById(id);
const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;
const norm = a => ((a % 360) + 360) % 360;
const diff = (a, b) => ((a - b + 540) % 360) - 180; // от -180 до 180

export function qiblaBearing(lat, lon) {
  const y = Math.sin(rad(KAABA.lon - lon));
  const x = Math.cos(rad(lat)) * Math.tan(rad(KAABA.lat)) - Math.sin(rad(lat)) * Math.cos(rad(KAABA.lon - lon));
  return norm(deg(Math.atan2(y, x)));
}

export function distanceToKaaba(lat, lon) {
  const h = Math.sin(rad(KAABA.lat - lat) / 2) ** 2 +
    Math.cos(rad(lat)) * Math.cos(rad(KAABA.lat)) * Math.sin(rad(KAABA.lon - lon) / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function directionName(b) {
  const names = ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад'];
  return names[Math.round(norm(b) / 45) % 8];
}

const hasOrientation = () => typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
const isTouch = () => typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

export function initQibla() {
  window.enableQiblaCompass = enableCompass;
  // Кнопка компаса только на устройствах с датчиком (телефоны, планшеты)
  if (hasOrientation() && isTouch()) {
    const btn = $('qiblaEnableBtn');
    if (btn) btn.hidden = false;
    setHint('Нажмите «Включить компас» и держите телефон горизонтально, экраном вверх.');
  }
}

export function updateQiblaForLocation(loc) {
  if (!loc) return;
  qs.bearing = qiblaBearing(loc.lat, loc.lon);
  $('qiblaLocationName').textContent = loc.name;
  $('qiblaAngleVal').textContent = `${Math.round(qs.bearing)}°`;
  $('qiblaAngleText').textContent = `${directionName(qs.bearing)}, от севера по часовой`;
  $('qiblaDistVal').textContent = `${distanceToKaaba(loc.lat, loc.lon).toLocaleString('ru-RU')} км`;
  render();
}

function setHint(text) {
  const el = $('qiblaHint');
  if (el) el.textContent = text;
}

function render() {
  const needle = $('qiblaNeedle');
  const dial = $('qiblaDial');
  if (!needle || !dial || qs.bearing === null) return;
  needle.setAttribute('transform', `rotate(${qs.bearing.toFixed(1)} 150 150)`);
  // В режиме компаса циферблат поворачивается так, чтобы «С» смотрела на настоящий север
  const dialAngle = qs.live && qs.heading !== null ? -qs.heading : 0;
  dial.setAttribute('transform', `rotate(${dialAngle.toFixed(1)} 150 150)`);
  // Буквы сторон света и значок Каабы всегда стоят прямо
  dial.querySelectorAll('.qibla-cardinal').forEach(t => {
    t.setAttribute('transform', `rotate(${(-dialAngle).toFixed(1)} ${t.getAttribute('x')} ${t.getAttribute('y')})`);
  });
  $('qiblaKaaba')?.setAttribute('transform', `rotate(${(-(qs.bearing + dialAngle)).toFixed(1)})`);

  const box = $('qiblaCompass');
  box.dataset.mode = qs.live ? 'live' : 'static';
  if (!qs.live || qs.heading === null) {
    box.classList.remove('aligned');
    return;
  }
  const off = diff(qs.bearing, qs.heading);
  const aligned = Math.abs(off) <= ALIGN_TOLERANCE;
  box.classList.toggle('aligned', aligned);
  if (aligned && !qs.aligned && navigator.vibrate) navigator.vibrate(60);
  qs.aligned = aligned;
  setHint(aligned
    ? 'Вы смотрите на Киблу'
    : `Повернитесь ${off > 0 ? 'вправо' : 'влево'} на ${Math.round(Math.abs(off))}°, пока Кааба не окажется вверху.`);
}

function screenAngle() {
  const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
  return Number(a) || 0;
}

function onOrientation(e) {
  let heading = null;
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    heading = e.webkitCompassHeading; // iPhone: уже от севера по часовой
  } else if (e.absolute && typeof e.alpha === 'number') {
    heading = 360 - e.alpha; // Android: alpha против часовой от севера
  } else {
    return; // относительная ориентация без севера не подходит для компаса
  }
  heading = norm(heading + screenAngle());
  // Сглаживание без скачка через 0°/360°
  qs.heading = qs.heading === null ? heading : norm(qs.heading + diff(heading, qs.heading) * 0.25);
  qs.lastEventAt = Date.now();
  render();
}

async function enableCompass() {
  const btn = $('qiblaEnableBtn');
  try {
    // iPhone (iOS 13+) требует разрешения по нажатию кнопки
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') {
        setHint('Нет доступа к компасу. Разрешите «Движение и ориентация» в настройках Safari или используйте угол ниже.');
        return;
      }
    }
  } catch {
    setHint('Не удалось включить компас. Используйте угол ниже.');
    return;
  }
  const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.removeEventListener(eventName, onOrientation);
  window.addEventListener(eventName, onOrientation);
  qs.live = true;
  qs.heading = null;
  if (btn) btn.hidden = true;
  setHint('Держите телефон горизонтально, экраном вверх.');
  render();

  clearTimeout(qs.watchdog);
  qs.watchdog = setTimeout(() => {
    if (!qs.lastEventAt) {
      qs.live = false;
      window.removeEventListener(eventName, onOrientation);
      if (btn) btn.hidden = false;
      setHint('Датчик компаса не отвечает. Встаньте лицом на север и повернитесь по часовой стрелке на указанный угол.');
      render();
    }
  }, 3000);
}
