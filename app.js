import { quranData, tajweedRulesInfo } from './quranData.js';

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
  streakDays: parseInt(localStorage.getItem('al_bayan_streak') || '7', 10),
  learnedWords: new Set(JSON.parse(localStorage.getItem('al_bayan_learned_words') || '["1-1-1", "1-1-3"]')),
  quizScore: parseInt(localStorage.getItem('al_bayan_score') || '120', 10),
  quizQuestionNum: 1,
  activeTab: 'quiz',
  audioSpeed: 1.0,
  audioLoop: false,
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
  elements.streakCounter.textContent = `${state.streakDays} дней`;
  const totalQuranWordsCount = 77800; // Total in Quran approx
  const totalUniqueBaseWords = 500;
  const learnedCount = state.learnedWords.size;
  const percentage = Math.min(100, Math.round((learnedCount / totalUniqueBaseWords) * 500 + 20)); // Base display
  elements.vocabMastery.textContent = `${percentage}% слов`;
}

// ==========================================
// Render Verse & Reader
// ==========================================
function renderCurrentAyah() {
  const ayah = quranData[state.currentAyahIndex];

  // Update Surah Badge & Audio source
  elements.surahBadgeText.textContent = `${ayah.id} • ${ayah.surahNameRu}`;
  elements.translationText.textContent = ayah.fullTranslation;
  elements.quranAudio.src = ayah.audioUrl;

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
    elements.playIcon.textContent = '▶';
    clearWordHighlights();
    if (state.audioLoop) {
      audio.currentTime = 0;
      audio.play();
      elements.playIcon.textContent = '⏸';
    }
  });
}

