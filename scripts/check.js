import fs from 'node:fs';
import assert from 'node:assert/strict';
import { SKILLS, COURSES, DIAGNOSTIC_QUESTIONS, QUESTION_BANK } from '../src/data.js';

const runtimeFiles = ['index.html', 'styles.css', 'src/app.js', 'src/data.js', 'src/icons.js', 'src/learning.js'];
for (const file of runtimeFiles) {
  const content = fs.readFileSync(file, 'utf8');
  assert.ok(content.length > 100, `${file}: файл не должен быть пустым`);
  assert.ok(!/Brawl Arena|brawl-arena/i.test(content), `${file}: остались данные старой игры`);
}

const questions = [...DIAGNOSTIC_QUESTIONS, ...QUESTION_BANK];
assert.equal(new Set(questions.map((question) => question.id)).size, questions.length, 'ID заданий должны быть уникальны');
for (const question of questions) {
  assert.ok(SKILLS[question.skill], `${question.id}: неизвестный навык`);
  assert.ok(question.prompt && question.answer && question.explanation && question.hint, `${question.id}: задание заполнено не полностью`);
  if (question.options) assert.ok(question.options.includes(question.answer), `${question.id}: правильного ответа нет в вариантах`);
}
for (const course of COURSES) {
  assert.ok(SKILLS[course.skill], `${course.id}: неизвестный навык курса`);
  assert.ok(QUESTION_BANK.some((question) => question.skill === course.skill), `${course.id}: нет заданий`);
}

const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
assert.equal(manifest.short_name, 'Sana');
for (const item of manifest.icons) assert.ok(fs.existsSync(item.src), `Нет иконки ${item.src}`);
const worker = fs.readFileSync('sw.js', 'utf8');
for (const match of worker.matchAll(/'\.\/([^']+)'/g)) {
  if (match[1]) assert.ok(fs.existsSync(match[1]), `SW: файл ${match[1]} не найден`);
}
console.log(`✓ Проверено: ${questions.length} заданий, ${COURSES.length} курсов, manifest и service worker`);
