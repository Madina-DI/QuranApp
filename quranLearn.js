import { surahGuide } from './surahGuide.js';

// ==========================================
// «Слушать и заучивать»: весь Коран по аятам, повтор для хифза,
// режим скрытия слов и проверка написания по памяти
// ==========================================
const AYAH_AUDIO = (globalNum) => `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${globalNum}.mp3`;
const BISMILLAH_GLOBAL = 1;
const STORAGE_KEY = 'al_bayan_hifz';

// Номер первого аята каждой суры в сквозной нумерации (1–6236) для аудио
const surahOffsets = [];
surahGuide.reduce((acc, s) => {
  surahOffsets[s.n] = acc;
  return acc + s.ayahs;
}, 0);

const learnState = {
  surah: 1,
  verses: [],
  from: 1,
  to: 7,
  mode: 'read', // 'read' | 'hide' | 'write'
  hideLevel: 1, // 1 — первые буквы, 2 — всё скрыто
  showTranslit: true,
  showTranslation: true,
  current: 1,
  repeatTimes: 1,
  repeatDone: 0,
  loopRange: false,
  speed: 1,
  playing: false,
  playingBismillah: false,
  revealed: new Set(),
  learned: loadLearned()
};

const cache = new Map();
const el = {};

export function initQuranLearn() {
  el.surahSelect = document.getElementById('learnSurahSelect');
  el.from = document.getElementById('learnFrom');
  el.to = document.getElementById('learnTo');
  el.list = document.getElementById('learnAyahList');
  el.writeBox = document.getElementById('learnWriteBox');
  el.progress = document.getElementById('learnProgress');
  el.audio = document.getElementById('learnAudio');
  el.playIcon = document.getElementById('learnPlayIcon');
  el.nowPlaying = document.getElementById('learnNowPlaying');
  el.repeat = document.getElementById('learnRepeat');
  el.btnLoop = document.getElementById('learnBtnLoop');
  el.btnSpeed = document.getElementById('learnBtnSpeed');
  el.hideLevelWrap = document.getElementById('learnHideLevelWrap');
  if (!el.surahSelect) return;

  el.surahSelect.innerHTML = surahGuide
    .map((s) => `<option value="${s.n}">${s.n}. ${s.ru} (${s.ar}) — ${s.ayahs} аятов</option>`)
    .join('');
  el.surahSelect.addEventListener('change', (e) => loadSurah(Number(e.target.value)));
  el.from.addEventListener('change', onRangeChange);
  el.to.addEventListener('change', onRangeChange);
  el.repeat.addEventListener('change', (e) => {
    learnState.repeatTimes = Number(e.target.value);
    learnState.repeatDone = 0;
  });

  initLearnAudio();
  pauseOtherPlayersOnPlay();

  window.setLearnMode = setLearnMode;
  window.setHideLevel = setHideLevel;
  window.toggleLearnTranslit = toggleLearnTranslit;
  window.toggleLearnTranslation = toggleLearnTranslation;
  window.toggleLearnPlay = toggleLearnPlay;
  window.learnPrev = () => goToAyah(learnState.current - 1, learnState.playing);
  window.learnNext = () => goToAyah(learnState.current + 1, learnState.playing);
  window.playLearnAyah = (n) => goToAyah(n, true);
  window.toggleAyahLearned = toggleAyahLearned;
  window.toggleLearnLoop = toggleLearnLoop;
  window.cycleLearnSpeed = cycleLearnSpeed;
  window.revealLearnWord = revealLearnWord;
  window.checkLearnWriting = checkLearnWriting;
  window.showLearnAnswer = showLearnAnswer;
  window.openSurahForLearning = openSurahForLearning;

  loadSurah(1);
}

