import { QUESTION_BANK, SKILLS } from './data.js';

export function normalizeAnswer(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ');
}

export function numericValue(value) {
  const normalized = normalizeAnswer(value).replace(/\s/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  const fraction = normalized.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
  return null;
}

export function isAnswerCorrect(question, value) {
  if (value === undefined || value === null || normalizeAnswer(value) === '') return false;
  const expected = normalizeAnswer(question.answer);
  const actual = normalizeAnswer(value);
  if (expected === actual) return true;
  if (question.type === 'input') {
    const expectedNumber = numericValue(expected);
    const actualNumber = numericValue(actual);
    return expectedNumber !== null && actualNumber !== null && Math.abs(expectedNumber - actualNumber) < 1e-9;
  }
  return false;
}

export function getSkillScores(questions, answers) {
  const buckets = {};
  questions.forEach((question) => {
    if (!buckets[question.skill]) buckets[question.skill] = { correct: 0, total: 0 };
    buckets[question.skill].total += 1;
    if (isAnswerCorrect(question, answers[question.id])) buckets[question.skill].correct += 1;
  });
  return Object.fromEntries(Object.entries(buckets).map(([skill, result]) => [
    skill,
    Math.round((result.correct / result.total) * 100)
  ]));
}

export function scoreDiagnostic(questions, answers) {
  const correct = questions.reduce((sum, question) => sum + (isAnswerCorrect(question, answers[question.id]) ? 1 : 0), 0);
  return {
    correct,
    total: questions.length,
    score: questions.length ? Math.round((correct / questions.length) * 100) : 0,
    skills: getSkillScores(questions, answers)
  };
}

export function createPersonalPlan(skillScores) {
  const order = Object.keys(SKILLS);
  return order
    .slice()
    .sort((a, b) => (skillScores[a] ?? 0) - (skillScores[b] ?? 0) || order.indexOf(a) - order.indexOf(b))
    .slice(0, 3);
}

export function getRecommendedMessage(score) {
  if (score >= 85) return 'Отличная база! Добавим более сложные задачи и закрепим сильные стороны.';
  if (score >= 60) return 'Хорошая база. Сфокусируемся на темах, где пока есть пробелы.';
  return 'Начнём с небольших шагов и будем постепенно усложнять задания.';
}

export function makeLessonQuestions(skills, perSkill = 2, variant = 0) {
  const result = [];
  skills.forEach((skill, skillIndex) => {
    const pool = QUESTION_BANK.filter((question) => question.skill === skill);
    if (!pool.length) return;
    const offset = (variant + skillIndex) % pool.length;
    const rotated = pool.slice(offset).concat(pool.slice(0, offset));
    result.push(...rotated.slice(0, Math.min(perSkill, rotated.length)));
  });
  return result;
}

export function getSessionSummary(questions, answers) {
  const correct = questions.filter((question) => isAnswerCorrect(question, answers[question.id])).length;
  const answered = questions.filter((question) => normalizeAnswer(answers[question.id]) !== '').length;
  return {
    correct,
    answered,
    total: questions.length,
    accuracy: questions.length ? Math.round((correct / questions.length) * 100) : 0,
    xp: correct * 15 + (correct === questions.length && questions.length ? 20 : 0)
  };
}

export function getLevel(xp) {
  const safeXp = Math.max(0, Number(xp) || 0);
  const level = Math.floor(safeXp / 500) + 1;
  return {
    level,
    current: safeXp % 500,
    needed: 500,
    progress: Math.round(((safeXp % 500) / 500) * 100)
  };
}