function toggleAudioPlay() {
  const audio = elements.quranAudio;
  if (audio.paused) {
    audio.play();
    elements.playIcon.textContent = '⏸';
  } else {
    audio.pause();
    elements.playIcon.textContent = '▶';
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

function toggleAudioLoop() {
  state.audioLoop = !state.audioLoop;
  elements.btnLoop.textContent = state.audioLoop ? '🔁 On' : '🔁 Off';
  elements.btnLoop.style.borderColor = state.audioLoop ? 'var(--gold-accent)' : 'var(--border-subtle)';
}

function seekAudio(e) {
  const track = elements.audioProgressTrack;
  const rect = track.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = clickX / rect.width;
  elements.quranAudio.currentTime = pct * elements.quranAudio.duration;
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

  const stepTitles = [
    'Шаг 1 из 4: Прослушать & Прочитать',
    'Шаг 2 из 4: Разбор арабских слов и корней',
    'Шаг 3 из 4: Квиз для проверки памяти',
    'Шаг 4 из 4: Таддабур и духовный урок'
  ];
  elements.stepCounterText.textContent = stepTitles[stepNum - 1];

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
  
  document.getElementById('tabQuiz').classList.toggle('active', tabName === 'quiz');
  document.getElementById('tabTadabbur').classList.toggle('active', tabName === 'tadabbur');
  document.getElementById('tabDictionary').classList.toggle('active', tabName === 'dictionary');

  elements.contentQuiz.style.display = (tabName === 'quiz') ? 'block' : 'none';
  elements.contentTadabbur.style.display = (tabName === 'tadabbur') ? 'block' : 'none';
  elements.contentDictionary.style.display = (tabName === 'dictionary') ? 'block' : 'none';
}

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
  elements.quizScoreText.textContent = `Очки: ${state.quizScore} 🌟`;
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
    elements.quizFeedback.textContent = '✨ Отлично! Правильный ответ!';
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
    elements.quizFeedback.textContent = `❌ Неверно. Правильный перевод: "${q.correctAnswer}"`;
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
// QIBLA COMPASS CALCULATIONS & LOGIC
// ==========================================
const KAABA_LAT = 21.422487;
const KAABA_LON = 39.826206;

const CITY_COORDS = {
  moscow: { lat: 55.7558, lon: 37.6173, name: "Москва" },
  astana: { lat: 51.1694, lon: 71.4491, name: "Астана" },
  almaty: { lat: 43.2220, lon: 76.8512, name: "Алматы" },
  tashkent: { lat: 41.2995, lon: 69.2401, name: "Ташкент" },
  bishkek: { lat: 42.8746, lon: 74.5698, name: "Бишкек" },
  kazan: { lat: 55.8304, lon: 49.0661, name: "Казань" },
  istanbul: { lat: 41.0082, lon: 28.9784, name: "Стамбул" },
  baku: { lat: 40.4093, lon: 49.8671, name: "Баку" },
  dubai: { lat: 25.2048, lon: 55.2708, name: "Дубай" }
};

function calculateQiblaBearing(lat, lon) {
  const phi1 = (lat * Math.PI) / 180;
  const phi2 = (KAABA_LAT * Math.PI) / 180;
  const deltaLambda = ((KAABA_LON - lon) * Math.PI) / 180;

  const y = Math.sin(deltaLambda);
  const x = Math.cos(phi1) * Math.tan(phi2) - Math.sin(phi1) * Math.cos(deltaLambda);
  
  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function calculateDistanceToKaaba(lat, lon) {
  const R = 6371; // Earth radius in km
  const dLat = ((KAABA_LAT - lat) * Math.PI) / 180;
  const dLon = ((KAABA_LON - lon) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat * Math.PI) / 180) * Math.cos((KAABA_LAT * Math.PI) / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function updateQiblaDisplay(angle, distance) {
  const pointer = document.getElementById('qiblaPointer');
  const angleVal = document.getElementById('qiblaAngleVal');
  const distVal = document.getElementById('qiblaDistVal');

  if (pointer) pointer.style.transform = `rotate(${angle}deg)`;
  if (angleVal) angleVal.textContent = `${angle.toFixed(1)}°`;
  if (distVal) distVal.textContent = `${distance.toLocaleString()} км`;
}

function onQiblaCityChange(cityKey) {
  if (cityKey === 'auto') {
    requestGPSLocation();
    return;
  }
  const city = CITY_COORDS[cityKey];
  if (!city) return;
  const angle = calculateQiblaBearing(city.lat, city.lon);
  const dist = calculateDistanceToKaaba(city.lat, city.lon);
  updateQiblaDisplay(angle, dist);
}

function requestGPSLocation() {
  if (!navigator.geolocation) {
    alert('Геолокация не поддерживается вашим браузером');
    onQiblaCityChange('moscow');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const angle = calculateQiblaBearing(lat, lon);
      const dist = calculateDistanceToKaaba(lat, lon);
      updateQiblaDisplay(angle, dist);
    },
    () => {
      // Default to Moscow if permission denied
      onQiblaCityChange('moscow');
    }
  );
}

// Initial Qibla set
setTimeout(() => onQiblaCityChange('moscow'), 500);

// Window exports
window.onQiblaCityChange = onQiblaCityChange;
window.requestGPSLocation = requestGPSLocation;

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
      audioUrl: "https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3",
      postureSvg: `<svg viewBox="0 0 100 120" class="posture-svg"><circle cx="50" cy="20" r="12" fill="#d4af37"/><path d="M50 32 v40 M30 35 h40 v-15 M30 20 h0 M70 20 h0 M40 72 v40 M60 72 v40" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/><text x="50" y="118" text-anchor="middle" fill="#9ca3af" font-size="9">Такбир (Стоя)</text></svg>`
    },
    {
      title: "Шаг 2: Стояние (Кыйам) и чтение Суры Аль-Фатиха",
      ar: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ... الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
      translit: "Бисмилля́хир-Рахма́нир-Рахи́м ... Аль-Хамду ли-Лля́хи Раббиль-‘Алями́н",
      ru: "С именем Аллаха ... Вся хвала принадлежит Аллаху, Господу миров",
      desc: "Сложите руки на груди или животе (правая поверх левой). Прочтите Суру Аль-Фатиха и затем одну короткую суру.",
      audioUrl: "https://cdn.islamic.network/quran/audio/128/ar.alafasy/2.mp3",
      postureSvg: `<svg viewBox="0 0 100 120" class="posture-svg"><circle cx="50" cy="20" r="12" fill="#d4af37"/><path d="M50 32 v40 M38 45 h24 M40 72 v40 M60 72 v40" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/><text x="50" y="118" text-anchor="middle" fill="#9ca3af" font-size="9">Кыйам (Чтение)</text></svg>`
    },
    {
      title: "Шаг 3: Поясной поклон (Руку')",
      ar: "سُبْحَانَ رَبِّيَ الْعَظِيمِ (۳ مرات)",
      translit: "Субха́на Рабби́йаль-‘Азы́м (3 раза)",
      ru: "Пречист мой Великий Господь!",
      desc: "Наклонитесь под углом 90° с прямой спиной, положив ладони на колени. Смотрите в точку суджуда и произнесите дуа 3 раза.",
      audioUrl: "https://cdn.islamic.network/quran/audio/128/ar.alafasy/1.mp3",
      postureSvg: `<svg viewBox="0 0 100 120" class="posture-svg"><circle cx="25" cy="50" r="12" fill="#d4af37"/><path d="M37 50 h40 v40 M77 90 v20 M60 90 v20 M37 50 l25 25" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/><text x="50" y="118" text-anchor="middle" fill="#9ca3af" font-size="9">Руку' (Поклон)</text></svg>`
    },
    {
      title: "Шаг 4: Выпрямление (И’тидаль)",
      ar: "سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ ، رَبَّنَا وَلَكَ الْحَمْدُ",
      translit: "Сами’алла́ху ли-ман хамидах, Раббана́ ва лякаль-хамд",
      ru: "Услышал Аллах того, кто восхвалил Его. Господь наш, Хвала Тебе!",
      desc: "Выпрямитесь полностью ровно стоя, опустив руки вдоль тела.",
      audioUrl: "https://cdn.islamic.network/quran/audio/128/ar.alafasy/2.mp3",
      postureSvg: `<svg viewBox="0 0 100 120" class="posture-svg"><circle cx="50" cy="20" r="12" fill="#d4af37"/><path d="M50 32 v40 M42 35 v30 M58 35 v30 M40 72 v40 M60 72 v40" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/><text x="50" y="118" text-anchor="middle" fill="#9ca3af" font-size="9">И’тидаль (Выпрямление)</text></svg>`
    },
    {
      title: "Шаг 5: Первый Земной поклон (Суджуд)",
      ar: "سُبْحَانَ رَبِّيَ الْأَعْلَى (۳ مرات)",
      translit: "Субха́на Рабби́йаль-А‘ля́ (3 раза)",
      ru: "Пречист мой Всевышний Господь!",
      desc: "Опуститесь на полу: пола касаются 7 точек (лоб с носом, обе ладони, оба колена и пальцы обеих ног). Произнесите дуа 3 раза.",
      audioUrl: "https://cdn.islamic.network/quran/audio/128/ar.alafasy/3.mp3",
      postureSvg: `<svg viewBox="0 0 100 120" class="posture-svg"><circle cx="20" cy="85" r="10" fill="#d4af37"/><path d="M20 95 h40 l25 -20 M60 95 l25 -20" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/><text x="50" y="118" text-anchor="middle" fill="#9ca3af" font-size="9">Суджуд (Земной поклон)</text></svg>`
    },
    {
      title: "Шаг 6: Сидение между суджудами и 2-й Суджуд",
      ar: "رَبِّ اغْفِرْ لِي ، رَبِّ اغْفِرْ لِي",
      translit: "Раббиг-фир ли́, Раббиг-фир ли́",
      ru: "Господь мой, прости меня, прости меня!",
      desc: "Поднимитесь и сядьте ровно на левую ногу, положив ладони на бедра. Произнесите дуа и совершите второй суджуд.",
      audioUrl: "https://cdn.islamic.network/quran/audio/128/ar.alafasy/4.mp3",
      postureSvg: `<svg viewBox="0 0 100 120" class="posture-svg"><circle cx="40" cy="45" r="11" fill="#d4af37"/><path d="M40 56 v25 h30 M40 81 h30" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/><text x="50" y="118" text-anchor="middle" fill="#9ca3af" font-size="9">Джальса (Сидение)</text></svg>`
    },
    {
      title: "Шаг 7: Второй ракаат и Ташаххуд (Ат-Тахият)",
      ar: "التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ ...",
      translit: "Ат-Тахиййа́ту ли-Лля́хи вас-салява́ту ват-таййиба́т ...",
      ru: "Приветствия, молитвы и все благие дела принадлежат Аллаху ...",
      desc: "Повторите 2-й ракаат. В конце сядьте для чтения Ат-Тахията и Салавата. При произнесении свидетельства поднимите указательный палец правой руки.",
      audioUrl: "https://cdn.islamic.network/quran/audio/128/ar.alafasy/5.mp3",
      postureSvg: `<svg viewBox="0 0 100 120" class="posture-svg"><circle cx="40" cy="45" r="11" fill="#d4af37"/><path d="M40 56 v25 h30 M50 65 l15 -10" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/><text x="50" y="118" text-anchor="middle" fill="#9ca3af" font-size="9">Ташаххуд (Ат-Тахият)</text></svg>`
    },
    {
      title: "Шаг 8: Приветствие (Салям) — Завершение намаза",
      ar: "السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ",
      translit: "Ас-Саля́му ‘алейкум ва рахмату-Лла́х",
      ru: "Мир вам и милость Аллаха!",
      desc: "Поверните голову вправо, глядя на свое плечо, и произнесите Салям. Затем поверните голову влево и повторите. Намаз завершен!",
      audioUrl: "https://cdn.islamic.network/quran/audio/128/ar.alafasy/6.mp3",
      postureSvg: `<svg viewBox="0 0 100 120" class="posture-svg"><circle cx="55" cy="45" r="11" fill="#d4af37"/><path d="M40 56 v25 h30" stroke="#d4af37" stroke-width="4" stroke-linecap="round"/><text x="50" y="118" text-anchor="middle" fill="#9ca3af" font-size="9">Салям (Приветствие)</text></svg>`
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

  if (cardElem) {
    const svgHtml = step.postureSvg ? `<div class="posture-container">${step.postureSvg}</div>` : '';
    const audioBtn = step.audioUrl 
      ? `<button class="btn-modal-action highlight" onclick="playAuthenticAudio('${step.audioUrl}')">🔊 Слушать официальное аудио (Шейх Аль-Афаси)</button>`
      : `<button class="btn-modal-action" onclick="playNamazPhraseAudio('${step.ar}')">🔊 Озвучить фразы</button>`;

    cardElem.innerHTML = `
      <div class="namaz-step-layout">
        <div class="namaz-step-details">
          <div class="namaz-step-title">${step.title}</div>
          <div class="namaz-ar-phrase">${step.ar}</div>
          <div class="namaz-translit-phrase">${step.translit}</div>
          <div class="namaz-ru-phrase">«${step.ru}»</div>
          <div class="namaz-desc-box">💡 <b>Порядок движений:</b> ${step.desc}</div>
          <div class="namaz-action-row">
            ${audioBtn}
          </div>
        </div>
        ${svgHtml}
      </div>
    `;
  }
}

function playAuthenticAudio(url) {
  const audio = elements.quranAudio || new Audio();
  audio.src = url;
  audio.play();
}

window.playAuthenticAudio = playAuthenticAudio;

// ==========================================
// NAMAZ DUA MEMORIZER TRAINER
// ==========================================
const namazDuasForMemorization = [
  {
    key: "subhanaka",
    name: "1. Открывающее дуа «Субханака»",
    ar: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ ، وَتَبَارَكَ اسْمُكَ ، وَتَعَالَىٰ جَدُّكَ ، وَلَا إِلَٰهَ غَيْرُكَ",
    translit: "Субха́нака-Лло́хумма ва би-хамдика, ва таба́рака-смука, ва та‘а́ля́ джаддука, ва ля́ иля́ха гайрук",
    ru: "Пречист Ты, о Аллах, и восхваляем! Благословенно имя Твое, превыше всего величие Твое, и нет божества, кроме Тебя!"
  },
  {
    key: "fatiha",
    name: "2. Сура «Аль-Фатиха» (Обязательная)",
    ar: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ﴿١﴾ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ﴿٢﴾ الرَّحْمَٰنِ الرَّحِيمِ ﴿٣﴾ مَالِكِ يَوْمِ الدِّينِ ﴿٤﴾ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ ﴿٥﴾ اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ ﴿٦﴾ صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ ﴿٧﴾",
    translit: "Бисмилля́хир-Рахма́нир-Рахи́м (1) Аль-Хамду ли-Лля́хи Раббиль-‘Алями́н (2) Ар-Рахма́нир-Рахи́м (3) Ма́лики йаумид-ди́н (4) Иййа́ка на’буду ва иййа́ка наста’и́н (5) Ихдинас-сира́таль-мустаки́м (6) Сира́таллязи́на ан’амта ‘алейхим гайриль-магду́би ‘алейхим ва ляд-далли́н (7)",
    ru: "С именем Аллаха, Милостивого, Милосердного! Вся хвала принадлежит Аллаху, Господу миров..."
  },
  {
    key: "ruku",
    name: "3. Дуа Поясного поклона (Руку')",
    ar: "سُبْحَانَ رَبِّيَ الْعَظِيمِ",
    translit: "Субха́на Рабби́йаль-‘Азы́м (3 раза)",
    ru: "Пречист мой Великий Господь!"
  },
  {
    key: "itidal",
    name: "4. Слова при выпрямлении",
    ar: "سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ ، رَبَّنَا وَلَكَ الْحَمْدُ",
    translit: "Сами’алла́ху ли-ман хамидах, Раббана́ ва лякаль-хамд",
    ru: "Услышал Аллах того, кто восхвалил Его. Господь наш, Хвала Тебе!"
  },
  {
    key: "sudjud",
    name: "5. Дуа Земного поклона (Суджуд)",
    ar: "سُبْحَانَ رَبِّيَ الْأَعْلَى",
    translit: "Субха́на Рабби́йаль-А‘ля́ (3 раза)",
    ru: "Пречист мой Всевышний Господь!"
  },
  {
    key: "tashahhud",
    name: "6. Ат-Тахият (Ташаххуд)",
    ar: "التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ ، السَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ ، السَّلَامُ عَلَيْنَا وَعَلَىٰ عِبَادِ اللَّهِ الصَّالِحِينَ ، أَشْهَدُ أَنْ لَا إِلَٰهَ إِلَّا اللَّهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ",
    translit: "Ат-Тахиййа́ту ли-Лля́хи вас-салява́ту ват-таййиба́т, Ас-Саля́му ‘алейка аййухан-Набиййу ва рахмату-Лла́хи ва барака́тух, Ас-Саля́му ‘алейна́ ва ‘аля́ ‘иба́ди-Лля́хис-салихи́н. Ашхаду алля́ иля́ха илля-Лло́ху ва ашхаду анна Мухаммадан ‘абдуху ва расу́люх",
    ru: "Приветствия, молитвы и все благие дела принадлежат Аллаху. Мир тебе, о Пророк, милость Аллаха и Его благословения! Мир нам и праведным рабам Аллаха. Свидетельствую, что нет божества, кроме Аллаха, и что Мухаммад — Его раб и Посланник."
  },
  {
    key: "salawat",
    name: "7. Салават Пророку ﷺ",
    ar: "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَىٰ إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ",
    translit: "Алла́хумма салли ‘аля́ Мухаммадин ва ‘аля́ а́ли Мухаммад, кама́ салляйта ‘аля́ Ибрахи́ма ва ‘аля́ а́ли Ибрахи́м, иннака Хами́дун Маджи́д",
    ru: "О Аллах, благослови Мухаммада и род Мухаммада, как благословил Ты Ибрахима и род Ибрахима! Поистине, Ты — Достохвальный, Славнознаменитый!"
  }
];

let trainerState = {
  currentDuaIndex: 0,
  isRevealed: false,
  learnedSet: new Set(JSON.parse(localStorage.getItem('al_bayan_learned_namaz_duas') || '[]'))
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
        <button class="btn-modal-action" onclick="playNamazPhraseAudio('${dua.ar}')">🔊 Прослушать произношение</button>
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
  const steps = namazGuideData[namazState.mode];
  if (namazState.stepIndex < steps.length - 1) {
    namazState.stepIndex++;
    renderNamazStep();
  }
}

function prevNamazStep() {
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


