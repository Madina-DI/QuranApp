import { surahGuide, feelings, defaultFeelingId, surahAudioUrl } from './surahGuide.js';

// ==========================================
// «Коран отвечает»: поиск сур по вопросу или состоянию + плеер для отдыха
// ==========================================
const guideState = {
  activeFeelingId: null,
  playingSurah: null,
  loop: true,
  sleepMinutes: 0,
  sleepTimerId: null
};

const el = {};

export function initHeartGuide() {
  el.input = document.getElementById('guideQueryInput');
  el.chips = document.getElementById('guideFeelingChips');
  el.intro = document.getElementById('guideResultIntro');
  el.results = document.getElementById('guideResults');
  el.browseFilter = document.getElementById('guideBrowseFilter');
  el.browseList = document.getElementById('guideBrowseList');
  el.audio = document.getElementById('guideAudio');
  el.player = document.getElementById('guidePlayer');
  el.playerTitle = document.getElementById('guidePlayerTitle');
  el.playerTime = document.getElementById('guidePlayerTime');
  el.playerFill = document.getElementById('guidePlayerFill');
  el.playerTrack = document.getElementById('guidePlayerTrack');
  el.playerIcon = document.getElementById('guidePlayerIcon');
  el.btnLoop = document.getElementById('guideBtnLoop');
  el.btnSleep = document.getElementById('guideBtnSleep');
  if (!el.input) return;

  renderFeelingChips();
  renderBrowseList('');
  initGuideAudio();

  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askQuran();
    }
  });
  el.browseFilter.addEventListener('input', (e) => renderBrowseList(e.target.value));

  window.askQuran = askQuran;
  window.selectFeeling = selectFeeling;
  window.showSurahGuide = showSurahGuide;
  window.toggleSurahListen = toggleSurahListen;
  window.toggleGuidePlay = toggleGuidePlay;
  window.toggleGuideLoop = toggleGuideLoop;
  window.cycleGuideSleep = cycleGuideSleep;
  window.seekGuideAudio = seekGuideAudio;
}

