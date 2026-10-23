import fs from 'node:fs';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { DIAGNOSTIC_QUESTIONS } from '../src/data.js';

const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
  url: 'http://localhost/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
for (const key of ['window', 'document', 'localStorage', 'location', 'FormData', 'HTMLElement', 'Node']) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
const tick = () => new Promise((resolve) => setTimeout(resolve, 12));
const click = async (element) => {
  assert.ok(element, 'Элемент для нажатия должен существовать');
  element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick();
};

await import(`../src/app.js?ui-test=${Date.now()}`);
await tick();
assert.ok(window.document.querySelector('#main-content').textContent.includes('Али'));
assert.ok(window.document.querySelector('.daily-hero'));

// Диагностика: специально ошибаемся в дробях, уравнениях и геометрии.
await click(window.document.querySelector('[data-action="start-diagnostic"]'));
for (let index = 0; index < DIAGNOSTIC_QUESTIONS.length; index += 1) {
  const question = DIAGNOSTIC_QUESTIONS[index];
  assert.ok(window.document.querySelector('.question-card'), `Вопрос ${index + 1} должен быть виден`);
  const weak = ['fractions', 'equations', 'geometry'].includes(question.skill);
  const value = weak ? question.options.find((option) => option !== question.answer) : question.answer;
  await click([...window.document.querySelectorAll('[data-action="select-option"]')].find((button) => button.dataset.value === value));
  await click(window.document.querySelector('[data-action="check-answer"]'));
}
assert.ok(window.document.querySelector('.diagnostic-result-page'), 'После диагностики должен открыться результат');
assert.ok(window.document.querySelector('#main-content').textContent.includes('Карта знаний готова'));
await click(window.document.querySelector('[data-action="apply-plan"]'));
let saved = JSON.parse(window.localStorage.getItem('sana-learning-state-v1'));
assert.deepEqual(saved.plan, ['fractions', 'equations', 'geometry']);
assert.ok(window.document.querySelector('.dashboard-page'));

// Полное ежедневное занятие, включая задания с ручным вводом.
await click(window.document.querySelector('[data-action="start-lesson"]'));
const totalBefore = saved.totalSolved;
let guard = 0;
while (!window.document.querySelector('.session-summary') && guard < 10) {
  guard += 1;
  const prompt = window.document.querySelector('.question-card h1')?.textContent;
  assert.ok(prompt, 'Вопрос занятия должен быть виден');
  const options = [...window.document.querySelectorAll('[data-action="select-option"]')];
  if (options.length) {
    const questionModule = await import('../src/data.js');
    const question = questionModule.QUESTION_BANK.find((item) => item.prompt === prompt);
    await click(options.find((button) => button.dataset.value === question.answer));
  } else {
    const questionModule = await import('../src/data.js');
    const question = questionModule.QUESTION_BANK.find((item) => item.prompt === prompt);
    const input = window.document.querySelector('#answer-input');
    input.value = question.answer;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  await click(window.document.querySelector('[data-action="check-answer"]'));
  assert.ok(window.document.querySelector('.answer-feedback.correct'), 'Должно появиться объяснение верного ответа');
  await click(window.document.querySelector('[data-action="next-question"]'));
}
assert.ok(window.document.querySelector('.session-summary'), 'Должен открыться итог занятия');
saved = JSON.parse(window.localStorage.getItem('sana-learning-state-v1'));
assert.equal(saved.dailyCompleted, true);
assert.equal(saved.totalSolved, totalBefore + 6);
await click(window.document.querySelector('[data-action="finish-session"]'));
assert.ok(window.document.querySelector('[data-action="start-lesson"]').textContent.includes('Пройти ещё раз'));

// Фильтр курсов и редактирование профиля.
await click(window.document.querySelector('.side-nav [data-route="courses"]'));
await click(window.document.querySelector('[data-action="filter-courses"][data-filter="geometry"]'));
assert.equal(window.document.querySelectorAll('.course-card').length, 1);
assert.ok(window.document.querySelector('.course-card').textContent.includes('Геометрия'));
await click(window.document.querySelector('[data-route="profile"]'));
const nameInput = window.document.querySelector('input[name="name"]');
nameInput.value = 'Алихан';
window.document.querySelector('select[name="dailyGoal"]').value = '30';
window.document.querySelector('#profile-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await tick();
saved = JSON.parse(window.localStorage.getItem('sana-learning-state-v1'));
assert.equal(saved.user.name, 'Алихан');
assert.equal(saved.user.dailyGoal, 30);
assert.equal(window.document.querySelector('#header-name').textContent, 'Алихан');

// Ежедневная цель влияет на длину занятия: 30 минут = 4 задания по каждой из 3 тем.
await click(window.document.querySelector('.side-nav [data-route="home"]'));
await click(window.document.querySelector('[data-action="start-lesson"]'));
assert.ok(window.document.querySelector('.session-header-progress span').textContent.includes('1 из 12'));

window.close();
console.log('✓ UI: диагностика → план → урок, фильтры, профиль и ежедневная цель работают');
