import { SKILLS, COURSES, DIAGNOSTIC_QUESTIONS, DEFAULT_STATE } from './data.js';
import { icon, brandMark } from './icons.js';
import {
  normalizeAnswer,
  isAnswerCorrect,
  scoreDiagnostic,
  getSkillScores,
  createPersonalPlan,
  getRecommendedMessage,
  makeLessonQuestions,
  getSessionSummary,
  getLevel
} from './learning.js';

const STORAGE_KEY = 'sana-learning-state-v1';
const ROUTES = ['home', 'courses', 'tests', 'progress', 'profile', 'course', 'diagnostic', 'session'];
const COURSE_SYMBOLS = {
  arithmetic: '48 : 6 + 8', fractions: '¾ + ¼ = 1', equations: '3x + 4 = 25',
  geometry: 'S = a × b', percent: '20% = 0,2', logic: 'S = v × t'
};
const LESSON_TITLES = {
  arithmetic: ['Порядок действий', 'Выражения со скобками', 'Отрицательные числа', 'Степень числа', 'Смешанная практика'],
  fractions: ['Одинаковые знаменатели', 'Разные знаменатели', 'Сравнение дробей', 'Умножение дробей', 'Смешанная практика'],
  equations: ['Простые уравнения', 'Уравнения в два шага', 'Уравнения со скобками', 'Проверка корня', 'Смешанная практика'],
  geometry: ['Площадь прямоугольника', 'Периметр квадрата', 'Углы треугольника', 'Площадь квадрата', 'Смешанная практика'],
  percent: ['Десять процентов', 'Скидки в магазине', 'Проценты и количество', 'Четверть числа', 'Новая цена'],
  logic: ['Скорость и время', 'Цена и количество', 'Задачи на разницу', 'Расстояние', 'Смешанная практика']
};

