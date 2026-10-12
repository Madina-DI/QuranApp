import { quranData, tajweedRulesInfo } from './quranData.js';
import { initHeartGuide } from './heartGuide.js';
import { initQuranLearn } from './quranLearn.js';
import { NAMAZ_RECITATIONS } from './namazData.js';
import { initPrayerTimes, onPrayerScreenShown } from './prayerScreen.js';
import { initQibla, updateQiblaForLocation } from './qibla.js';

// ==========================================
// Storage helpers
// ==========================================
function readStoredJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Серия дней: +1, если вчера был визит; сброс до 1, если был пропуск
function updateStreak() {
  const today = localDateKey(new Date());
  const yesterday = localDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const lastVisit = localStorage.getItem('al_bayan_last_visit');
  let streak = parseInt(localStorage.getItem('al_bayan_streak') || '0', 10) || 0;

  if (lastVisit !== today) {
    streak = lastVisit === yesterday ? streak + 1 : 1;
    localStorage.setItem('al_bayan_streak', String(streak));
    localStorage.setItem('al_bayan_last_visit', today);
  }
  return Math.max(streak, 1);
}

function pluralDays(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

// ==========================================
// Application State
// ==========================================
let state = {
  currentAyahIndex: 0,
  readerMode: 'wordByWord', // 'wordByWord' | 'translation'
  isTajweedMode: true,
  isHifzMode: false,
  activeStep: 1,
  selectedWord: null,
  streakDays: updateStreak(),
  learnedWords: new Set(readStoredJSON('al_bayan_learned_words', [])),
  quizScore: parseInt(localStorage.getItem('al_bayan_score') || '0', 10) || 0,
  quizQuestionNum: 1,
  activeTab: 'quiz',
  audioSpeed: 1.0,
  audioRepeat: 1, // сколько раз проиграть аят подряд
  audioRepeatsLeft: 0,
  lessonsDone: new Set(readStoredJSON('al_bayan_lessons_done', [])),
  currentQuiz: null
};

// DOM Element References
const elements = {
  ayahSelect: document.getElementById('ayahSelect'),
  streakCounter: document.getElementById('streakCounter'),
  vocabMastery: document.getElementById('vocabMastery'),
  verseDisplayBox: document.getElementById('verseDisplayBox'),
  translationBox: document.getElementById('translationBox'),
  translationText: document.getElementById('translationText'),
  surahBadgeText: document.getElementById('surahBadgeText'),
  tajweedLegend: document.getElementById('tajweedLegend'),
  legendItems: document.getElementById('legendItems'),
  quranAudio: document.getElementById('quranAudio'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  playIcon: document.getElementById('playIcon'),
  audioTime: document.getElementById('audioTime'),
  audioProgressTrack: document.getElementById('audioProgressTrack'),
  audioProgressFill: document.getElementById('audioProgressFill'),
  btnSpeed: document.getElementById('btnSpeed'),
  btnLoop: document.getElementById('btnLoop'),
  dictFill: document.getElementById('dictFill'),
  dictCount: document.getElementById('dictCount'),
  
  // Steps
  stepCounterText: document.getElementById('stepCounterText'),

  // Tabs
  contentQuiz: document.getElementById('contentQuiz'),
  contentTadabbur: document.getElementById('contentTadabbur'),
  contentDictionary: document.getElementById('contentDictionary'),
  
  // Quiz
  quizProgressNum: document.getElementById('quizProgressNum'),
  quizScoreText: document.getElementById('quizScoreText'),
  quizTargetArabic: document.getElementById('quizTargetArabic'),
  quizOptionsGrid: document.getElementById('quizOptionsGrid'),
  quizFeedback: document.getElementById('quizFeedback'),

  // Tadabbur
  tadabburText: document.getElementById('tadabburText'),
  userNotes: document.getElementById('userNotes'),
  saveStatus: document.getElementById('saveStatus'),

  // Dictionary
  dictWordsList: document.getElementById('dictWordsList'),

  // Modal
  wordModalOverlay: document.getElementById('wordModalOverlay'),
  modalArabic: document.getElementById('modalArabic'),
  modalTranslit: document.getElementById('modalTranslit'),
  modalRu: document.getElementById('modalRu'),
  modalRoot: document.getElementById('modalRoot'),
  modalRootRu: document.getElementById('modalRootRu'),
  modalGrammar: document.getElementById('modalGrammar'),
  modalFrequency: document.getElementById('modalFrequency')
};

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initAyahSelect();
  renderCurrentAyah();
  initAudioPlayer();
  initQuiz();
  renderDictionary();
  updateHeaderStats();
  initHeartGuide();
  initQuranLearn();
  initQibla();
  initPrayerTimes(updateQiblaForLocation);
  renderPath();
  renderProfileStats();
  initRouter();

  // Attach global functions to window for inline onclick handlers
  window.setReaderMode = setReaderMode;
  window.toggleTajweedMode = toggleTajweedMode;
  window.toggleHifzBlindMode = toggleHifzBlindMode;
  window.toggleAudioPlay = toggleAudioPlay;
  window.cycleAudioSpeed = cycleAudioSpeed;
  window.toggleAudioLoop = toggleAudioLoop;
  window.seekAudio = seekAudio;
  window.switchStep = switchStep;
  window.switchPanelTab = switchPanelTab;
  window.saveUserNote = saveUserNote;
  window.closeWordModal = closeWordModal;
  window.playWordAudio = playWordAudio;
  window.markWordLearned = markWordLearned;
  window.prevWord = prevWord;
  window.nextWord = nextWord;
  window.openLesson = openLesson;
  window.lessonNext = lessonNext;

  // Офлайн-режим PWA: sw.js раньше не регистрировался
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});