// ---------- Data ----------
async function fetchSurah(n) {
  if (cache.has(n)) return cache.get(n);
  const res = await fetch(`data/quran/${n}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(n, data.v);
  return data.v;
}

async function loadSurah(n, from = 1, to = null) {
  stopPlayback();
  learnState.surah = n;
  el.surahSelect.value = String(n);
  el.list.innerHTML = '<p class="learn-loading">Загрузка суры…</p>';
  try {
    learnState.verses = await fetchSurah(n);
  } catch (e) {
    el.list.innerHTML = '<p class="learn-loading">Не удалось загрузить суру. Проверьте подключение к интернету.</p>';
    return;
  }
  const total = learnState.verses.length;
  learnState.from = Math.min(Math.max(1, from), total);
  learnState.to = Math.min(to || total, total);
  learnState.current = learnState.from;
  learnState.revealed.clear();
  el.from.max = total;
  el.to.max = total;
  el.from.value = learnState.from;
  el.to.value = learnState.to;
  renderLearn();
}

// Открыть суру из раздела «Коран отвечает»
function openSurahForLearning(n) {
  document.getElementById('quranLearn')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  loadSurah(n);
}

function onRangeChange() {
  const total = learnState.verses.length;
  let from = Math.min(Math.max(1, Number(el.from.value) || 1), total);
  let to = Math.min(Math.max(1, Number(el.to.value) || total), total);
  if (from > to) [from, to] = [to, from];
  learnState.from = from;
  learnState.to = to;
  el.from.value = from;
  el.to.value = to;
  if (learnState.current < from || learnState.current > to) learnState.current = from;
  learnState.revealed.clear();
  renderLearn();
}

// ---------- Rendering ----------
function renderLearn() {
  updateProgress();
  el.hideLevelWrap.hidden = learnState.mode !== 'hide';
  if (learnState.mode === 'write') {
    el.list.hidden = true;
    el.writeBox.hidden = false;
    renderWriteBox();
    return;
  }
  el.list.hidden = false;
  el.writeBox.hidden = true;

  const showBismillah = learnState.from === 1 && learnState.surah !== 1 && learnState.surah !== 9;
  const items = [];
  if (showBismillah) {
    items.push('<div class="learn-bismillah">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>');
  }
  for (let n = learnState.from; n <= learnState.to; n++) items.push(ayahHtml(n));
  el.list.innerHTML = items.join('');
  highlightCurrent(false);
}

function ayahHtml(n) {
  const [ar, tr, ru] = learnState.verses[n - 1];
  const learned = isLearned(n);
  const hide = learnState.mode === 'hide';
  const arHtml = hide ? hiddenWordsHtml(ar, n, 'ar') : ar;
  const trHtml = hide ? hiddenWordsHtml(tr, n, 'tr') : tr;
  return `
    <div class="learn-ayah ${learned ? 'learned' : ''}" id="learnAyah${n}" data-ayah="${n}">
      <div class="learn-ayah-side">
        <span class="learn-ayah-num">${learnState.surah}:${n}</span>
        <button class="learn-icon-btn" onclick="playLearnAyah(${n})" title="Слушать аят" aria-label="Слушать аят ${n}">▶</button>
        <button class="learn-icon-btn learn-mark ${learned ? 'on' : ''}" onclick="toggleAyahLearned(${n})" title="Отметить как выученный" aria-label="${learned ? 'Аят выучен, снять отметку' : 'Отметить аят как выученный'}" aria-pressed="${learned}">${learned ? '✓' : '☆'}</button>
      </div>
      <div class="learn-ayah-body">
        <p class="learn-ar" dir="rtl" lang="ar">${arHtml}</p>
        ${learnState.showTranslit ? `<p class="learn-tr">${trHtml}</p>` : ''}
        ${learnState.showTranslation ? `<p class="learn-ru">${ru}</p>` : ''}
      </div>
    </div>`;
}

// Скрытие слов: уровень 1 оставляет первую букву, уровень 2 скрывает слово целиком
function hiddenWordsHtml(text, ayah, kind) {
  return text
    .split(' ')
    .map((word, i) => {
      const key = `${ayah}-${kind}-${i}`;
      if (learnState.revealed.has(key)) return `<span class="learn-word revealed">${word}</span>`;
      const hint = learnState.hideLevel === 1 ? firstLetter(word, kind) : '';
      return `<span class="learn-word hidden" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();revealLearnWord('${key}')}" onclick="revealLearnWord('${key}')" title="Нажмите, чтобы показать">${hint}<span class="learn-word-mask">${'•'.repeat(Math.min(6, Math.max(2, word.length - 1)))}</span></span>`;
    })
    .join(' ');
}