const main = document.querySelector('#main-content');
const modalRoot = document.querySelector('#modal-root');
let appState = loadState();
let currentRoute = 'home';
let activeCourseId = COURSES[0].id;
let courseFilter = 'all';
let session = null;
let diagnosticPreview = null;
let deferredInstallPrompt = null;
let toastTimer = null;

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function loadState() {
  const fallback = cloneDefaultState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.version !== fallback.version) return fallback;
    return {
      ...fallback,
      ...saved,
      user: { ...fallback.user, ...(saved.user || {}) },
      diagnostic: { ...fallback.diagnostic, ...(saved.diagnostic || {}) },
      skillLevels: { ...fallback.skillLevels, ...(saved.skillLevels || {}) },
      courseProgress: { ...fallback.courseProgress, ...(saved.courseProgress || {}) },
      testScores: { ...fallback.testScores, ...(saved.testScores || {}) }
    };
  } catch (error) {
    return fallback;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  } catch (error) {
    // Приложение остаётся рабочим, даже если хранилище недоступно.
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function plural(number, one, few, many) {
  const n = Math.abs(number) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function currentDateLabel() {
  return capitalize(new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date()));
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function dailyLessonConfig(skillCount = appState.plan.length) {
  const minutes = Number(appState.user.dailyGoal) || 15;
  const perSkill = ({ 10: 1, 15: 2, 20: 3, 30: 4 })[minutes] || 2;
  return { minutes, perSkill, taskCount: skillCount * perSkill };
}

function progressRing(percent, size = 116, stroke = 9, className = '') {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  return `<svg class="progress-ring ${className}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${safe}%">
    <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke-width="${stroke}" />
    <circle class="ring-value" cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 ${size / 2} ${size / 2})" />
  </svg>`;
}

function skillTile(skillId, size = 'medium') {
  const skill = SKILLS[skillId];
  return `<span class="skill-tile ${skill.color} ${size}">${icon(skill.icon, size === 'large' ? 30 : 22)}</span>`;
}

function progressBar(value, className = '') {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="progress-bar ${className}" aria-label="Пройдено ${safe}%"><span style="width:${safe}%"></span></div>`;
}

function showToast(message, type = 'success') {
  const toast = document.querySelector('#toast');
  clearTimeout(toastTimer);
  toast.innerHTML = `${icon(type === 'success' ? 'circlecheck' : 'info', 19)}<span>${esc(message)}</span>`;
  toast.className = `toast visible ${type}`;
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3400);
}

function go(route) {
  const safeRoute = ROUTES.includes(route) ? route : 'home';
  currentRoute = safeRoute;
  if (location.hash !== `#${safeRoute}`) {
    location.hash = safeRoute;
  } else {
    render();
  }
}

function closeModal() {
  modalRoot.innerHTML = '';
  document.body.classList.remove('modal-open');
}

function showModal(content, className = '') {
  modalRoot.innerHTML = `<div class="modal-backdrop">
    <button class="modal-scrim" type="button" data-action="close-modal" aria-label="Закрыть окно"></button>
    <section class="modal-panel ${className}" role="dialog" aria-modal="true">${content}</section>
  </div>`;
  document.body.classList.add('modal-open');
  const focusable = modalRoot.querySelector('button:not(.modal-scrim), input, select');
  if (focusable) setTimeout(() => focusable.focus(), 0);
}

function confirmDialog({ title, text, confirmText, action, danger = false }) {
  showModal(`<div class="confirm-modal">
    <span class="confirm-icon ${danger ? 'danger' : ''}">${icon(danger ? 'refresh' : 'info', 28)}</span>
    <h2>${esc(title)}</h2><p>${esc(text)}</p>
    <div class="modal-actions"><button class="button secondary" type="button" data-action="close-modal">Отмена</button>
    <button class="button ${danger ? 'danger-button' : 'primary'}" type="button" data-action="${action}">${esc(confirmText)}</button></div>
  </div>`, 'small-modal');
}

function renderChrome() {
  const sectionRoute = currentRoute === 'course' ? 'courses' : currentRoute;
  document.querySelectorAll('[data-route]').forEach((element) => {
    element.classList.toggle('active', element.dataset.route === sectionRoute);
  });
  const titles = {
    home: 'Мой день', courses: 'Мои курсы', course: 'Страница курса', tests: 'Проверка знаний',
    progress: 'Мои достижения', profile: 'Настройки профиля', diagnostic: 'Диагностика', session: 'Занятие'
  };
  document.querySelector('#context-title').textContent = titles[currentRoute] || 'Sana';
  document.querySelector('#header-name').textContent = appState.user.name;
  document.querySelector('#header-grade').textContent = `${appState.user.grade} класс`;
  document.querySelector('#header-avatar').textContent = appState.user.name.trim().charAt(0).toUpperCase() || 'С';
  document.querySelector('#header-streak').innerHTML = `${icon('flame', 18)}<strong>${appState.streak}</strong><span>${plural(appState.streak, 'день', 'дня', 'дней')}</span>`;
  document.querySelector('#notification-dot').classList.toggle('hidden', appState.notificationsRead || !appState.user.notifications);
  const level = getLevel(appState.xp);
  document.querySelector('#level-card').innerHTML = `<div class="level-card-top"><span class="level-star">${icon('star', 16)}</span><strong>Уровень ${level.level}</strong><span>${appState.xp.toLocaleString('ru-RU')} XP</span></div>
    ${progressBar(level.progress)}<small>Ещё ${level.needed - level.current} XP до нового уровня</small>`;
  document.body.classList.toggle('focus-mode', currentRoute === 'session' && Boolean(session));
}

function render() {
  if (currentRoute === 'session' && !session) currentRoute = 'home';
  renderChrome();
  const views = {
    home: renderHome,
    courses: renderCourses,
    course: renderCourseDetail,
    tests: renderTests,
    progress: renderProgress,
    profile: renderProfile,
    diagnostic: renderDiagnostic,
    session: renderSession
  };
  main.innerHTML = (views[currentRoute] || renderHome)();
  main.classList.toggle('session-main', currentRoute === 'session');
}

function renderHome() {
  const firstName = esc(appState.user.name.split(' ')[0]);
  const planSkills = appState.plan.filter((skill) => SKILLS[skill]);
  const daily = dailyLessonConfig(planSkills.length);
  const taskCount = daily.taskCount;
  const activeDays = appState.weekly.filter((value) => value > 0).length;
  const weekPercent = Math.min(100, Math.round((activeDays / 5) * 100));
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const todayIndex = (new Date().getDay() + 6) % 7;
  const miniCourses = planSkills.slice(0, 2).map((skill) => COURSES.find((course) => course.skill === skill)).filter(Boolean);

  return `<div class="page dashboard-page">
    <section class="welcome-row">
      <div><span class="date-label">${currentDateLabel()}</span><h1>${greeting()}, ${firstName}!</h1><p>Небольшой шаг сегодня — уверенные знания завтра.</p></div>
      <button class="button quiet desktop-diagnostic" type="button" data-route="diagnostic">${icon('brain', 18)} Обновить программу</button>
    </section>

    <div class="dashboard-grid">
      <div class="dashboard-main-column">
        <section class="daily-hero">
          <div class="hero-copy">
            <div class="hero-label"><span class="hero-label-dot"></span>ЗАНЯТИЕ НА СЕГОДНЯ</div>
            <h2>${appState.dailyCompleted ? 'Отличная работа! План выполнен' : 'Твой персональный план готов'}</h2>
            <p>${appState.dailyCompleted ? 'Можно отдохнуть или закрепить материал ещё одной короткой попыткой.' : 'Собрали темы по результатам диагностики — от простого к сложному.'}</p>
            <div class="plan-tags">${planSkills.map((skill) => `<span>${icon(SKILLS[skill].icon, 15)}${SKILLS[skill].short}</span>`).join('')}</div>
            <div class="hero-bottom">
              <button class="button lime hero-button" type="button" data-action="start-lesson">${icon(appState.dailyCompleted ? 'refresh' : 'play', 18)}${appState.dailyCompleted ? 'Пройти ещё раз' : 'Начать занятие'}${icon('right', 18)}</button>
              <span class="hero-meta">${icon('clock', 16)} ${daily.minutes} мин <span></span> ${taskCount} ${plural(taskCount, 'задание', 'задания', 'заданий')}</span>
            </div>
          </div>
          <div class="hero-visual" aria-hidden="true">
            <span class="floating-symbol symbol-one">π</span><span class="floating-symbol symbol-two">%</span>
            <div class="math-board"><span class="board-caption">СЕГОДНЯ Я СМОГУ</span><strong>x + 7 = 15</strong><span class="board-answer">x = 8 <i>${icon('check', 18)}</i></span><div class="board-lines"><b></b><b></b><b></b></div></div>
            <div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div>
          </div>
        </section>

        <section class="home-courses-section">
          <div class="section-heading"><div><h2>Продолжить обучение</h2><p>С того места, где ты остановился</p></div><button class="text-link" type="button" data-route="courses">Все курсы ${icon('right', 16)}</button></div>
          <div class="mini-course-grid">${miniCourses.map(renderMiniCourse).join('')}</div>
        </section>

        <section class="diagnostic-strip">
          <div class="diagnostic-strip-icon">${icon('brain', 28)}</div>
          <div><span class="eyebrow">УМНАЯ ПРОГРАММА</span><h3>Узнай, какие темы нужно подтянуть</h3><p>8 вопросов — и мы перестроим твой план обучения.</p></div>
          <button class="button secondary" type="button" data-action="start-diagnostic">Пройти диагностику ${icon('right', 17)}</button>
        </section>
      </div>

      <aside class="dashboard-aside">
        <section class="card week-card">
          <div class="card-heading"><div><span class="eyebrow">ТВОЙ РИТМ</span><h3>Цель на неделю</h3></div><span class="subtle-icon">${icon('calendar', 20)}</span></div>
          <div class="week-summary"><div class="ring-wrap week-ring">${progressRing(weekPercent, 108, 9)}<div class="ring-text"><strong>${activeDays}<span>/5</span></strong><small>дней</small></div></div><div class="week-copy"><strong>${activeDays >= 5 ? 'Цель выполнена!' : `Ещё ${5 - activeDays} ${plural(5 - activeDays, 'день', 'дня', 'дней')}`}</strong><p>${activeDays >= 5 ? 'Так держать!' : 'до сильной недели'}</p></div></div>
          <div class="week-days">${weekDays.map((day, index) => `<div class="week-day ${index === todayIndex ? 'today' : ''}"><span class="day-check ${appState.weekly[index] > 0 ? 'done' : ''}">${appState.weekly[index] > 0 ? icon('check', 14) : ''}</span><small>${day}</small></div>`).join('')}</div>
          <div class="week-note">${icon('target', 17)}<span>Занимайся хотя бы ${appState.user.dailyGoal} минут в день</span></div>
        </section>

        <section class="card streak-card">
          <div class="streak-flame">${icon('flame', 30)}</div>
          <div class="streak-copy"><span>СЕРИЯ ЗАНЯТИЙ</span><strong>${appState.streak} ${plural(appState.streak, 'день', 'дня', 'дней')} подряд</strong><p>Личный рекорд — 18 дней</p></div>
          <span class="streak-badge">${icon('award', 18)}</span>
        </section>

        <section class="card insight-card">
          <span class="insight-icon">${icon('bulb', 22)}</span><div><h3>Маленький совет</h3><p>Сначала попробуй сам, а подсказку открывай только после раздумья. Так знания останутся надолго.</p></div>
        </section>
      </aside>
    </div>
  </div>`;
}

function renderMiniCourse(course) {
  const progress = appState.courseProgress[course.id] || 0;
  return `<button class="mini-course" type="button" data-action="open-course" data-course="${course.id}">
    <span class="mini-course-top">${skillTile(course.skill)}<span class="mini-course-arrow">${icon('right', 18)}</span></span>
    <span class="mini-course-skill">${SKILLS[course.skill].short} · ${course.grade}</span>
    <strong>${course.title}</strong>
    <span class="mini-course-progress">${progressBar(progress)}<small>${progress}%</small></span>
  </button>`;
}

function renderCourses() {
  const filters = [
    { id: 'all', label: 'Все курсы' }, { id: 'arithmetic', label: 'Числа' },
    { id: 'fractions', label: 'Дроби' }, { id: 'equations', label: 'Алгебра' },
    { id: 'geometry', label: 'Геометрия' }, { id: 'percent', label: 'Проценты' }, { id: 'logic', label: 'Задачи' }
  ];
  const courses = courseFilter === 'all' ? COURSES : COURSES.filter((course) => course.skill === courseFilter);
  return `<div class="page courses-page">
    <section class="page-title-row"><div><span class="date-label">ТВОЯ БИБЛИОТЕКА</span><h1>Мои курсы</h1><p>Короткие уроки, практика и объяснение каждого решения.</p></div><div class="title-stat"><strong>${COURSES.length}</strong><span>курсов по твоей программе</span></div></section>
    <div class="filter-tabs" role="tablist" aria-label="Фильтр курсов">${filters.map((filter) => `<button type="button" role="tab" aria-selected="${courseFilter === filter.id}" class="filter-tab ${courseFilter === filter.id ? 'active' : ''}" data-action="filter-courses" data-filter="${filter.id}">${filter.label}</button>`).join('')}</div>
    <div class="course-grid">${courses.map(renderCourseCard).join('')}</div>
    ${courses.length === 0 ? '<div class="empty-state">В этой категории пока нет курсов.</div>' : ''}
  </div>`;
}

function renderCourseCard(course) {
  const skill = SKILLS[course.skill];
  const progress = appState.courseProgress[course.id] || 0;
  return `<article class="course-card">
    <button class="course-cover ${skill.color}" type="button" data-action="open-course" data-course="${course.id}" aria-label="Открыть курс ${esc(course.title)}">
      <span class="cover-grade">${course.grade}</span><span class="cover-icon">${icon(skill.icon, 42)}</span><span class="cover-formula">${COURSE_SYMBOLS[course.skill]}</span><span class="cover-shape cover-shape-one"></span><span class="cover-shape cover-shape-two"></span>
    </button>
    <div class="course-card-body"><div class="course-meta"><span>${skill.short}</span><span>${icon('clock', 14)} ${course.minutes} мин</span></div><h2>${course.title}</h2><p>${course.subtitle}</p>
      <div class="course-progress-label"><span>${progress ? `Пройдено ${progress}%` : 'Ещё не начат'}</span><span>${course.lessons} уроков</span></div>${progressBar(progress)}
      <button class="course-card-link" type="button" data-action="open-course" data-course="${course.id}">${progress ? 'Продолжить' : 'Начать курс'}<span>${icon('right', 17)}</span></button>
    </div>
  </article>`;
}

function renderCourseDetail() {
  const course = COURSES.find((item) => item.id === activeCourseId) || COURSES[0];
  const skill = SKILLS[course.skill];
  const progress = appState.courseProgress[course.id] || 0;
  const completedCount = Math.floor((progress / 100) * 5);
  return `<div class="page course-detail-page">
    <button class="back-link" type="button" data-route="courses">${icon('left', 17)} Все курсы</button>
    <section class="course-detail-hero ${skill.color}">
      <div class="course-detail-copy"><span class="course-detail-label">${skill.short} · ${course.grade}</span><h1>${course.title}</h1><p>${course.description}</p><div class="course-detail-meta"><span>${icon('book', 17)} ${course.lessons} уроков</span><span>${icon('clock', 17)} ${course.minutes} минут в день</span><span>${icon('trend', 17)} ${course.level}</span></div><button class="button primary" type="button" data-action="start-course-lesson" data-skill="${course.skill}" data-index="${Math.min(completedCount, 4)}">${icon('play', 17)} ${progress ? 'Продолжить курс' : 'Начать первый урок'}</button></div>
      <div class="course-detail-art" aria-hidden="true"><span>${icon(skill.icon, 64)}</span><strong>${COURSE_SYMBOLS[course.skill]}</strong><i></i><i></i></div>
    </section>
    <div class="course-detail-grid">
      <section><div class="section-heading"><div><h2>Содержание курса</h2><p>5 блоков практики с мгновенной проверкой</p></div><span class="soft-badge">${progress}% пройдено</span></div>
        <div class="lesson-list">${LESSON_TITLES[course.skill].map((title, index) => `<button class="lesson-row" type="button" data-action="start-course-lesson" data-skill="${course.skill}" data-index="${index}"><span class="lesson-number ${index < completedCount ? 'complete' : ''}">${index < completedCount ? icon('check', 18) : String(index + 1).padStart(2, '0')}</span><span class="lesson-row-copy"><strong>${title}</strong><small>5 заданий · около ${course.minutes} минут</small></span><span class="lesson-status">${index < completedCount ? 'Повторить' : 'Начать'} ${icon('right', 16)}</span></button>`).join('')}</div>
      </section>
      <aside class="card outcomes-card"><span class="eyebrow">ЧЕМУ ТЫ НАУЧИШЬСЯ</span><h3>После этого курса</h3><ul>${course.outcomes.map((outcome) => `<li>${icon('circlecheck', 19)}<span>${outcome}</span></li>`).join('')}</ul><div class="outcome-note">${icon('sparkle', 19)} Задания подстраиваются под твой уровень</div></aside>
    </div>
  </div>`;
}

function renderTests() {
  const diagnosticScore = appState.diagnostic.completed ? appState.diagnostic.score : null;
  return `<div class="page tests-page">
    <section class="page-title-row"><div><span class="date-label">ПРОВЕРЬ СЕБЯ</span><h1>Тесты и диагностика</h1><p>Не оценка, а способ понять, что уже получается, а что стоит повторить.</p></div></section>
    <section class="diagnostic-hero-card">
      <div class="diagnostic-hero-copy"><span class="diagnostic-label">${icon('sparkle', 16)} ПЕРСОНАЛЬНАЯ ПРОГРАММА</span><h2>Диагностика знаний</h2><p>Определи сильные стороны и пробелы. После теста Sana соберёт ежедневный план именно под тебя.</p><div class="diagnostic-facts"><span>${icon('clipboard', 17)} 8 вопросов</span><span>${icon('clock', 17)} 7–10 минут</span><span>${icon('brain', 17)} 6 тем</span></div><button class="button lime" type="button" data-action="start-diagnostic">${diagnosticScore === null ? 'Начать диагностику' : 'Пройти ещё раз'} ${icon('right', 18)}</button></div>
      <div class="diagnostic-score-visual">${diagnosticScore === null ? `<div class="diagnostic-brain">${icon('brain', 62)}</div><span>Точный план<br>начинается здесь</span>` : `<div class="ring-wrap">${progressRing(diagnosticScore, 150, 11)}<div class="ring-text"><strong>${diagnosticScore}%</strong><small>последний результат</small></div></div>`}</div>
    </section>
    <section class="topic-tests-section"><div class="section-heading"><div><h2>Тесты по темам</h2><p>По 5 заданий с объяснением каждого ответа</p></div></div>
      <div class="test-grid">${Object.values(SKILLS).map((skill) => {
        const score = appState.testScores[skill.id];
        return `<article class="test-card"><div class="test-card-top">${skillTile(skill.id)}${score === null ? '<span class="soft-badge">Не пройден</span>' : `<span class="score-badge ${score >= 80 ? 'high' : ''}">${icon('award', 14)} Лучший: ${score}%</span>`}</div><h3>${skill.title}</h3><p>${skill.description}</p><div class="test-card-footer"><span>${icon('clock', 15)} 5–7 минут</span><button class="round-arrow" type="button" data-action="start-test" data-skill="${skill.id}" aria-label="Начать тест ${skill.title}">${icon('right', 19)}</button></div></article>`;
      }).join('')}</div>
    </section>
  </div>`;
}

function renderProgress() {
  const accuracy = appState.totalSolved ? Math.round((appState.totalCorrect / appState.totalSolved) * 100) : 0;
  const maxWeekly = Math.max(8, ...appState.weekly);
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const todayIndex = (new Date().getDay() + 6) % 7;
  const level = getLevel(appState.xp);
  return `<div class="page progress-page">
    <section class="page-title-row"><div><span class="date-label">ШАГ ЗА ШАГОМ</span><h1>Твой прогресс</h1><p>Каждое занятие делает сложную математику немного понятнее.</p></div><div class="level-pill">${icon('star', 18)} Уровень ${level.level}<span>${appState.xp.toLocaleString('ru-RU')} XP</span></div></section>
    <div class="stats-grid">
      <article class="stat-card"><span class="stat-card-icon mint">${icon('flame', 23)}</span><div><strong>${appState.streak}</strong><span>дней подряд</span></div><small>Рекорд: 18 дней</small></article>
      <article class="stat-card"><span class="stat-card-icon lavender">${icon('target', 23)}</span><div><strong>${accuracy}%</strong><span>точность ответов</span></div><small>${appState.totalCorrect} верных ответов</small></article>
      <article class="stat-card"><span class="stat-card-icon blue">${icon('clipboard', 23)}</span><div><strong>${appState.totalSolved}</strong><span>заданий решено</span></div><small>+${appState.dailySolved} сегодня</small></article>
      <article class="stat-card"><span class="stat-card-icon peach">${icon('clock', 23)}</span><div><strong>${Math.floor(appState.totalMinutes / 60)} ч ${appState.totalMinutes % 60} м</strong><span>время обучения</span></div><small>В своём темпе</small></article>
    </div>
    <div class="progress-main-grid">
      <section class="card activity-chart-card"><div class="card-heading"><div><span class="eyebrow">АКТИВНОСТЬ</span><h2>Задания на этой неделе</h2></div><span class="soft-badge">${appState.weekly.reduce((a, b) => a + b, 0)} заданий</span></div>
        <div class="bar-chart">${appState.weekly.map((value, index) => `<div class="bar-column ${index === todayIndex ? 'today' : ''}"><span class="bar-value">${value || ''}</span><div class="bar-track"><div class="bar-fill" style="height:${Math.max(value ? 8 : 2, (value / maxWeekly) * 100)}%"></div></div><small>${weekDays[index]}</small></div>`).join('')}</div>
      </section>
      <section class="card skill-progress-card"><div class="card-heading"><div><span class="eyebrow">НАВЫКИ</span><h2>Уровень по темам</h2></div></div><div class="skill-progress-list">${Object.values(SKILLS).map((skill) => `<div class="skill-progress-row">${skillTile(skill.id, 'small')}<div><span><strong>${skill.short}</strong><small>${appState.skillLevels[skill.id]}%</small></span>${progressBar(appState.skillLevels[skill.id])}</div></div>`).join('')}</div></section>
    </div>
    <div class="progress-bottom-grid">
      <section class="card calendar-card"><div class="card-heading"><div><span class="eyebrow">РЕГУЛЯРНОСТЬ</span><h2>Последние 4 недели</h2></div><span class="subtle-icon">${icon('calendar', 20)}</span></div><div class="activity-calendar">${appState.activitySeed.map((value, index) => `<span class="activity-cell level-${value}" title="${value ? `${value * 4} заданий` : 'День отдыха'}"></span>`).join('')}</div><div class="calendar-legend"><span>Меньше</span><i class="level-0"></i><i class="level-1"></i><i class="level-2"></i><span>Больше</span></div></section>
      <section class="card achievements-card"><div class="card-heading"><div><span class="eyebrow">ДОСТИЖЕНИЯ</span><h2>Твои награды</h2></div></div><div class="achievement-list"><div class="achievement"><span class="achievement-icon gold">${icon('flame', 23)}</span><div><strong>Огненная серия</strong><small>10 дней занятий подряд</small></div>${icon('circlecheck', 19)}</div><div class="achievement"><span class="achievement-icon violet">${icon('target', 23)}</span><div><strong>Точный расчёт</strong><small>100 верных ответов</small></div>${icon('circlecheck', 19)}</div><div class="achievement locked"><span class="achievement-icon">${icon('trophy', 23)}</span><div><strong>Мастер дробей</strong><small>Достичь 90% в теме «Дроби»</small></div>${icon('lock', 18)}</div></div></section>
    </div>
  </div>`;
}

function renderProfile() {
  const level = getLevel(appState.xp);
  return `<div class="page profile-page">
    <section class="page-title-row"><div><span class="date-label">ТВОЙ ПРОФИЛЬ</span><h1>Настройки</h1><p>Настрой обучение под свой распорядок и темп.</p></div></section>
    <div class="profile-grid">
      <section class="card profile-form-card"><div class="profile-summary"><span class="profile-avatar-large">${esc(appState.user.name.charAt(0).toUpperCase())}</span><div><h2>${esc(appState.user.name)}</h2><p>${appState.user.grade} класс · Уровень ${level.level}</p></div><span class="profile-xp">${icon('star', 16)} ${appState.xp.toLocaleString('ru-RU')} XP</span></div>
        <form id="profile-form" class="profile-form"><div class="form-row"><label><span>Имя ученика</span><input type="text" name="name" value="${esc(appState.user.name)}" maxlength="24" required autocomplete="name" /></label><label><span>Класс</span><select name="grade">${[5, 6, 7, 8, 9, 10, 11].map((grade) => `<option value="${grade}" ${String(grade) === String(appState.user.grade) ? 'selected' : ''}>${grade} класс</option>`).join('')}</select></label></div>
          <label><span>Ежедневная цель</span><select name="dailyGoal">${[10, 15, 20, 30].map((minutes) => `<option value="${minutes}" ${Number(minutes) === Number(appState.user.dailyGoal) ? 'selected' : ''}>${minutes} минут в день</option>`).join('')}</select><small class="field-help">Главное — регулярность. Выбирай посильную цель.</small></label>
          <label class="toggle-setting"><span><strong>Уведомления в приложении</strong><small>Новости программы, серии и достижения в колокольчике</small></span><input type="checkbox" name="notifications" ${appState.user.notifications ? 'checked' : ''}/><i></i></label>
          <button class="button primary" type="submit">${icon('check', 18)} Сохранить изменения</button>
        </form>
      </section>
      <aside class="profile-side">
        <section class="card app-install-panel"><span class="app-panel-logo">${brandMark(48)}</span><h3>Sana всегда под рукой</h3><p>Установи приложение на телефон или компьютер. Прогресс сохранится на этом устройстве.</p><button class="button secondary wide" type="button" data-action="install-app">${icon('download', 18)} Установить приложение</button></section>
        <section class="card data-panel"><span class="subtle-icon">${icon('shield', 22)}</span><div><h3>Твои данные</h3><p>Ответы и прогресс хранятся только на этом устройстве. Регистрация и куратор не нужны.</p></div><button class="text-link muted-link" type="button" data-action="reset-data">${icon('refresh', 16)} Сбросить демо-прогресс</button></section>
      </aside>
    </div>
  </div>`;
}

function renderDiagnostic() {
  if (diagnosticPreview) return renderDiagnosticResult();
  return `<div class="page diagnostic-page">
    <button class="back-link" type="button" data-route="tests">${icon('left', 17)} Тесты и диагностика</button>
    <section class="diagnostic-intro">
      <div class="diagnostic-intro-copy"><span class="diagnostic-label dark">${icon('brain', 17)} УМНАЯ ДИАГНОСТИКА</span><h1>Найдём точки роста,<br>а не просто поставим оценку</h1><p>Ответь на 8 вопросов из разных тем. Мы поймём, что у тебя получается хорошо, и составим программу ежедневных занятий.</p>
        <div class="diagnostic-steps"><div><span>1</span><p><strong>Пройди короткий тест</strong><small>Без подсказок и оценок — просто попробуй</small></p></div><div><span>2</span><p><strong>Получи карту знаний</strong><small>Увидишь сильные темы и пробелы</small></p></div><div><span>3</span><p><strong>Начни свой план</strong><small>Каждый день — новый небольшой шаг</small></p></div></div>
        <button class="button primary large" type="button" data-action="start-diagnostic">Начать диагностику ${icon('right', 19)}</button><span class="diagnostic-time">${icon('clock', 15)} Примерно 7–10 минут</span>
      </div>
      <div class="diagnostic-intro-art" aria-hidden="true"><div class="art-ring ring-a"></div><div class="art-ring ring-b"></div><div class="art-center">${icon('brain', 70)}<span>Твоя карта<br>знаний</span></div><span class="art-skill art-skill-a">${icon('pie', 20)} Дроби</span><span class="art-skill art-skill-b">${icon('variable', 20)} Алгебра</span><span class="art-skill art-skill-c">${icon('shapes', 20)} Геометрия</span><span class="art-spark">✦</span></div>
    </section>
    ${appState.diagnostic.completed ? `<section class="previous-diagnostic"><span>${icon('circlecheck', 22)}</span><div><strong>Последняя диагностика: ${appState.diagnostic.score}%</strong><p>Программа уже построена. Новая попытка поможет обновить её по текущим знаниям.</p></div><button class="text-link" type="button" data-route="home">К моему плану ${icon('right', 16)}</button></section>` : ''}
  </div>`;
}

function renderDiagnosticResult() {
  const result = diagnosticPreview;
  const plan = createPersonalPlan(result.skills);
  const daily = dailyLessonConfig(plan.length);
  return `<div class="page diagnostic-result-page">
    <section class="result-celebration"><span class="result-check">${icon('check', 30)}</span><span class="eyebrow">ДИАГНОСТИКА ЗАВЕРШЕНА</span><h1>Карта знаний готова!</h1><p>${getRecommendedMessage(result.score)}</p></section>
    <div class="diagnostic-result-grid">
      <section class="card knowledge-map-card"><div class="knowledge-score"><div class="ring-wrap">${progressRing(result.score, 148, 11)}<div class="ring-text"><strong>${result.score}%</strong><small>${result.correct} из ${result.total} верно</small></div></div><div><span class="eyebrow">ОБЩИЙ РЕЗУЛЬТАТ</span><h2>Ты уже многому научился</h2><p>Ошибки показывают не слабость, а следующую тему для роста.</p></div></div><div class="diagnostic-skills">${Object.values(SKILLS).map((skill) => `<div class="diagnostic-skill-row"><span>${skill.short}</span>${progressBar(result.skills[skill.id] ?? 0)}<strong>${result.skills[skill.id] ?? 0}%</strong></div>`).join('')}</div></section>
      <section class="card generated-plan-card"><span class="plan-sparkle">${icon('sparkle', 24)}</span><span class="eyebrow">ТВОЯ ПРОГРАММА</span><h2>Начнём с этих трёх тем</h2><p>Каждый день — короткое занятие с практикой и объяснениями.</p><div class="generated-plan-list">${plan.map((skillId, index) => {
        const score = result.skills[skillId] ?? 0;
        return `<div class="generated-plan-item"><span class="plan-order">${index + 1}</span>${skillTile(skillId, 'small')}<div><strong>${SKILLS[skillId].title}</strong><small>${score < 50 ? 'Разберём базу и закрепим на практике' : score < 80 ? 'Укрепим навык и добавим сложность' : 'Поддержим результат новыми задачами'}</small></div></div>`;
      }).join('')}</div><div class="plan-daily-note">${icon('calendar', 18)} ${daily.minutes} минут · ${daily.taskCount} ${plural(daily.taskCount, 'задание', 'задания', 'заданий')} каждый день</div><button class="button primary wide" type="button" data-action="apply-plan">Применить мою программу ${icon('right', 18)}</button></section>
    </div>
  </div>`;
}

function renderSession() {
  if (!session) return '';
  const answeredCount = Object.keys(session.answers).length;
  const progress = session.finished ? 100 : Math.round((session.index / session.questions.length) * 100);
  return `<div class="focus-shell ${session.finished ? 'finished' : ''}">
    <header class="session-header"><a class="brand session-brand" href="#home" data-action="session-exit"><span class="brand-mark">${brandMark(36)}</span><span class="brand-copy"><strong>sana</strong><small>${esc(session.title)}</small></span></a>
      <div class="session-header-progress"><span>${session.finished ? 'Завершено' : `${session.index + 1} из ${session.questions.length}`}</span><small>${session.kind === 'diagnostic' ? 'Диагностика' : 'Отвечай в своём темпе'}</small></div>
      <button class="button quiet session-exit-button" type="button" data-action="session-exit">${icon('x', 19)}<span>Выйти</span></button>
    </header>
    <div class="session-top-progress"><span style="width:${progress}%"></span></div>
    <div class="session-content">${session.finished ? renderSessionSummary() : renderQuestion()}</div>
    <span class="sr-only">${answeredCount} ответов сохранено</span>
  </div>`;
}

function renderQuestion() {
  const question = session.questions[session.index];
  const skill = SKILLS[question.skill];
  const isDiagnostic = session.kind === 'diagnostic';
  const selected = session.selected;
  const isLast = session.index === session.questions.length - 1;
  const correct = session.checked ? isAnswerCorrect(question, selected) : false;
  const answerArea = question.type === 'input'
    ? `<form id="answer-input-form" class="numeric-answer"><label for="answer-input">Твой ответ</label><div class="input-answer-wrap"><input id="answer-input" name="answer" type="text" inputmode="text" autocomplete="off" placeholder="Впиши число или дробь" value="${esc(selected)}" ${session.checked ? 'disabled' : ''}/><span>${icon('edit', 20)}</span></div><button class="sr-only" type="submit">Проверить</button></form>`
    : `<div class="answer-options">${question.options.map((option, index) => {
      const isSelected = normalizeAnswer(selected) === normalizeAnswer(option);
      const isExpected = isAnswerCorrect(question, option);
      const classes = ['answer-option'];
      if (isSelected) classes.push('selected');
      if (session.checked && isExpected) classes.push('correct');
      if (session.checked && isSelected && !isExpected) classes.push('wrong');
      return `<button type="button" class="${classes.join(' ')}" data-action="select-option" data-value="${esc(option)}" ${session.checked ? 'disabled' : ''} aria-pressed="${isSelected}"><span class="option-letter">${String.fromCharCode(65 + index)}</span><span class="option-value">${esc(option)}</span><span class="option-state">${session.checked && isExpected ? icon('check', 19) : session.checked && isSelected ? icon('x', 19) : ''}</span></button>`;
    }).join('')}</div>`;

  return `<div class="question-layout">
    <section class="question-card">
      <div class="question-skill"><span>${skillTile(question.skill, 'small')}${skill.title}</span><span>Вопрос ${session.index + 1}</span></div>
      <h1>${esc(question.prompt)}</h1>
      <p class="question-instruction">${question.type === 'input' ? 'Запиши ответ без пояснений' : 'Выбери один правильный ответ'}</p>
      ${answerArea}
      ${session.checked ? `<div class="answer-feedback ${correct ? 'correct' : 'wrong'}"><span class="feedback-icon">${icon(correct ? 'check' : 'refresh', 22)}</span><div><strong>${correct ? 'Верно! Отличная работа' : `Правильный ответ: ${esc(question.answer)}`}</strong><p>${esc(question.explanation)}</p></div></div>` : ''}
      <div class="question-actions"><span class="keyboard-hint">${!session.checked && question.type !== 'input' ? 'Можно выбрать ответ клавишами 1–4' : ''}</span>${session.checked ? `<button class="button primary" type="button" data-action="next-question">${isLast ? 'Посмотреть результат' : 'Следующий вопрос'} ${icon('right', 18)}</button>` : `<button class="button primary" id="answer-check" type="button" data-action="check-answer" ${normalizeAnswer(selected) ? '' : 'disabled'}>${isDiagnostic ? (isLast ? 'Завершить диагностику' : 'Далее') : 'Проверить ответ'} ${icon('right', 18)}</button>`}</div>
    </section>
    <aside class="question-aside">
      ${isDiagnostic ? `<div class="session-tip-card"><span>${icon('brain', 24)}</span><h3>Это не экзамен</h3><p>Не переживай, если не знаешь ответ. Диагностика нужна, чтобы не дать тебе слишком лёгкие или сложные задания.</p></div>` : `<div class="session-tip-card hint-card ${session.hintVisible ? 'opened' : ''}"><span>${icon('bulb', 24)}</span><h3>Нужна подсказка?</h3>${session.hintVisible ? `<p>${esc(question.hint)}</p>` : '<p>Подумай ещё немного или открой небольшую подсказку.</p><button class="text-link" type="button" data-action="show-hint">Показать подсказку</button>'}</div>`}
      <div class="session-pace-note">${icon('shield', 18)}<span>Нет таймера и оценок.<br>Главное — понять решение.</span></div>
    </aside>
  </div>`;
}

function renderSessionSummary() {
  const summary = session.summary;
  const wrongSkills = [...new Set(session.questions.filter((question) => !isAnswerCorrect(question, session.answers[question.id])).map((question) => question.skill))];
  return `<section class="session-summary">
    <div class="summary-decoration" aria-hidden="true"><span>✦</span><span>✦</span><span>✦</span></div>
    <span class="summary-award">${icon(summary.accuracy >= 70 ? 'trophy' : 'flag', 42)}</span>
    <span class="eyebrow">ЗАНЯТИЕ ЗАВЕРШЕНО</span><h1>${summary.accuracy >= 90 ? 'Блестящий результат!' : summary.accuracy >= 60 ? 'Хорошая работа!' : 'Ты сделал важный шаг!'}</h1><p>${summary.accuracy >= 60 ? 'Ещё немного практики — и эти темы будут даваться всё легче.' : 'Ошибки помогают понять, на что обратить внимание. Загляни в объяснения и попробуй ещё раз.'}</p>
    <div class="summary-score-row"><div class="ring-wrap summary-ring">${progressRing(summary.accuracy, 154, 12)}<div class="ring-text"><strong>${summary.accuracy}%</strong><small>точность</small></div></div><div class="summary-metrics"><div><span class="summary-metric-icon mint">${icon('circlecheck', 21)}</span><p><strong>${summary.correct} из ${summary.total}</strong><small>верных ответов</small></p></div><div><span class="summary-metric-icon yellow">${icon('star', 21)}</span><p><strong>+${summary.xp} XP</strong><small>получено опыта</small></p></div><div><span class="summary-metric-icon lavender">${icon('flame', 21)}</span><p><strong>${appState.streak} дней</strong><small>серия продолжается</small></p></div></div></div>
    ${wrongSkills.length ? `<div class="summary-recommendation">${icon('brain', 22)}<div><strong>Что повторить в следующий раз</strong><p>${wrongSkills.map((skill) => SKILLS[skill].title).join(' · ')}</p></div></div>` : `<div class="summary-recommendation perfect">${icon('sparkle', 22)}<div><strong>Все ответы верные!</strong><p>В следующем занятии добавим задачи посложнее.</p></div></div>`}
    <div class="summary-actions"><button class="button secondary" type="button" data-action="restart-session">${icon('refresh', 18)} Пройти ещё раз</button><button class="button primary" type="button" data-action="finish-session">${session.kind === 'test' ? 'К тестам' : session.kind === 'course' ? 'Вернуться к курсу' : 'На главную'} ${icon('right', 18)}</button></div>
  </section>`;
}

function startSession(kind, title, questions, extra = {}) {
  session = {
    kind, title, questions,
    index: 0, answers: {}, selected: '', checked: false, hintVisible: false,
    startedAt: Date.now(), finished: false, summary: null, ...extra
  };
  go('session');
}

function startDiagnostic() {
  diagnosticPreview = null;
  startSession('diagnostic', 'Диагностика знаний', DIAGNOSTIC_QUESTIONS);
}

function handleCheckAnswer() {
  if (!session || session.finished || session.checked) return;
  const question = session.questions[session.index];
  if (!normalizeAnswer(session.selected)) {
    showToast('Сначала выбери или введи ответ', 'info');
    return;
  }
  session.answers[question.id] = session.selected;
  if (session.kind === 'diagnostic') {
    if (session.index === session.questions.length - 1) {
      finishDiagnostic();
    } else {
      advanceSession();
    }
    return;
  }
  session.checked = true;
  render();
}

function advanceSession() {
  if (!session) return;
  if (session.index >= session.questions.length - 1) {
    finishSession();
    return;
  }
  session.index += 1;
  session.selected = '';
  session.checked = false;
  session.hintVisible = false;
  render();
}

function finishDiagnostic() {
  if (!session) return;
  diagnosticPreview = scoreDiagnostic(session.questions, session.answers);
  session = null;
  go('diagnostic');
}

function finishSession() {
  if (!session || session.finished) return;
  const summary = getSessionSummary(session.questions, session.answers);
  session.summary = summary;
  session.finished = true;
  const scores = getSkillScores(session.questions, session.answers);
  Object.entries(scores).forEach(([skill, score]) => {
    appState.skillLevels[skill] = Math.round((appState.skillLevels[skill] * 0.65) + (score * 0.35));
    const course = COURSES.find((item) => item.skill === skill);
    if (course && session.kind !== 'test') appState.courseProgress[course.id] = Math.min(100, (appState.courseProgress[course.id] || 0) + 4);
  });
  if (session.kind === 'lesson') {
    appState.dailyCompleted = true;
    appState.dailySolved += summary.total;
  }
  if (session.kind === 'test' && session.skill) {
    appState.testScores[session.skill] = Math.max(appState.testScores[session.skill] || 0, summary.accuracy);
  }
  if (session.kind === 'course' && session.courseId) {
    appState.courseProgress[session.courseId] = Math.min(100, (appState.courseProgress[session.courseId] || 0) + 8);
  }
  appState.totalSolved += summary.total;
  appState.totalCorrect += summary.correct;
  appState.xp += summary.xp;
  appState.totalMinutes += Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
  const todayIndex = (new Date().getDay() + 6) % 7;
  appState.weekly[todayIndex] = (appState.weekly[todayIndex] || 0) + summary.total;
  appState.activitySeed[appState.activitySeed.length - 1] = 2;
  saveState();
  render();
}

function restartSession() {
  if (!session) return;
  session = {
    kind: session.kind, title: session.title, questions: session.questions,
    skill: session.skill, courseId: session.courseId,
    index: 0, answers: {}, selected: '', checked: false, hintVisible: false,
    startedAt: Date.now(), finished: false, summary: null
  };
  render();
}

function finishSessionAndLeave() {
  const kind = session?.kind;
  session = null;
  if (kind === 'test') go('tests');
  else if (kind === 'course') go('course');
  else go('home');
}

function applyPlan() {
  if (!diagnosticPreview) return;
  appState.plan = createPersonalPlan(diagnosticPreview.skills);
  appState.diagnostic = {
    completed: true,
    score: diagnosticPreview.score,
    date: new Date().toISOString().slice(0, 10),
    skills: { ...diagnosticPreview.skills }
  };
  appState.skillLevels = { ...appState.skillLevels, ...diagnosticPreview.skills };
  appState.notificationsRead = false;
  saveState();
  diagnosticPreview = null;
  go('home');
  showToast('Персональная программа готова!');
}

function openNotifications() {
  if (!appState.user.notifications) {
    showModal(`<div class="modal-header"><div><span class="eyebrow">УВЕДОМЛЕНИЯ</span><h2>Уведомления выключены</h2></div><button class="icon-button" type="button" data-action="close-modal">${icon('x', 20)}</button></div><div class="install-instructions"><span class="app-panel-logo">${icon('bell', 48)}</span><p>Их можно включить в настройках профиля. Занятия и сохранение прогресса работают независимо от этой настройки.</p><button class="button primary wide" type="button" data-route="profile">Открыть настройки</button></div>`, 'small-modal');
    return;
  }
  showModal(`<div class="modal-header"><div><span class="eyebrow">ЧТО НОВОГО</span><h2>Уведомления</h2></div><button class="icon-button" type="button" data-action="close-modal" aria-label="Закрыть">${icon('x', 20)}</button></div>
    <div class="notification-list"><div class="notification-item ${appState.notificationsRead ? '' : 'unread'}"><span class="notification-icon mint">${icon('sparkle', 21)}</span><div><strong>Твоя программа готова</strong><p>Сегодня: ${appState.plan.map((skill) => SKILLS[skill].short).join(', ')}.</p><small>Сегодня</small></div></div><div class="notification-item"><span class="notification-icon peach">${icon('flame', 21)}</span><div><strong>Серия — ${appState.streak} дней!</strong><p>Отличный ритм. Одно короткое занятие сохранит серию.</p><small>Вчера</small></div></div><div class="notification-item"><span class="notification-icon lavender">${icon('award', 21)}</span><div><strong>Новое достижение</strong><p>«Точный расчёт» — больше 100 верных ответов.</p><small>2 дня назад</small></div></div></div>
    <button class="button secondary wide" type="button" data-action="mark-notifications">${icon('check', 17)} Отметить всё прочитанным</button>`, 'notification-modal');
}

function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => { deferredInstallPrompt = null; });
    return;
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  showModal(`<div class="modal-header"><div><span class="eyebrow">ПРИЛОЖЕНИЕ SANA</span><h2>Установи и занимайся удобнее</h2></div><button class="icon-button" type="button" data-action="close-modal">${icon('x', 20)}</button></div><div class="install-instructions"><span class="app-panel-logo">${brandMark(56)}</span><p>Sana работает как приложение прямо из браузера — отдельная иконка, полноэкранный режим и сохранённый прогресс.</p><ol>${isIos ? '<li>Нажми <strong>«Поделиться»</strong> в Safari.</li><li>Выбери <strong>«На экран “Домой”»</strong>.</li><li>Подтверди добавление.</li>' : '<li>Открой меню браузера <strong>⋮</strong>.</li><li>Выбери <strong>«Установить приложение»</strong> или <strong>«Добавить на главный экран»</strong>.</li><li>Подтверди установку.</li>'}</ol><button class="button primary wide" type="button" data-action="close-modal">Понятно</button></div>`, 'small-modal');
}