// Populate Ayah Selector Dropdown
function initAyahSelect() {
  elements.ayahSelect.innerHTML = '';
  quranData.forEach((ayah, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = `${ayah.id} • ${ayah.surahNameRu} (${ayah.surahNameAr})`;
    elements.ayahSelect.appendChild(option);
  });

  elements.ayahSelect.addEventListener('change', (e) => {
    state.currentAyahIndex = parseInt(e.target.value, 10);
    renderCurrentAyah();
    initQuiz();
    loadTadabburNote();
  });
}

// Update Header Badges
function updateHeaderStats() {
  elements.streakCounter.textContent = `${state.streakDays} ${pluralDays(state.streakDays)}`;
  // Доля выученных слов из всех слов в уроках приложения
  const lessonWordIds = quranData.flatMap(a => a.words.map(w => w.id));
  const learnedCount = lessonWordIds.filter(id => state.learnedWords.has(id)).length;
  const percentage = lessonWordIds.length ? Math.round((learnedCount / lessonWordIds.length) * 100) : 0;
  elements.vocabMastery.textContent = `${learnedCount} ${pluralWords(learnedCount)}`;
  if (elements.dictFill) elements.dictFill.style.width = `${percentage}%`;
  if (elements.dictCount) elements.dictCount.textContent = `Слова из уроков: выучено ${learnedCount} из ${lessonWordIds.length}`;
}

// ==========================================
// Render Verse & Reader
// ==========================================
function renderCurrentAyah() {
  const ayah = quranData[state.currentAyahIndex];

  // Update Surah Badge & Audio source
  elements.surahBadgeText.textContent = `${ayah.surahNameRu}, аят ${ayah.ayahNum}`;
  elements.translationText.textContent = ayah.fullTranslation;
  // Смена аята останавливает воспроизведение: синхронизируем кнопку и скорость
  if (elements.quranAudio.getAttribute('src') !== ayah.audioUrl) {
    elements.quranAudio.pause();
    elements.quranAudio.src = ayah.audioUrl;
    elements.quranAudio.playbackRate = state.audioSpeed;
    elements.playIcon.textContent = '▶';
    elements.audioProgressFill.style.width = '0%';
  }

  // Clear & render words
  elements.verseDisplayBox.innerHTML = '';

  ayah.words.forEach((word) => {
    const wordCard = document.createElement('div');
    wordCard.className = 'word-card';
    wordCard.id = `word-${word.id}`;
    
    if (state.isHifzMode) {
      wordCard.classList.add('blinded');
    }

    if (state.isTajweedMode && word.tajweedRule) {
      wordCard.setAttribute('data-tajweed', word.tajweedRule);
    }

    // Main Arabic Text
    const arSpan = document.createElement('span');
    arSpan.className = 'ar-text';
    arSpan.textContent = word.ar;
    wordCard.appendChild(arSpan);

    // Subtitles if Word-by-Word mode
    if (state.readerMode === 'wordByWord') {
      const ruSpan = document.createElement('span');
      ruSpan.className = 'ru-sub';
      ruSpan.textContent = word.ru;
      wordCard.appendChild(ruSpan);

      const translitSpan = document.createElement('span');
      translitSpan.className = 'translit-sub';
      translitSpan.textContent = word.translit;
      wordCard.appendChild(translitSpan);
    }

    // Word Click Handler
    wordCard.addEventListener('click', () => openWordModal(word));

    elements.verseDisplayBox.appendChild(wordCard);
  });

  // Render Tajweed Legend
  renderTajweedLegend(ayah);
  loadTadabburNote();
}

// Render Tajweed Legend Badges
function renderTajweedLegend(ayah) {
  if (!state.isTajweedMode) {
    elements.tajweedLegend.style.display = 'none';
    return;
  }

  const activeRules = [...new Set(ayah.words.map(w => w.tajweedRule).filter(Boolean))];
  
  if (activeRules.length === 0) {
    elements.tajweedLegend.style.display = 'none';
    return;
  }

  elements.tajweedLegend.style.display = 'block';
  elements.legendItems.innerHTML = '';

  activeRules.forEach(ruleKey => {
    const rule = tajweedRulesInfo[ruleKey];
    if (rule) {
      const chip = document.createElement('span');
      chip.className = 'legend-chip';
      chip.style.backgroundColor = rule.color;
      chip.textContent = rule.name;
      chip.title = rule.desc;
      elements.legendItems.appendChild(chip);
    }
  });
}

// ==========================================
// Mode Toggles
// ==========================================
function setReaderMode(mode) {
  state.readerMode = mode;
  document.getElementById('modeWordByWord').classList.toggle('active', mode === 'wordByWord');
  document.getElementById('modeTranslation').classList.toggle('active', mode === 'translation');
  
  elements.translationBox.style.display = (mode === 'translation') ? 'block' : 'block';
  renderCurrentAyah();
}

function toggleTajweedMode() {
  state.isTajweedMode = !state.isTajweedMode;
  document.getElementById('modeTajweed').classList.toggle('active', state.isTajweedMode);
  renderCurrentAyah();
}

function toggleHifzBlindMode() {
  state.isHifzMode = !state.isHifzMode;
  document.getElementById('modeHifz').classList.toggle('active', state.isHifzMode);
  renderCurrentAyah();
}

// ==========================================
// Synchronized Audio Player
// ==========================================
function initAudioPlayer() {
  const audio = elements.quranAudio;

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const progressPct = (audio.currentTime / audio.duration) * 100;
    elements.audioProgressFill.style.width = `${progressPct}%`;

    const formatSec = (sec) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };
    elements.audioTime.textContent = `${formatSec(audio.currentTime)} / ${formatSec(audio.duration)}`;

    // Sync highlight active word
    syncWordHighlight(audio.currentTime);
  });

  audio.addEventListener('ended', () => {
    clearWordHighlights();
    if (state.audioRepeatsLeft > 1) {
      state.audioRepeatsLeft -= 1;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  });

  // Иконка следует за реальным состоянием плеера
  audio.addEventListener('play', () => {
    elements.playIcon.textContent = '⏸';
    namazAudio.pause();
  });
  audio.addEventListener('pause', () => { elements.playIcon.textContent = '▶'; });
}