function firstLetter(word, kind) {
  if (kind === 'tr') return word.charAt(0);
  // Первая арабская буква вместе с огласовками
  const match = word.match(/^.[ً-ٰٟۖ-ۭ]*/u);
  return match ? match[0] : '';
}

function revealLearnWord(key) {
  learnState.revealed.add(key);
  const n = Number(key.split('-')[0]);
  const node = document.getElementById(`learnAyah${n}`);
  if (node) node.outerHTML = ayahHtml(n);
  highlightCurrent(false);
}

function highlightCurrent(scroll) {
  el.list.querySelectorAll('.learn-ayah').forEach((node) => {
    node.classList.toggle('current', Number(node.dataset.ayah) === learnState.current && learnState.playing);
  });
  const s = surahGuide[learnState.surah - 1];
  el.nowPlaying.textContent = learnState.playingBismillah
    ? `${s.ru} • Бисмиллях`
    : `${s.ru} • аят ${learnState.current} из ${learnState.verses.length}`;
  if (scroll && learnState.mode !== 'write') {
    document.getElementById(`learnAyah${learnState.current}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function setLearnMode(mode) {
  learnState.mode = mode;
  learnState.revealed.clear();
  ['read', 'hide', 'write'].forEach((m) => {
    document.getElementById(`learnMode_${m}`).classList.toggle('active', m === mode);
  });
  renderLearn();
}

function setHideLevel(level) {
  learnState.hideLevel = level;
  learnState.revealed.clear();
  [1, 2].forEach((l) => document.getElementById(`learnHide_${l}`).classList.toggle('active', l === level));
  renderLearn();
}

function toggleLearnTranslit() {
  learnState.showTranslit = !learnState.showTranslit;
  document.getElementById('learnBtnTranslit').classList.toggle('active', learnState.showTranslit);
  renderLearn();
}

function toggleLearnTranslation() {
  learnState.showTranslation = !learnState.showTranslation;
  document.getElementById('learnBtnTranslation').classList.toggle('active', learnState.showTranslation);
  renderLearn();
}

// ---------- Writing from memory ----------
function renderWriteBox() {
  const n = learnState.current;
  const [, , ru] = learnState.verses[n - 1];
  el.writeBox.innerHTML = `
    <div class="learn-write-head">
      <button class="btn-step-nav" onclick="learnPrev()" aria-label="Предыдущий аят">◄</button>
      <span class="learn-ayah-num">Аят ${learnState.surah}:${n}</span>
      <button class="btn-step-nav" onclick="learnNext()" aria-label="Следующий аят">►</button>
      <button class="learn-icon-btn" onclick="playLearnAyah(${n})" title="Прослушать" aria-label="Прослушать аят">▶</button>
    </div>
    <p class="learn-ru">${ru}</p>
    <label class="journal-label" for="learnWriteInput">Напишите аят по памяти транскрипцией или арабскими буквами:</label>
    <textarea id="learnWriteInput" class="styled-textarea learn-write-input" placeholder="Например: Bismi Allahi alrrahmani alrraheemi"></textarea>
    <div class="learn-write-actions">
      <button class="btn-primary" onclick="checkLearnWriting()">Проверить</button>
      <button class="btn-audio-setting" onclick="showLearnAnswer()">Показать аят</button>
    </div>
    <div class="learn-write-result" id="learnWriteResult"></div>`;
}

function showLearnAnswer() {
  const [ar, tr] = learnState.verses[learnState.current - 1];
  document.getElementById('learnWriteResult').innerHTML = `
    <p class="learn-ar" dir="rtl" lang="ar">${ar}</p>
    <p class="learn-tr">${tr}</p>`;
}

function checkLearnWriting() {
  const input = document.getElementById('learnWriteInput').value.trim();
  const result = document.getElementById('learnWriteResult');
  if (!input) {
    result.innerHTML = '<p class="learn-hint">Сначала напишите аят.</p>';
    return;
  }
  const [ar, tr] = learnState.verses[learnState.current - 1];
  const isArabic = /[؀-ۿ]/.test(input);
  const expectedRaw = (isArabic ? ar : tr).split(/\s+/).filter(Boolean);
  const norm = isArabic ? normalizeArabic : normalizeTranslit;
  const expected = expectedRaw.map(norm);
  const typed = input.split(/\s+/).map(norm).filter(Boolean);

  const matches = alignWords(expected, typed);
  const correct = matches.filter(Boolean).length;
  const pct = Math.round((correct / expected.length) * 100);

  const wordsHtml = expectedRaw
    .map((w, i) => `<span class="learn-check-word ${matches[i] ? 'ok' : 'miss'}">${w}</span>`)
    .join(' ');
  const verdict = pct >= 90 ? 'Отлично! Аят отмечен как выученный.' : pct >= 60 ? 'Хорошо, повторите ещё раз пропущенные слова.' : 'Послушайте аят ещё раз и попробуйте снова.';
  result.innerHTML = `
    <div class="learn-score ${pct >= 90 ? 'good' : ''}">Точность: ${pct}% (${correct} из ${expected.length} слов)</div>
    <p class="${isArabic ? 'learn-ar' : 'learn-tr'}" ${isArabic ? 'dir="rtl" lang="ar"' : ''}>${wordsHtml}</p>
    <p class="learn-hint">${verdict} Зелёным отмечены верные слова, красным пропущенные или ошибочные.</p>`;

  if (pct >= 90 && !isLearned(learnState.current)) toggleAyahLearned(learnState.current);
}

function normalizeArabic(word) {
  return word
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^ء-ي]/g, '');
}

// Мягкое сравнение транскрипции: долгие гласные, удвоения, знак айна
// и конечные огласовки (при остановке их не произносят) не важны
function normalizeTranslit(word) {
  const base = word
    .toLowerCase()
    .replace(/[ʿ'`’‘-]/g, '')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/(.)\1+/g, '$1')
    .replace(/[^a-z]/g, '');
  return base.length > 3 ? base.replace(/(un|an|in|u|a|i)$/, '') : base;
}