function handleAction(actionElement, event) {
  const action = actionElement.dataset.action;
  if (action === 'close-modal') closeModal();
  if (action === 'open-notifications') openNotifications();
  if (action === 'mark-notifications') { appState.notificationsRead = true; saveState(); closeModal(); renderChrome(); showToast('Уведомления прочитаны'); }
  if (action === 'install-app') installApp();
  if (action === 'start-diagnostic') startDiagnostic();
  if (action === 'start-lesson') {
    const daily = dailyLessonConfig();
    startSession('lesson', 'Занятие на сегодня', makeLessonQuestions(appState.plan, daily.perSkill, appState.dailyCompleted ? 1 : 0));
  }
  if (action === 'start-test') {
    const skill = actionElement.dataset.skill;
    startSession('test', `Тест: ${SKILLS[skill].title}`, makeLessonQuestions([skill], 5), { skill });
  }
  if (action === 'start-course-lesson') {
    const skill = actionElement.dataset.skill;
    const index = Number(actionElement.dataset.index) || 0;
    const course = COURSES.find((item) => item.skill === skill);
    startSession('course', `${course.title} · Урок ${index + 1}`, makeLessonQuestions([skill], 5, index), { skill, courseId: course.id });
  }
  if (action === 'filter-courses') { courseFilter = actionElement.dataset.filter; render(); }
  if (action === 'open-course') { activeCourseId = actionElement.dataset.course; go('course'); }
  if (action === 'select-option' && session && !session.checked) {
    session.selected = actionElement.dataset.value;
    render();
  }
  if (action === 'show-hint' && session) { session.hintVisible = true; render(); }
  if (action === 'check-answer') handleCheckAnswer();
  if (action === 'next-question') advanceSession();
  if (action === 'restart-session') restartSession();
  if (action === 'finish-session') finishSessionAndLeave();
  if (action === 'session-exit') {
    event.preventDefault();
    if (!session) { go('home'); return; }
    confirmDialog({ title: 'Выйти из занятия?', text: 'Ответы этой попытки не сохранятся. Ты сможешь начать заново в любой момент.', confirmText: 'Выйти', action: 'confirm-session-exit' });
  }
  if (action === 'confirm-session-exit') {
    const kind = session?.kind;
    session = null;
    closeModal();
    go(kind === 'test' ? 'tests' : kind === 'course' ? 'course' : kind === 'diagnostic' ? 'diagnostic' : 'home');
  }
  if (action === 'apply-plan') applyPlan();
  if (action === 'reset-data') confirmDialog({ title: 'Сбросить весь прогресс?', text: 'Результаты тестов, уровни и настройки вернутся к исходным демо-данным.', confirmText: 'Сбросить', action: 'confirm-reset', danger: true });
  if (action === 'confirm-reset') {
    appState = cloneDefaultState(); saveState(); session = null; diagnosticPreview = null; closeModal(); go('home'); showToast('Демо-прогресс восстановлен');
  }
}