function toggleAudioPlay() {
  const audio = elements.quranAudio;
  if (audio.paused) {
    audio.playbackRate = state.audioSpeed;
    if (audio.currentTime === 0 || audio.ended) state.audioRepeatsLeft = state.audioRepeat;
    audio.play().catch(() => { elements.playIcon.textContent = '▶'; });
  } else {
    audio.pause();
  }
}

function syncWordHighlight(currentTime) {
  const ayah = quranData[state.currentAyahIndex];
  ayah.words.forEach(word => {
    const card = document.getElementById(`word-${word.id}`);
    if (card) {
      if (currentTime >= word.audioStart && currentTime <= word.audioEnd) {
        card.classList.add('active-playing');
      } else {
        card.classList.remove('active-playing');
      }
    }
  });
}

function clearWordHighlights() {
  document.querySelectorAll('.word-card').forEach(c => c.classList.remove('active-playing'));
}

function cycleAudioSpeed() {
  const speeds = [1.0, 1.25, 0.75];
  const nextIdx = (speeds.indexOf(state.audioSpeed) + 1) % speeds.length;
  state.audioSpeed = speeds[nextIdx];
  elements.quranAudio.playbackRate = state.audioSpeed;
  elements.btnSpeed.textContent = `${state.audioSpeed}x`;
}

// Повтор аята: 1 → 3 → 5 раз
function toggleAudioLoop() {
  const counts = [1, 3, 5];
  state.audioRepeat = counts[(counts.indexOf(state.audioRepeat) + 1) % counts.length];
  state.audioRepeatsLeft = state.audioRepeat;
  document.getElementById('repeatLabel').textContent = state.audioRepeat === 1 ? '1' : `×${state.audioRepeat}`;
  elements.btnLoop.classList.toggle('active', state.audioRepeat > 1);
  elements.btnLoop.setAttribute('aria-label', `Повтор аята: ${state.audioRepeat} раз`);
}

// Переход к предыдущему / следующему слову по таймингам слов
function jumpWord(direction) {
  const audio = elements.quranAudio;
  const words = quranData[state.currentAyahIndex].words;
  if (!words.length) return;
  const t = audio.currentTime;
  let idx = words.findIndex(w => t >= w.audioStart && t < w.audioEnd);
  if (idx === -1) idx = t >= words[words.length - 1].audioEnd ? words.length : -1;
  const target = Math.min(words.length - 1, Math.max(0, idx + direction));
  audio.currentTime = words[target].audioStart;
  syncWordHighlight(words[target].audioStart + 0.01);
}
function prevWord() { jumpWord(-1); }
function nextWord() { jumpWord(1); }

function seekAudio(e) {
  const track = elements.audioProgressTrack;
  const rect = track.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = Math.min(1, Math.max(0, clickX / rect.width));
  const duration = elements.quranAudio.duration;
  if (!Number.isFinite(duration)) return; // аудио ещё не загружено
  elements.quranAudio.currentTime = pct * duration;
}

// ==========================================
// 5-Minute Habit Steps Navigation
// ==========================================
function switchStep(stepNum) {
  state.activeStep = stepNum;
  for (let i = 1; i <= 4; i++) {
    const card = document.getElementById(`step${i}Card`);
    if (card) card.classList.toggle('active', i === stepNum);
  }

  for (let i = 1; i <= 4; i++) {
    const seg = document.getElementById(`step${i}Card`);
    if (seg) seg.classList.toggle('done', i < stepNum);
  }
  const stepTitles = [
    'Шаг 1 · Слушание',
    'Шаг 2 · Разбор слов',
    'Шаг 3 · Квиз',
    'Шаг 4 · Таддабур'
  ];
  elements.stepCounterText.textContent = stepTitles[stepNum - 1];
  const lessonScreen = document.getElementById('screen-lesson');
  if (lessonScreen) lessonScreen.dataset.step = String(stepNum);
  const lessonCount = document.getElementById('lessonCount');
  if (lessonCount) lessonCount.textContent = `${stepNum}/4`;
  const nextBtn = document.getElementById('lessonNextBtn');
  if (nextBtn) nextBtn.textContent = stepNum === 4 ? 'Завершить урок' : 'Далее';

  // Action based on step
  if (stepNum === 1) {
    setReaderMode('wordByWord');
  } else if (stepNum === 2) {
    setReaderMode('wordByWord');
    // Highlight first word
    const ayah = quranData[state.currentAyahIndex];
    if (ayah.words.length > 0) openWordModal(ayah.words[0]);
  } else if (stepNum === 3) {
    switchPanelTab('quiz');
  } else if (stepNum === 4) {
    switchPanelTab('tadabbur');
  }
}

// ==========================================
// Panel Tabs
// ==========================================
function switchPanelTab(tabName) {
  state.activeTab = tabName;
  
  // Словарь живёт на экране профиля, урок переключает только квиз и таддабур
  if (tabName === 'dictionary') { location.hash = '#profile'; return; }
  elements.contentQuiz.style.display = (tabName === 'quiz') ? 'block' : 'none';
  elements.contentTadabbur.style.display = (tabName === 'tadabbur') ? 'block' : 'none';
}

// ==========================================
// Screens & tab bar (hash routing)
// ==========================================
const SCREENS = ['path', 'quran', 'listen', 'namaz', 'profile', 'lesson'];

