import test from 'node:test';
import assert from 'node:assert/strict';
import { DIAGNOSTIC_QUESTIONS } from '../src/data.js';
import {
  normalizeAnswer,
  numericValue,
  isAnswerCorrect,
  scoreDiagnostic,
  createPersonalPlan,
  makeLessonQuestions,
  getSessionSummary,
  getLevel
} from '../src/learning.js';

test('answers are normalised across dashes, spaces and decimal commas', () => {
  assert.equal(normalizeAnswer('  −7,5 '), '-7.5');
  assert.equal(numericValue('2/4'), 0.5);
  assert.equal(numericValue('0,5'), 0.5);
});

test('numeric and fraction answers accept equivalent values', () => {
  const fractionQuestion = { type: 'input', answer: '2/3' };
  assert.equal(isAnswerCorrect(fractionQuestion, '4/6'), true);
  assert.equal(isAnswerCorrect(fractionQuestion, '0,5'), false);
  const numberQuestion = { type: 'input', answer: '8' };
  assert.equal(isAnswerCorrect(numberQuestion, '8,0'), true);
  assert.equal(isAnswerCorrect(numberQuestion, ''), false);
});

test('diagnostic scores every skill and totals correctly', () => {
  const answers = Object.fromEntries(DIAGNOSTIC_QUESTIONS.map((question) => [question.id, question.answer]));
  const result = scoreDiagnostic(DIAGNOSTIC_QUESTIONS, answers);
  assert.equal(result.score, 100);
  assert.equal(result.correct, 8);
  assert.equal(result.skills.fractions, 100);
  assert.equal(result.skills.arithmetic, 100);
});

test('personal plan prioritises the three weakest skills', () => {
  const plan = createPersonalPlan({ arithmetic: 90, fractions: 20, equations: 40, geometry: 70, percent: 80, logic: 60 });
  assert.deepEqual(plan, ['fractions', 'equations', 'logic']);
});

test('daily lesson contains original tasks from every planned skill', () => {
  const questions = makeLessonQuestions(['fractions', 'equations', 'geometry'], 2);
  assert.equal(questions.length, 6);
  assert.deepEqual([...new Set(questions.map((question) => question.skill))], ['fractions', 'equations', 'geometry']);
  assert.equal(new Set(questions.map((question) => question.id)).size, 6);
});

test('session summary awards correct answers and a perfect-score bonus', () => {
  const questions = makeLessonQuestions(['fractions'], 2);
  const answers = Object.fromEntries(questions.map((question) => [question.id, question.answer]));
  const summary = getSessionSummary(questions, answers);
  assert.equal(summary.accuracy, 100);
  assert.equal(summary.xp, 50);
});

test('levels progress every 500 XP', () => {
  assert.deepEqual(getLevel(0), { level: 1, current: 0, needed: 500, progress: 0 });
  assert.equal(getLevel(1240).level, 3);
  assert.equal(getLevel(1240).current, 240);
});