// ---------- Matching ----------
function normalize(text) {
  return ` ${text.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function keywordHits(normText, words, keyword) {
  const kw = keyword.toLowerCase().replace(/ё/g, 'е');
  if (kw.endsWith(' ')) return words.includes(kw.trim());
  if (kw.includes(' ')) return normText.includes(` ${kw}`);
  return words.some((w) => w.startsWith(kw));
}

function matchFeelings(query) {
  const normText = normalize(query);
  const words = normText.trim().split(' ');
  return feelings
    .map((f) => ({ feeling: f, score: f.keywords.filter((k) => keywordHits(normText, words, k)).length }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.feeling);
}

// Совпадения по названию суры, номеру или тексту описания
function matchSurahsByText(query) {
  const normText = normalize(query).trim();
  if (!normText) return [];
  const asNumber = parseInt(normText, 10);
  if (asNumber >= 1 && asNumber <= 114 && String(asNumber) === normText) return [surahGuide[asNumber - 1]];

  const stems = normText.split(' ').filter((w) => w.length >= 4).map((w) => w.slice(0, Math.max(4, w.length - 2)));
  if (!stems.length) return [];
  return surahGuide
    .map((s) => {
      const name = normalize(`${s.ru} ${s.meaning}`);
      const body = normalize(`${s.about} ${s.gives}`);
      const score = stems.reduce((acc, st) => acc + (name.includes(st) ? 5 : 0) + (body.includes(st) ? 1 : 0), 0);
      return { s, score };
    })
    // Одно случайное совпадение в описании не считаем ответом
    .filter((m) => m.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((m) => m.s);
}

// Объединяем подборки нескольких состояний: суры выше в списке получают больший вес
function rankSurahs(matched) {
  const scores = new Map();
  matched.forEach((f, fIdx) => {
    f.surahs.forEach(([n, ref], idx) => {
      const entry = scores.get(n) || { n, score: 0, reasons: [] };
      entry.score += (f.surahs.length - idx) * (fIdx === 0 ? 1.5 : 1);
      entry.reasons.push({ feeling: f, ref });
      scores.set(n, entry);
    });
  });
  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 6);
}

function askQuran() {
  const query = el.input.value.trim();
  if (!query) {
    el.input.focus();
    return;
  }
  const matched = matchFeelings(query);
  guideState.activeFeelingId = matched[0]?.id || null;
  updateChipHighlight();

  if (matched.length) {
    renderFeelingResults(matched, `По вашему запросу «${escapeHtml(query)}»`);
    return;
  }

  const byText = matchSurahsByText(query);
  if (byText.length) {
    el.intro.innerHTML = `<p class="guide-intro-text">Суры, связанные с «${escapeHtml(query)}»:</p>`;
    el.results.innerHTML = byText.map((s) => surahCardHtml(s, [])).join('');
    return;
  }

  const fallback = feelings.find((f) => f.id === defaultFeelingId);
  renderFeelingResults([fallback], 'Мы не нашли точного совпадения. Вот суры, которые читают для покоя сердца');
}

function selectFeeling(id) {
  const f = feelings.find((x) => x.id === id);
  if (!f) return;
  guideState.activeFeelingId = id;
  updateChipHighlight();
  renderFeelingResults([f], `${f.emoji} ${f.label}`);
}

function showSurahGuide(n) {
  const s = surahGuide[n - 1];
  if (!s) return;
  guideState.activeFeelingId = null;
  updateChipHighlight();
  el.intro.innerHTML = '';
  el.results.innerHTML = surahCardHtml(s, []);
  el.results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Rendering ----------
function renderFeelingChips() {
  el.chips.innerHTML = feelings
    .map((f) => `<button class="guide-chip" data-feeling="${f.id}" onclick="selectFeeling('${f.id}')">${f.emoji} ${f.label}</button>`)
    .join('');
}

function updateChipHighlight() {
  el.chips.querySelectorAll('.guide-chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.feeling === guideState.activeFeelingId);
  });
}

function renderFeelingResults(matched, title) {
  const verses = matched
    .slice(0, 2)
    .map((f) => `
      <blockquote class="guide-verse">
        <span class="guide-verse-feeling">${f.emoji} ${f.label}</span>
        <p>«${f.verse.text}»</p>
        <cite>Коран, ${f.verse.ref}</cite>
      </blockquote>`)
    .join('');
  el.intro.innerHTML = `<p class="guide-intro-text">${title}:</p>${verses}`;

  const ranked = rankSurahs(matched);
  el.results.innerHTML = ranked.map((r) => surahCardHtml(surahGuide[r.n - 1], r.reasons)).join('');
}

function surahCardHtml(s, reasons) {
  const isPlaying = guideState.playingSurah === s.n && !el.audio.paused;
  const tags = reasons
    .map((r) => `<span class="guide-tag">${r.feeling.emoji} ${r.feeling.label}${r.ref ? ` · ${r.ref}` : ''}</span>`)
    .join('');
  return `
    <article class="guide-surah-card" data-surah="${s.n}">
      <div class="guide-surah-head">
        <div class="guide-surah-num">${s.n}</div>
        <div class="guide-surah-names">
          <h4>${s.ru} <span class="guide-surah-meaning">«${s.meaning}»</span></h4>
          <span class="guide-surah-meta">${s.place} • ${s.ayahs} аятов</span>
        </div>
        <div class="guide-surah-ar" lang="ar" dir="rtl">${s.ar}</div>
      </div>
      ${tags ? `<div class="guide-tags">${tags}</div>` : ''}
      <p class="guide-surah-about"><strong>О чём сура:</strong> ${s.about}</p>
      <p class="guide-surah-gives"><strong>Что вы найдёте:</strong> ${s.gives}</p>
      <div class="guide-card-actions">
        <button class="btn-modal-action highlight guide-listen-btn" onclick="toggleSurahListen(${s.n})">
          ${isPlaying ? '⏸ Пауза' : 'Слушать суру'}
        </button>
        <button class="btn-modal-action" onclick="openSurahForLearning(${s.n})">Читать и учить</button>
      </div>
    </article>`;
}

function renderBrowseList(filter) {
  const q = normalize(filter).trim();
  const items = surahGuide.filter((s) => !q || normalize(`${s.n} ${s.ru} ${s.meaning} ${s.ar}`).includes(q));
  el.browseList.innerHTML = items.length
    ? items
        .map((s) => `
          <button class="guide-browse-item" onclick="showSurahGuide(${s.n})">
            <span class="guide-browse-num">${s.n}</span>
            <span class="guide-browse-name">${s.ru}<small>${s.meaning}</small></span>
            <span class="guide-browse-ar" lang="ar" dir="rtl">${s.ar}</span>
          </button>`)
        .join('')
    : '<p class="guide-empty">Сура не найдена</p>';
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Relaxation player ----------
function initGuideAudio() {
  const audio = el.audio;
  audio.loop = guideState.loop;

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    el.playerFill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    el.playerTime.textContent = `${formatSec(audio.currentTime)} / ${formatSec(audio.duration)}`;
  });
  audio.addEventListener('play', () => {
    // Не играть одновременно с основным плеером урока
    const mainAudio = document.getElementById('quranAudio');
    if (mainAudio && !mainAudio.paused) mainAudio.pause();
    syncPlayerUi();
  });
  audio.addEventListener('pause', syncPlayerUi);
  audio.addEventListener('ended', syncPlayerUi);
  audio.addEventListener('error', () => {
    el.playerTime.textContent = 'Не удалось загрузить аудио. Проверьте интернет.';
  });

  const mainAudio = document.getElementById('quranAudio');
  if (mainAudio) mainAudio.addEventListener('play', () => audio.pause());
}

function toggleSurahListen(n) {
  const s = surahGuide[n - 1];
  if (!s) return;
  if (guideState.playingSurah === n) {
    toggleGuidePlay();
    return;
  }
  guideState.playingSurah = n;
  el.audio.src = surahAudioUrl(n);
  el.playerTitle.textContent = `${s.n}. ${s.ru} — Мишари Рашид Аль-Афаси`;
  el.playerTime.textContent = 'Загрузка…';
  el.playerFill.style.width = '0%';
  el.player.hidden = false;
  el.audio.play().catch(() => {});
}

function toggleGuidePlay() {
  if (!guideState.playingSurah) return;
  if (el.audio.paused) el.audio.play().catch(() => {});
  else el.audio.pause();
}

function toggleGuideLoop() {
  guideState.loop = !guideState.loop;
  el.audio.loop = guideState.loop;
  el.btnLoop.textContent = guideState.loop ? 'Повтор: вкл' : 'Повтор: выкл';
  el.btnLoop.classList.toggle('active', guideState.loop);
}

// Таймер сна: выключить чтение через 15 / 30 / 60 минут
function cycleGuideSleep() {
  const options = [0, 15, 30, 60];
  guideState.sleepMinutes = options[(options.indexOf(guideState.sleepMinutes) + 1) % options.length];
  clearTimeout(guideState.sleepTimerId);
  guideState.sleepTimerId = null;
  if (guideState.sleepMinutes) {
    guideState.sleepTimerId = setTimeout(() => {
      el.audio.pause();
      guideState.sleepMinutes = 0;
      el.btnSleep.textContent = 'Таймер сна';
      el.btnSleep.classList.remove('active');
    }, guideState.sleepMinutes * 60 * 1000);
  }
  el.btnSleep.textContent = guideState.sleepMinutes ? `Сон: ${guideState.sleepMinutes} мин` : 'Таймер сна';
  el.btnSleep.classList.toggle('active', guideState.sleepMinutes > 0);
}

function seekGuideAudio(e) {
  if (!el.audio.duration) return;
  const rect = el.playerTrack.getBoundingClientRect();
  const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  el.audio.currentTime = pct * el.audio.duration;
}

function syncPlayerUi() {
  const playing = !el.audio.paused;
  el.playerIcon.textContent = playing ? '⏸' : '▶';
  el.results.querySelectorAll('.guide-surah-card').forEach((card) => {
    const btn = card.querySelector('.guide-listen-btn');
    const isCurrent = Number(card.dataset.surah) === guideState.playingSurah;
    btn.textContent = isCurrent && playing ? '⏸ Пауза' : 'Слушать суру';
    card.classList.toggle('playing', isCurrent && playing);
  });
}

function formatSec(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