function showScreen(name) {
  if (!SCREENS.includes(name)) name = 'path';
  document.querySelectorAll('.screen').forEach(sc => {
    sc.classList.toggle('active', sc.dataset.screen === name);
  });
  document.querySelectorAll('.tab-link').forEach(link => {
    const on = link.dataset.tab === name;
    link.classList.toggle('active', on);
    if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  document.body.classList.toggle('in-lesson', name === 'lesson');
  if (name !== 'lesson') elements.quranAudio.pause();
  if (name === 'path') renderPath();
  if (name === 'namaz') onPrayerScreenShown();
  if (name === 'profile') { renderProfileStats(); renderDictionary(); updateHeaderStats(); }
  window.scrollTo(0, 0);
}

function initRouter() {
  const route = () => showScreen(location.hash.replace('#', '') || 'path');
  window.addEventListener('hashchange', route);
  route();
}

// ==========================================
// Path of lessons
// ==========================================
const toArabicDigits = (n) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);

function saveLessonsDone() {
  localStorage.setItem('al_bayan_lessons_done', JSON.stringify([...state.lessonsDone]));
}

function currentLessonIndex() {
  const idx = quranData.findIndex(a => !state.lessonsDone.has(a.id));
  return idx === -1 ? quranData.length - 1 : idx;
}

function renderPath() {
  const map = document.getElementById('pathMap');
  if (!map) return;
  const current = currentLessonIndex();
  const allDone = quranData.every(a => state.lessonsDone.has(a.id));
  const cur = quranData[current];

  // Заголовок: сура текущего урока и прогресс по ней
  const surahAyahs = quranData.filter(a => a.surahId === cur.surahId);
  const doneInSurah = surahAyahs.filter(a => state.lessonsDone.has(a.id)).length;
  document.getElementById('pathSurahTitle').textContent = cur.surahNameRu;
  document.getElementById('pathSurahSub').textContent = `${cur.surahMeaning || ''} · ${doneInSurah} из ${surahAyahs.length} ${pluralAyahs(surahAyahs.length)}`;
  document.getElementById('pathSurahAr').textContent = cur.surahNameAr;
  const pct = Math.round((doneInSurah / surahAyahs.length) * 100);
  document.getElementById('pathProgressFill').style.width = `${pct}%`;
  document.getElementById('pathProgress').setAttribute('aria-valuenow', String(pct));

  // Извилистая тропа: узлы смещаются по синусоиде
  const offsets = [50, 72, 80, 62, 38, 22, 30, 52];
  const rowH = 104;
  const points = [];
  let html = '';
  let y = 40;
  let lastSurah = null;
  quranData.forEach((ayah, i) => {
    if (ayah.surahId !== lastSurah) {
      html += `<div class="path-surah-label" style="top:${y - 34}px"><span>${ayah.surahNameRu}</span><span class="path-surah-label-ar" lang="ar">${ayah.surahNameAr}</span></div>`;
      y += 56;
      lastSurah = ayah.surahId;
    }
    const x = offsets[i % offsets.length];
    points.push([x, y]);
    const done = state.lessonsDone.has(ayah.id);
    const isCurrent = i === current && !allDone;
    const status = done ? 'done' : isCurrent ? 'current' : 'locked';
    const label = `${ayah.surahNameRu}, аят ${ayah.ayahNum}${done ? ' (пройден)' : isCurrent ? ' (текущий урок)' : ''}`;
    const inner = done
      ? '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>'
      : `<span class="path-node-num" lang="ar">${toArabicDigits(ayah.ayahNum)}</span>`;
    html += `<button class="path-node ${status}" style="left:${x}%;top:${y}px" onclick="openLesson(${i})" aria-label="${label}"${status === 'locked' ? ' disabled' : ''}>${inner}</button>`;
    if (isCurrent) {
      html += `<div class="path-current-card" style="top:${y + 46}px">
        <span class="path-current-kicker">${ayah.surahNameRu} · аят ${ayah.ayahNum}</span>
        <span class="path-current-text">${ayah.fullTranslation}</span>
        <button class="garden-primary-btn" onclick="openLesson(${i})">Начать урок</button>
      </div>`;
      y += 150;
    }
    y += rowH;
  });

  const h = y;
  const d = points.map(([px, py], i) => {
    if (i === 0) return `M${px} ${py}`;
    const [qx, qy] = points[i - 1];
    const my = (qy + py) / 2;
    return `C${qx} ${my} ${px} ${my} ${px} ${py}`;
  }).join(' ');
  const svg = `<svg class="path-trail" viewBox="0 0 100 ${h}" preserveAspectRatio="none" aria-hidden="true" style="height:${h}px">
    <path d="${d}" fill="none" stroke="#2A4A3B" stroke-width="10" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
    <path d="${d}" fill="none" stroke="#E2C275" stroke-opacity=".35" stroke-width="2" stroke-dasharray="2 10" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
  </svg>`;
  map.style.height = `${h}px`;
  map.innerHTML = svg + html + (allDone ? '<p class="path-finished">Все уроки пройдены. Повторяйте любой аят, нажав на него.</p>' : '');
  // Пройденные узлы можно открыть снова; заблокированные — нет
  map.querySelectorAll('.path-node.done').forEach(n => n.removeAttribute('disabled'));
}

function openLesson(index) {
  state.currentAyahIndex = index;
  elements.ayahSelect.value = String(index);
  renderCurrentAyah();
  initQuiz();
  loadTadabburNote();
  switchStep(1);
  if (location.hash !== '#lesson') location.hash = '#lesson';
  else showScreen('lesson');
}

function lessonNext() {
  if (state.activeStep < 4) {
    switchStep(state.activeStep + 1);
    window.scrollTo(0, 0);
    return;
  }
  const ayah = quranData[state.currentAyahIndex];
  if (elements.userNotes.value.trim()) saveUserNote();
  state.lessonsDone.add(ayah.id);
  saveLessonsDone();
  location.hash = '#path';
}

// ==========================================
// Profile
// ==========================================
function renderProfileStats() {
  const box = document.getElementById('profileStats');
  if (!box) return;
  const hifz = readStoredJSON('al_bayan_hifz', {});
  const hifzCount = Object.values(hifz).reduce((sum, v) => {
    if (Array.isArray(v)) return sum + v.length;
    if (v && typeof v === 'object') return sum + Object.keys(v).length;
    return sum + (v ? 1 : 0);
  }, 0);
  const duas = readStoredJSON('al_bayan_learned_namaz_duas', []);
  const duaCount = Array.isArray(duas) ? duas.length : Object.keys(duas || {}).length;
  const stats = [
    [state.streakDays, pluralDays(state.streakDays), 'подряд'],
    [state.lessonsDone.size, 'из ' + quranData.length, 'уроков пройдено'],
    [state.learnedWords.size, pluralWords(state.learnedWords.size), 'выучено'],
    [hifzCount, pluralAyahs(hifzCount), 'наизусть'],
    [duaCount, pluralForm(duaCount, 'молитва', 'молитвы', 'молитв'), 'из тренажёра'],
    [state.quizScore, 'очков', 'за квизы']
  ];
  box.innerHTML = stats.map(([n, unit, label]) =>
    `<div class="profile-stat"><span class="profile-stat-num">${n}</span><span class="profile-stat-label">${unit} ${label}</span></div>`
  ).join('');
}

function pluralForm(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
function pluralWords(n) { return pluralForm(n, 'слово', 'слова', 'слов'); }
function pluralAyahs(n) { return pluralForm(n, 'аят', 'аята', 'аятов'); }

// ==========================================
// Spaced Repetition Quiz Engine
// ==========================================
function initQuiz() {
  const currentAyah = quranData[state.currentAyahIndex];
  if (!currentAyah || !currentAyah.words.length) return;

  // Pick target word from current ayah
  const targetWord = currentAyah.words[Math.floor(Math.random() * currentAyah.words.length)];

  // Gather wrong options from all words in dataset
  const allWords = quranData.flatMap(a => a.words);
  const wrongOptions = allWords
    .filter(w => w.ru !== targetWord.ru)
    .map(w => w.ru);
  
  // Pick 3 unique wrong options
  const shuffledWrong = wrongOptions.sort(() => 0.5 - Math.random());
  const uniqueWrong = [...new Set(shuffledWrong)].slice(0, 3);

  // Combine & shuffle all 4 options
  const allOptions = [targetWord.ru, ...uniqueWrong].sort(() => 0.5 - Math.random());

  state.currentQuiz = {
    targetWord,
    correctAnswer: targetWord.ru,
    options: allOptions
  };

  renderQuiz();
}

function renderQuiz() {
  if (!state.currentQuiz) return;
  const q = state.currentQuiz;

  elements.quizTargetArabic.textContent = q.targetWord.ar;
  elements.quizScoreText.textContent = `Очки: ${state.quizScore}`;
  elements.quizProgressNum.textContent = `Вопрос ${((state.quizQuestionNum - 1) % 3) + 1} из 3`;
  elements.quizFeedback.textContent = '';
  elements.quizOptionsGrid.innerHTML = '';

  q.options.forEach(optionText => {
    const btn = document.createElement('button');
    btn.className = 'btn-option';
    btn.textContent = optionText;
    btn.onclick = () => handleQuizOptionClick(btn, optionText);
    elements.quizOptionsGrid.appendChild(btn);
  });
}

function handleQuizOptionClick(btn, selectedText) {
  const q = state.currentQuiz;
  const isCorrect = (selectedText === q.correctAnswer);

  const allBtns = elements.quizOptionsGrid.querySelectorAll('.btn-option');
  allBtns.forEach(b => b.disabled = true);

  if (isCorrect) {
    btn.classList.add('correct');
    elements.quizFeedback.textContent = 'Отлично! Правильный ответ.';
    elements.quizFeedback.style.color = '#34d399';
    
    state.quizScore += 10;
    state.quizQuestionNum += 1;
    state.learnedWords.add(q.targetWord.id);
    localStorage.setItem('al_bayan_score', state.quizScore.toString());
    localStorage.setItem('al_bayan_learned_words', JSON.stringify([...state.learnedWords]));

    updateHeaderStats();
    renderDictionary();

    setTimeout(() => {
      initQuiz();
    }, 1400);

  } else {
    btn.classList.add('incorrect');
    elements.quizFeedback.textContent = `Неверно. Правильный перевод: "${q.correctAnswer}"`;
    elements.quizFeedback.style.color = '#fca5a5';

    state.quizQuestionNum += 1;

    // Highlight correct button
    allBtns.forEach(b => {
      if (b.textContent === q.correctAnswer) b.classList.add('correct');
    });

    setTimeout(() => {
      initQuiz();
    }, 2000);
  }
}

// ==========================================
// Tadabbur Notes
// ==========================================
function loadTadabburNote() {
  const ayah = quranData[state.currentAyahIndex];
  elements.tadabburText.textContent = ayah.tafsir;

  const savedNote = localStorage.getItem(`al_bayan_note_${ayah.id}`) || '';
  elements.userNotes.value = savedNote;
  elements.saveStatus.textContent = '';
}

function saveUserNote() {
  const ayah = quranData[state.currentAyahIndex];
  const text = elements.userNotes.value.trim();
  localStorage.setItem(`al_bayan_note_${ayah.id}`, text);
  
  elements.saveStatus.textContent = '✓ Заметка сохранена';
  setTimeout(() => { elements.saveStatus.textContent = ''; }, 2000);
}

// ==========================================
// Vocabulary List / Dictionary
// ==========================================
function renderDictionary() {
  const allWords = quranData.flatMap(a => a.words);
  elements.dictWordsList.innerHTML = '';

  allWords.forEach(word => {
    const isLearned = state.learnedWords.has(word.id);
    const item = document.createElement('div');
    item.className = 'dict-item';
    item.innerHTML = `
      <div class="dict-ar">${word.ar}</div>
      <div class="dict-ru">${word.ru} <span style="font-size: 0.75rem; color: #9ca3af;">(${word.translit})</span></div>
      <div class="dict-freq">${isLearned ? '✓ Выучено' : `Корень: ${word.root}`}</div>
    `;
    elements.dictWordsList.appendChild(item);
  });
}

// ==========================================
// Word Detail Modal
// ==========================================
function openWordModal(word) {
  state.selectedWord = word;
  
  elements.modalArabic.textContent = word.ar;
  elements.modalTranslit.textContent = word.translit;
  elements.modalRu.textContent = word.ru;
  elements.modalRoot.textContent = word.root;
  elements.modalRootRu.textContent = word.rootRu;
  elements.modalGrammar.textContent = word.grammar;
  elements.modalFrequency.textContent = `${word.frequency.toLocaleString()} раз в Коране`;

  elements.wordModalOverlay.classList.add('active');
}

function closeWordModal(e) {
  if (e && e.target !== elements.wordModalOverlay && !e.target.classList.contains('btn-close-modal')) return;
  elements.wordModalOverlay.classList.remove('active');
}

function playWordAudio() {
  if (!state.selectedWord) return;
  // Synthesize or play word pronunciation
  const msg = new SpeechSynthesisUtterance(state.selectedWord.ar);
  msg.lang = 'ar-SA';
  window.speechSynthesis.speak(msg);
}

function markWordLearned() {
  if (!state.selectedWord) return;
  state.learnedWords.add(state.selectedWord.id);
  localStorage.setItem('al_bayan_learned_words', JSON.stringify([...state.learnedWords]));
  updateHeaderStats();
  renderDictionary();
  closeWordModal();
}


// ==========================================
// NAMAZ & WUDU STEP-BY-STEP DATA & LOGIC
// ==========================================
const namazGuideData = {
  wudu: [
    {
      title: "Шаг 1: Намерение и Бисмиллях",
      ar: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
      translit: "Бисмилля́хир-Рахма́нир-Рахи́м",
      ru: "С именем Аллаха, Милостивого, Милосердного!",
      desc: "Сделайте искреннее намерение в сердце совершить омовение (Тахарат) ради Творца и произнесите Бисмиллях."
    },
    {
      title: "Шаг 2: Мытье кистей рук (3 раза)",
      ar: "غَسْلُ الْكَفَّيْنِ",
      translit: "Гасль аль-каффайн",
      ru: "Мытье кистей рук до запястий",
      desc: "Тщательно вымойте обе кисти рук 3 раза, промывая между пальцами."
    },
    {
      title: "Шаг 3: Полоскание рта и носа (3 раза)",
      ar: "الْمَضْمَضَةُ وَالاسْتِنْشَاقُ",
      translit: "Аль-Мадмада валь-Истиншак",
      ru: "Полоскание рта и промывание носа",
      desc: "Наберите воду в рот правой рукой и прополощите 3 раза. Затем наберите воду в нос и слегка высморкайтесь 3 раза."
    },
    {
      title: "Шаг 4: Мытье лица (3 раза)",
      ar: "غَسْلُ الْوَجْهِ",
      translit: "Гасль аль-ваджх",
      ru: "Мытье лица полностью",
      desc: "Вымойте лицо 3 раза от линии роста волос до подбородка и от уха до уха."
    },
    {
      title: "Шаг 5: Мытье рук до локтей (3 раза)",
      ar: "غَسْلُ الْيَدَيْنِ إِلَى الْمِرْفَقَيْنِ",
      translit: "Гасль аль-йадайн иляль-мирфакайн",
      ru: "Мытье рук от кончиков пальцев до локтей",
      desc: "Вымойте правую руку до локтя включительно 3 раза, затем аналогично левую руку 3 раза."
    },
    {
      title: "Шаг 6: Масх головы, ушей и мытье ног (3 раза)",
      ar: "مَسْحُ الرَّأْسِ وَغَسْلُ الرِّجْلَيْنِ",
      translit: "Масх ар-ра'с ва гасль ар-риджляйн",
      ru: "Протирание головы, ушей и мытье ног до щиколоток",
      desc: "Проведите влажными ладонями по всей голове ото лба к затылку, протрите уши. Затем вымойте правую ногу до щиколотки 3 раза, а после — левую."
    }
  ],

  prayer: [
    {
      title: "Шаг 1: Ният (Намерение) и Начальный Такбир",
      ar: "اللَّهُ أَكْبَرُ",
      translit: "Алла́ху Акбар",
      ru: "Аллах — Велик!",
      desc: "Встаньте лицом к Кибле. Сделайте намерение в сердце. Поднимите ладони до уровня ушей (для мужчин) или плеч (для женщин) и произнесите Такбир.",
      posture: "01-takbir"
    },
    {
      title: "Шаг 2: Стояние (Кыйам) и чтение Суры Аль-Фатиха",
      ar: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ... الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
      translit: "Бисмилля́хир-Рахма́нир-Рахи́м ... Аль-Хамду ли-Лля́хи Раббиль-‘Алями́н",
      ru: "С именем Аллаха ... Вся хвала принадлежит Аллаху, Господу миров",
      desc: "Сложите руки на груди или животе (правая поверх левой). Прочтите Суру Аль-Фатиха и затем одну короткую суру.",
      posture: "02-qiyam"
    },
    {
      title: "Шаг 3: Поясной поклон (Руку')",
      ar: "سُبْحَانَ رَبِّيَ الْعَظِيمِ (۳ مرات)",
      translit: "Субха́на Рабби́йаль-‘Азы́м (3 раза)",
      ru: "Пречист мой Великий Господь!",
      desc: "Наклонитесь под углом 90° с прямой спиной, положив ладони на колени. Смотрите в точку суджуда и произнесите дуа 3 раза.",
      posture: "03-ruku"
    },
    {
      title: "Шаг 4: Выпрямление (И’тидаль)",
      ar: "سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ ، رَبَّنَا وَلَكَ الْحَمْدُ",
      translit: "Сами’алла́ху ли-ман хамидах, Раббана́ ва лякаль-хамд",
      ru: "Услышал Аллах того, кто восхвалил Его. Господь наш, Хвала Тебе!",
      desc: "Выпрямитесь полностью ровно стоя, опустив руки вдоль тела.",
      posture: "04-itidal"
    },
    {
      title: "Шаг 5: Первый Земной поклон (Суджуд)",
      ar: "سُبْحَانَ رَبِّيَ الْأَعْلَى (۳ مرات)",
      translit: "Субха́на Рабби́йаль-А‘ля́ (3 раза)",
      ru: "Пречист мой Всевышний Господь!",
      desc: "Опуститесь на полу: пола касаются 7 точек (лоб с носом, обе ладони, оба колена и пальцы обеих ног). Произнесите дуа 3 раза.",
      posture: "05-sujud"
    },
    {
      title: "Шаг 6: Сидение между суджудами и 2-й Суджуд",
      ar: "رَبِّ اغْفِرْ لِي ، رَبِّ اغْفِرْ لِي",
      translit: "Раббиг-фир ли́, Раббиг-фир ли́",
      ru: "Господь мой, прости меня, прости меня!",
      desc: "Поднимитесь и сядьте ровно на левую ногу, положив ладони на бедра. Произнесите дуа и совершите второй суджуд.",
      posture: "06-julus"
    },
    {
      title: "Шаг 7: Второй ракаат и Ташаххуд (Ат-Тахият)",
      ar: "التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ ...",
      translit: "Ат-Тахиййа́ту ли-Лля́хи вас-салява́ту ват-таййиба́т ...",
      ru: "Приветствия, молитвы и все благие дела принадлежат Аллаху ...",
      desc: "Повторите 2-й ракаат. В конце сядьте для чтения Ат-Тахията и Салавата. При произнесении свидетельства поднимите указательный палец правой руки.",
      posture: "07-tashahhud"
    },
    {
      title: "Шаг 8: Приветствие (Салям) — Завершение намаза",
      ar: "السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ",
      translit: "Ас-Саля́му ‘алейкум ва рахмату-Лла́х",
      ru: "Мир вам и милость Аллаха!",
      desc: "Поверните голову вправо, глядя на свое плечо, и произнесите Салям. Затем поверните голову влево и повторите. Намаз завершен!",
      posture: "08-taslim"
    }
  ]
};

let namazState = {
  mode: 'wudu',
  stepIndex: 0
};

function setNamazGuideMode(mode) {
  namazState.mode = mode;
  namazState.stepIndex = 0;

  document.getElementById('btnNamazWudu').classList.toggle('active', mode === 'wudu');
  document.getElementById('btnNamazPrayer').classList.toggle('active', mode === 'prayer');
  document.getElementById('btnNamazTrainer').classList.toggle('active', mode === 'trainer');

  renderNamazStep();
}

function renderNamazStep() {
  if (namazState.mode === 'trainer') {
    renderNamazTrainer();
    return;
  }

  const steps = namazGuideData[namazState.mode];
  const step = steps[namazState.stepIndex];
  if (!step) return;

  const textElem = document.getElementById('namazStepText');
  const cardElem = document.getElementById('namazStepCard');

  if (textElem) {
    textElem.textContent = `Шаг ${namazState.stepIndex + 1} из ${steps.length}`;
  }

  if (cardElem && step.posture) {
    // Шаги намаза: картинка положения и все молитвы, которые в нём читаются
    const recitations = NAMAZ_RECITATIONS.filter(r => r.posture === step.posture);
    cardElem.innerHTML = `
      <div class="namaz-step-layout">
        <div class="namaz-step-details">
          <div class="namaz-step-title">${step.title}</div>
          <div class="namaz-desc-box">💡 <b>Порядок движений:</b> ${step.desc}</div>
          ${recitations.map(recitationHtml).join('')}
        </div>
        <img class="posture-img" src="assets/namaz/${step.posture}.svg" alt="${step.title}" width="300" height="260">
      </div>
    `;
  } else if (cardElem) {
    cardElem.innerHTML = `
      <div class="namaz-step-layout">
        <div class="namaz-step-details">
          <div class="namaz-step-title">${step.title}</div>
          <div class="namaz-ar-phrase">${step.ar}</div>
          <div class="namaz-translit-phrase">${step.translit}</div>
          <div class="namaz-ru-phrase">«${step.ru}»</div>
          <div class="namaz-desc-box">💡 <b>Порядок движений:</b> ${step.desc}</div>
          <div class="namaz-action-row">
            <button class="btn-modal-action" onclick="playNamazPhraseAudio('${step.ar}')">🔊 Озвучить фразы</button>
          </div>
        </div>
      </div>
    `;
  }
}

// Записи чтеца есть только для сур; остальные молитвы озвучиваются синтезом речи
const RECITATION_AUDIO = {
  fatiha: 'https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/1.mp3',
  ikhlas: 'https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/112.mp3'
};

function recitationHtml(r) {
  const audioLabel = RECITATION_AUDIO[r.id] ? '🔊 Слушать (Мишари Аль-Афаси)' : '🔊 Озвучить';
  return `
    <div class="namaz-recitation">
      <div class="namaz-recitation-head">
        <span class="namaz-recitation-title">${r.title}</span>
        ${r.repeat ? `<span class="namaz-repeat-badge">${r.repeat}</span>` : ''}
      </div>
      <div class="namaz-ar-phrase" dir="rtl" lang="ar">${r.ar}</div>
      <div class="namaz-translit-phrase">${r.tr}</div>
      <div class="namaz-ru-phrase">«${r.ru}»</div>
      ${r.note ? `<div class="namaz-note">${r.note}</div>` : ''}
      <div class="namaz-action-row">
        <button class="btn-modal-action ${RECITATION_AUDIO[r.id] ? 'highlight' : ''}" onclick="playNamazRecitation('${r.id}')">${audioLabel}</button>
      </div>
    </div>`;
}

function playNamazRecitation(id) {
  const r = NAMAZ_RECITATIONS.find(x => x.id === id);
  if (!r) return;
  if (RECITATION_AUDIO[id]) playAuthenticAudio(RECITATION_AUDIO[id]);
  else playNamazPhraseAudio(r.ar);
}

window.playNamazRecitation = playNamazRecitation;

// Отдельный плеер, чтобы не подменять аудио текущего аята в ридере
const namazAudio = new Audio();

function playAuthenticAudio(url) {
  elements.quranAudio.pause();
  if (namazAudio.src !== url) namazAudio.src = url;
  if (namazAudio.paused) namazAudio.play().catch(() => {});
  else namazAudio.pause();
}

window.playAuthenticAudio = playAuthenticAudio;

// ==========================================
// NAMAZ DUA MEMORIZER TRAINER
// ==========================================
// Тренажер использует те же молитвы, что и пошаговый гид
const namazDuasForMemorization = NAMAZ_RECITATIONS.map((r, i) => ({
  key: r.id,
  name: `${i + 1}. ${r.title}`,
  ar: r.ar,
  translit: r.tr,
  ru: r.ru
}));

// Старые ключи выученных молитв из прошлой версии тренажера
const LEGACY_DUA_KEYS = { subhanaka: 'sana', sudjud: 'sujud' };

let trainerState = {
  currentDuaIndex: 0,
  isRevealed: false,
  learnedSet: new Set(readStoredJSON('al_bayan_learned_namaz_duas', []).map(k => LEGACY_DUA_KEYS[k] || k))
};

function renderNamazTrainer() {
  const cardElem = document.getElementById('namazStepCard');
  const textElem = document.getElementById('namazStepText');

  if (textElem) {
    textElem.textContent = `Тренажер молитв (${trainerState.learnedSet.size} из ${namazDuasForMemorization.length} выучено)`;
  }

  const dua = namazDuasForMemorization[trainerState.currentDuaIndex];
  if (!dua || !cardElem) return;

  const isLearned = trainerState.learnedSet.has(dua.key);

  let optionsHTML = namazDuasForMemorization.map((d, idx) => {
    return `<option value="${idx}" ${idx === trainerState.currentDuaIndex ? 'selected' : ''}>${d.name} ${trainerState.learnedSet.has(d.key) ? '✓' : ''}</option>`;
  }).join('');

  cardElem.innerHTML = `
    <div class="trainer-selector-box">
      <label class="trainer-label">Выберите молитву для заучивания:</label>
      <select class="styled-select" onchange="onNamazTrainerDuaChange(this.value)">
        ${optionsHTML}
      </select>
    </div>

    <div class="trainer-card">
      <div class="trainer-header-row">
        <div class="trainer-dua-name">${dua.name}</div>
        <span class="trainer-status-badge ${isLearned ? 'learned' : ''}">${isLearned ? '✓ Выучено наизусть' : '⏳ В процессе'}</span>
      </div>

      <div class="trainer-ar-box">${dua.ar}</div>

      <!-- Interactive Reveal Box to Test Memory -->
      <div class="trainer-reveal-box ${trainerState.isRevealed ? '' : 'hidden'}" onclick="toggleTrainerReveal()">
        <div class="reveal-hint">${trainerState.isRevealed ? '👁️ Нажмите, чтобы скрыть и проверить себя по памяти' : '👁️ Нажмите, чтобы открыть транскрипцию и русский перевод'}</div>
        <div class="reveal-content">
          <div class="namaz-translit-phrase" style="margin-bottom: 6px;">${dua.translit}</div>
          <div class="namaz-ru-phrase">«${dua.ru}»</div>
        </div>
      </div>

      <div class="trainer-tools-row">
        <button class="btn-modal-action" onclick="playNamazRecitation('${dua.key}')">🔊 Прослушать произношение</button>
        <button class="btn-learn-toggle" onclick="toggleNamazDuaLearned('${dua.key}')">
          ${isLearned ? '✓ Выучено (Отменить)' : '⭐ Я выучил эту молитву!'}
        </button>
      </div>
    </div>
  `;
}

function onNamazTrainerDuaChange(indexVal) {
  trainerState.currentDuaIndex = parseInt(indexVal, 10);
  trainerState.isRevealed = false;
  renderNamazTrainer();
}

function toggleTrainerReveal() {
  trainerState.isRevealed = !trainerState.isRevealed;
  renderNamazTrainer();
}

function toggleNamazDuaLearned(duaKey) {
  if (trainerState.learnedSet.has(duaKey)) {
    trainerState.learnedSet.delete(duaKey);
  } else {
    trainerState.learnedSet.add(duaKey);
  }
  localStorage.setItem('al_bayan_learned_namaz_duas', JSON.stringify([...trainerState.learnedSet]));
  renderNamazTrainer();
}

window.onNamazTrainerDuaChange = onNamazTrainerDuaChange;
window.toggleTrainerReveal = toggleTrainerReveal;
window.toggleNamazDuaLearned = toggleNamazDuaLearned;


function nextNamazStep() {
  // В тренажере кнопки листают молитвы
  if (namazState.mode === 'trainer') {
    if (trainerState.currentDuaIndex < namazDuasForMemorization.length - 1) {
      onNamazTrainerDuaChange(trainerState.currentDuaIndex + 1);
    }
    return;
  }
  const steps = namazGuideData[namazState.mode];
  if (namazState.stepIndex < steps.length - 1) {
    namazState.stepIndex++;
    renderNamazStep();
  }
}

function prevNamazStep() {
  if (namazState.mode === 'trainer') {
    if (trainerState.currentDuaIndex > 0) onNamazTrainerDuaChange(trainerState.currentDuaIndex - 1);
    return;
  }
  if (namazState.stepIndex > 0) {
    namazState.stepIndex--;
    renderNamazStep();
  }
}

function playNamazPhraseAudio(text) {
  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = 'ar-SA';
  window.speechSynthesis.speak(msg);
}

// Initial Namaz render
setTimeout(() => renderNamazStep(), 600);

// Export Namaz functions to window
window.setNamazGuideMode = setNamazGuideMode;
window.nextNamazStep = nextNamazStep;
window.prevNamazStep = prevNamazStep;
window.playNamazPhraseAudio = playNamazPhraseAudio;