// Сопоставление слов (наибольшая общая подпоследовательность с нечётким сравнением).
// Слитно написанные слова («huwallahu») сравниваются с парой ожидаемых слов.
function alignWords(expected, typed) {
  const n = expected.length;
  const m = typed.length;
  const joined = (i) => (i + 1 < n ? expected[i] + expected[i + 1] : null);
  const dp = Array.from({ length: n + 2 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      let best = Math.max(dp[i + 1][j], dp[i][j + 1]);
      if (similar(expected[i], typed[j])) best = Math.max(best, dp[i + 1][j + 1] + 1);
      if (joined(i) && similar(joined(i), typed[j])) best = Math.max(best, dp[i + 2][j + 1] + 2);
      dp[i][j] = best;
    }
  }
  const matched = new Array(n).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (similar(expected[i], typed[j]) && dp[i][j] === dp[i + 1][j + 1] + 1) {
      matched[i] = true;
      i++;
      j++;
    } else if (joined(i) && similar(joined(i), typed[j]) && dp[i][j] === dp[i + 2][j + 1] + 2) {
      matched[i] = matched[i + 1] = true;
      i += 2;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return matched;
}

function similar(a, b) {
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  if (longest < 3) return false;
  return 1 - levenshtein(a, b) / longest >= 0.75;
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// ---------- Progress ----------
function loadLearned() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function isLearned(n) {
  return (learnState.learned[learnState.surah] || []).includes(n);
}

function toggleAyahLearned(n) {
  const list = new Set(learnState.learned[learnState.surah] || []);
  if (list.has(n)) list.delete(n);
  else list.add(n);
  learnState.learned[learnState.surah] = [...list].sort((a, b) => a - b);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(learnState.learned));
  } catch {
    // Хранилище недоступно: прогресс останется только на эту сессию
  }
  const node = document.getElementById(`learnAyah${n}`);
  if (node) node.outerHTML = ayahHtml(n);
  updateProgress();
  highlightCurrent(false);
}

function updateProgress() {
  const total = learnState.verses.length;
  const done = (learnState.learned[learnState.surah] || []).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  el.progress.innerHTML = `
    <span>Выучено ${done} из ${total} аятов (${pct}%)</span>
    <div class="dict-progress-bar"><div class="dict-fill" style="width: ${pct}%;"></div></div>`;
}