document.addEventListener('click', (event) => {
  const routeElement = event.target.closest('[data-route]');
  if (routeElement) {
    event.preventDefault();
    closeModal();
    go(routeElement.dataset.route);
    return;
  }
  const actionElement = event.target.closest('[data-action]');
  if (actionElement) handleAction(actionElement, event);
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'answer-input' && session && !session.checked) {
    session.selected = event.target.value;
    const button = document.querySelector('#answer-check');
    if (button) button.disabled = !normalizeAnswer(session.selected);
  }
});

document.addEventListener('submit', (event) => {
  if (event.target.id === 'answer-input-form') {
    event.preventDefault();
    handleCheckAnswer();
  }
  if (event.target.id === 'profile-form') {
    event.preventDefault();
    const form = new FormData(event.target);
    const name = String(form.get('name') || '').trim();
    if (!name) { showToast('Введи имя ученика', 'info'); return; }
    appState.user = {
      ...appState.user,
      name,
      grade: String(form.get('grade')),
      dailyGoal: Number(form.get('dailyGoal')),
      notifications: form.get('notifications') === 'on'
    };
    saveState();
    render();
    showToast('Настройки сохранены');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalRoot.innerHTML) closeModal();
  if (currentRoute === 'session' && session && !session.checked && !session.finished && ['1', '2', '3', '4'].includes(event.key) && document.activeElement?.tagName !== 'INPUT') {
    const question = session.questions[session.index];
    const option = question.options?.[Number(event.key) - 1];
    if (option) { session.selected = option; render(); }
  }
  if (event.key === 'Enter' && currentRoute === 'session' && session?.checked && !modalRoot.innerHTML) {
    event.preventDefault();
    advanceSession();
  }
});

window.addEventListener('hashchange', () => {
  const route = location.hash.slice(1);
  currentRoute = ROUTES.includes(route) ? route : 'home';
  closeModal();
  render();
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

function initialise() {
  document.querySelector('#sidebar-brand-mark').innerHTML = brandMark(40);
  document.querySelectorAll('[data-icon]').forEach((element) => {
    element.innerHTML = icon(element.dataset.icon, element.dataset.icon === 'bell' ? 21 : 20);
  });
  const route = location.hash.slice(1);
  currentRoute = ROUTES.includes(route) && route !== 'session' ? route : 'home';
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

initialise();