// ---------- Audio: ayah by ayah with repeats ----------
function initLearnAudio() {
  const audio = el.audio;
  audio.addEventListener('ended', onAyahEnded);
  audio.addEventListener('play', () => {
    learnState.playing = true;
    el.playIcon.textContent = '⏸';
    highlightCurrent(false);
  });
  audio.addEventListener('pause', () => {
    if (audio.ended) return;
    learnState.playing = false;
    el.playIcon.textContent = '▶';
    highlightCurrent(false);
  });
  audio.addEventListener('error', () => {
    if (!audio.src) return;
    el.nowPlaying.textContent = 'Не удалось загрузить аудио. Проверьте интернет.';
    learnState.playing = false;
    el.playIcon.textContent = '▶';
  });
}

function trackFor(n) {
  return AYAH_AUDIO(surahOffsets[learnState.surah] + n);
}

function playCurrent() {
  el.audio.src = learnState.playingBismillah ? AYAH_AUDIO(BISMILLAH_GLOBAL) : trackFor(learnState.current);
  el.audio.playbackRate = learnState.speed;
  el.audio.play().catch(() => {});
  highlightCurrent(true);
  if (learnState.mode === 'write') renderWriteBox();
}

function toggleLearnPlay() {
  if (!learnState.verses.length) return;
  if (learnState.playing) {
    el.audio.pause();
    return;
  }
  if (el.audio.src && !el.audio.ended && el.audio.currentTime > 0) {
    el.audio.play().catch(() => {});
    return;
  }
  learnState.repeatDone = 0;
  learnState.playingBismillah = needsBismillah(learnState.current);
  playCurrent();
}

function needsBismillah(n) {
  return n === 1 && learnState.surah !== 1 && learnState.surah !== 9;
}

function goToAyah(n, autoplay) {
  if (n < learnState.from || n > learnState.to) return;
  learnState.current = n;
  learnState.repeatDone = 0;
  learnState.playingBismillah = false;
  if (autoplay) playCurrent();
  else {
    el.audio.pause();
    el.audio.removeAttribute('src');
    highlightCurrent(true);
    if (learnState.mode === 'write') renderWriteBox();
  }
}

function onAyahEnded() {
  if (learnState.playingBismillah) {
    learnState.playingBismillah = false;
    playCurrent();
    return;
  }
  learnState.repeatDone += 1;
  if (learnState.repeatDone < learnState.repeatTimes) {
    playCurrent();
    return;
  }
  learnState.repeatDone = 0;
  // В режиме письма останавливаемся после аята, чтобы пользователь записал его
  if (learnState.mode === 'write') {
    learnState.playing = false;
    el.playIcon.textContent = '▶';
    return;
  }
  if (learnState.current < learnState.to) {
    learnState.current += 1;
    playCurrent();
  } else if (learnState.loopRange) {
    learnState.current = learnState.from;
    learnState.playingBismillah = needsBismillah(learnState.current);
    playCurrent();
  } else {
    learnState.playing = false;
    el.playIcon.textContent = '▶';
    learnState.current = learnState.from;
    highlightCurrent(false);
  }
}

function stopPlayback() {
  el.audio.pause();
  el.audio.removeAttribute('src');
  learnState.playing = false;
  learnState.playingBismillah = false;
  if (el.playIcon) el.playIcon.textContent = '▶';
}

function toggleLearnLoop() {
  learnState.loopRange = !learnState.loopRange;
  el.btnLoop.textContent = learnState.loopRange ? 'Круг: вкл' : 'Круг: выкл';
  el.btnLoop.classList.toggle('active', learnState.loopRange);
}

function cycleLearnSpeed() {
  const speeds = [0.75, 1, 1.25];
  learnState.speed = speeds[(speeds.indexOf(learnState.speed) + 1) % speeds.length];
  el.audio.playbackRate = learnState.speed;
  el.btnSpeed.textContent = `${learnState.speed}x`;
}

// Одновременно играет только один плеер приложения
function pauseOtherPlayersOnPlay() {
  const ids = ['quranAudio', 'guideAudio', 'learnAudio'];
  ids.forEach((id) => {
    document.getElementById(id)?.addEventListener('play', () => {
      ids.filter((other) => other !== id).forEach((other) => {
        const audio = document.getElementById(other);
        if (audio && !audio.paused) audio.pause();
      });
    });
  });
}
