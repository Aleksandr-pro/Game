export const SKILLS = {
  arithmetic: {
    id: 'arithmetic',
    title: 'Числа и вычисления',
    short: 'Вычисления',
    description: 'Порядок действий, отрицательные числа и быстрый счёт',
    icon: 'calculator',
    color: 'mint'
  },
  fractions: {
    id: 'fractions',
    title: 'Дроби',
    short: 'Дроби',
    description: 'Сложение, вычитание, умножение и сравнение дробей',
    icon: 'pie',
    color: 'lavender'
  },
  equations: {
    id: 'equations',
    title: 'Уравнения',
    short: 'Уравнения',
    description: 'Линейные уравнения и выражения с переменными',
    icon: 'variable',
    color: 'blue'
  },
  geometry: {
    id: 'geometry',
    title: 'Геометрия',
    short: 'Геометрия',
    description: 'Периметр, площадь, углы и свойства фигур',
    icon: 'shapes',
    color: 'peach'
  },
  percent: {
    id: 'percent',
    title: 'Проценты',
    short: 'Проценты',
    description: 'Процент от числа, скидки и изменение величин',
    icon: 'percent',
    color: 'yellow'
  },
  logic: {
    id: 'logic',
    title: 'Текстовые задачи',
    short: 'Задачи',
    description: 'Переводим условие на язык математики',
    icon: 'puzzle',
    color: 'rose'
  }
};

export const DIAGNOSTIC_QUESTIONS = [
  {
    id: 'd-arithmetic-1', skill: 'arithmetic',
    prompt: 'Вычисли: 48 : 6 + 17',
    options: ['25', '31', '24', '9'], answer: '25',
    explanation: 'Сначала деление: 48 : 6 = 8. Затем сложение: 8 + 17 = 25.',
    hint: 'Вспомни порядок действий: деление выполняем раньше сложения.'
  },
  {
    id: 'd-fractions-1', skill: 'fractions',
    prompt: 'Чему равна сумма 1/4 + 2/4?',
    options: ['3/8', '3/4', '1/2', '2/4'], answer: '3/4',
    explanation: 'Знаменатели одинаковые, поэтому складываем только числители: (1 + 2)/4 = 3/4.',
    hint: 'При одинаковых знаменателях знаменатель не меняется.'
  },
  {
    id: 'd-equations-1', skill: 'equations',
    prompt: 'Реши уравнение: x + 17 = 42',
    options: ['25', '59', '24', '35'], answer: '25',
    explanation: 'Вычтем 17 из обеих частей: x = 42 − 17 = 25.',
    hint: 'Нужно оставить x один в левой части.'
  },
  {
    id: 'd-geometry-1', skill: 'geometry',
    prompt: 'Найди периметр прямоугольника со сторонами 8 см и 5 см.',
    options: ['13 см', '40 см', '26 см', '21 см'], answer: '26 см',
    explanation: 'P = 2 × (8 + 5) = 26 см.',
    hint: 'У прямоугольника две пары равных сторон.'
  },
  {
    id: 'd-percent-1', skill: 'percent',
    prompt: 'Найди 20% от 250.',
    options: ['20', '40', '50', '125'], answer: '50',
    explanation: '20% = 0,2. Умножаем: 250 × 0,2 = 50.',
    hint: '20% — это одна пятая часть числа.'
  },
  {
    id: 'd-logic-1', skill: 'logic',
    prompt: 'За 3 одинаковые тетради заплатили 450 ₸. Сколько стоит одна тетрадь?',
    options: ['135 ₸', '150 ₸', '153 ₸', '300 ₸'], answer: '150 ₸',
    explanation: 'Делим общую стоимость на количество: 450 : 3 = 150 ₸.',
    hint: 'Нужно найти стоимость одного предмета.'
  },
  {
    id: 'd-arithmetic-2', skill: 'arithmetic',
    prompt: 'Вычисли: −7 + 12',
    options: ['−19', '−5', '5', '19'], answer: '5',
    explanation: '12 − 7 = 5. Знак положительный, потому что положительное число больше по модулю.',
    hint: 'Представь движение по числовой прямой: от −7 на 12 шагов вправо.'
  },
  {
    id: 'd-equations-2', skill: 'equations',
    prompt: 'Реши уравнение: 4x = 36',
    options: ['4', '8', '9', '32'], answer: '9',
    explanation: 'Разделим обе части на 4: x = 36 : 4 = 9.',
    hint: 'Какое число при умножении на 4 даёт 36?'
  }
];

export const QUESTION_BANK = [
  {
    id: 'a1', skill: 'arithmetic', prompt: 'Вычисли: 36 + 48 : 8',
    options: ['42', '44', '10,5', '84'], answer: '42',
    explanation: 'Сначала 48 : 8 = 6, затем 36 + 6 = 42.',
    hint: 'Деление выполняется раньше сложения.'
  },
  {
    id: 'a2', skill: 'arithmetic', prompt: 'Вычисли: 7 × (13 − 8)',
    options: ['83', '35', '42', '91'], answer: '35',
    explanation: 'В скобках 13 − 8 = 5. Затем 7 × 5 = 35.',
    hint: 'Начни с действия в скобках.'
  },
  {
    id: 'a3', skill: 'arithmetic', prompt: 'Вычисли: −15 + 9',
    options: ['−24', '−6', '6', '24'], answer: '−6',
    explanation: '15 − 9 = 6. Отрицательное число больше по модулю, поэтому ответ −6.',
    hint: 'От −15 сделай 9 шагов вправо по числовой прямой.'
  },
  {
    id: 'a4', skill: 'arithmetic', prompt: 'Вставь пропущенное число: 9 × □ = 72',
    type: 'input', answer: '8',
    explanation: '72 : 9 = 8. Проверка: 9 × 8 = 72.',
    hint: 'Используй обратное действие — деление.'
  },
  {
    id: 'a5', skill: 'arithmetic', prompt: 'Вычисли: 2³ + 5 × 2',
    options: ['16', '18', '22', '26'], answer: '18',
    explanation: '2³ = 8, 5 × 2 = 10. Сумма: 8 + 10 = 18.',
    hint: 'Сначала степень, потом умножение, затем сложение.'
  },
  {
    id: 'f1', skill: 'fractions', prompt: 'Сложи: 2/5 + 1/5',
    options: ['3/10', '3/5', '2/5', '1'], answer: '3/5',
    explanation: 'Знаменатели равны: (2 + 1)/5 = 3/5.',
    hint: 'Сложи числители, а знаменатель оставь прежним.'
  },
  {
    id: 'f2', skill: 'fractions', prompt: 'Вычисли: 5/6 − 1/3',
    options: ['1/2', '4/3', '2/3', '1/3'], answer: '1/2',
    explanation: 'Приведём к знаменателю 6: 1/3 = 2/6. Тогда 5/6 − 2/6 = 3/6 = 1/2.',
    hint: 'Приведи дроби к общему знаменателю 6.'
  },
  {
    id: 'f3', skill: 'fractions', prompt: 'Какая дробь больше?',
    options: ['3/7', '4/9', '5/12', 'Они равны'], answer: '4/9',
    explanation: 'Приведём к знаменателю 252: 3/7 = 108/252, 4/9 = 112/252, 5/12 = 105/252. Больше 4/9.',
    hint: 'Сравни дроби через общий знаменатель или десятичные значения.'
  },
  {
    id: 'f4', skill: 'fractions', prompt: 'Вычисли: 3/4 × 8/9. Ответ запиши несократимой дробью.',
    type: 'input', answer: '2/3',
    explanation: 'Сокращаем: 3 и 9 на 3, 8 и 4 на 2. Получаем 1/1 × 2/3 = 2/3.',
    hint: 'Перемножь числители и знаменатели, затем сократи.'
  },
  {
    id: 'f5', skill: 'fractions', prompt: 'Сколько будет 1 − 3/8?',
    options: ['2/8', '3/8', '5/8', '7/8'], answer: '5/8',
    explanation: '1 = 8/8. Поэтому 8/8 − 3/8 = 5/8.',
    hint: 'Представь единицу как дробь со знаменателем 8.'
  },
  {
    id: 'e1', skill: 'equations', prompt: 'Реши уравнение: x − 14 = 27',
    options: ['13', '31', '41', '43'], answer: '41',
    explanation: 'Прибавим 14 к обеим частям: x = 27 + 14 = 41.',
    hint: 'Чтобы убрать −14, прибавь 14 к обеим частям.'
  },
  {
    id: 'e2', skill: 'equations', prompt: 'Реши уравнение: 5x + 4 = 29',
    options: ['4', '5', '6', '7'], answer: '5',
    explanation: '5x = 29 − 4 = 25, значит x = 25 : 5 = 5.',
    hint: 'Сначала вычти 4, затем раздели на 5.'
  },
  {
    id: 'e3', skill: 'equations', prompt: 'Найди x: 3(x + 2) = 21',
    options: ['3', '5', '7', '9'], answer: '5',
    explanation: 'Разделим на 3: x + 2 = 7. Тогда x = 7 − 2 = 5.',
    hint: 'Сначала раздели обе части уравнения на 3.'
  },
  {
    id: 'e4', skill: 'equations', prompt: 'Реши: 7x = 56. Впиши только число.',
    type: 'input', answer: '8',
    explanation: 'x = 56 : 7 = 8.',
    hint: 'Раздели 56 на коэффициент при x.'
  },
  {
    id: 'e5', skill: 'equations', prompt: 'При каком x верно равенство 2x − 3 = x + 6?',
    options: ['3', '6', '9', '12'], answer: '9',
    explanation: 'Перенесём x влево, а −3 вправо: 2x − x = 6 + 3, x = 9.',
    hint: 'Собери слагаемые с x в одной части, числа — в другой.'
  },
  {
    id: 'g1', skill: 'geometry', prompt: 'Найди площадь прямоугольника 9 × 4 см.',
    options: ['13 см²', '26 см²', '36 см²', '18 см²'], answer: '36 см²',
    explanation: 'S = a × b = 9 × 4 = 36 см².',
    hint: 'Площадь прямоугольника — произведение длины и ширины.'
  },
  {
    id: 'g2', skill: 'geometry', prompt: 'Периметр квадрата равен 32 см. Чему равна его сторона?',
    options: ['4 см', '8 см', '16 см', '64 см'], answer: '8 см',
    explanation: 'Все 4 стороны квадрата равны: 32 : 4 = 8 см.',
    hint: 'Раздели периметр на количество сторон.'
  },
  {
    id: 'g3', skill: 'geometry', prompt: 'Два угла треугольника равны 55° и 65°. Найди третий угол.',
    options: ['50°', '60°', '70°', '120°'], answer: '60°',
    explanation: 'Сумма углов треугольника 180°: 180 − 55 − 65 = 60°.',
    hint: 'Сумма всех углов треугольника равна 180°.'
  },
  {
    id: 'g4', skill: 'geometry', prompt: 'Сторона квадрата 7 см. Найди его площадь в см².',
    type: 'input', answer: '49',
    explanation: 'S = a² = 7² = 49 см².',
    hint: 'Умножь длину стороны саму на себя.'
  },
  {
    id: 'g5', skill: 'geometry', prompt: 'Чему равен периметр равностороннего треугольника со стороной 6 см?',
    options: ['12 см', '18 см', '24 см', '36 см'], answer: '18 см',
    explanation: 'Все три стороны равны: P = 3 × 6 = 18 см.',
    hint: 'Сложи три равные стороны.'
  },
  {
    id: 'p1', skill: 'percent', prompt: 'Найди 10% от 360.',
    options: ['18', '36', '60', '72'], answer: '36',
    explanation: '10% — это десятая часть: 360 : 10 = 36.',
    hint: 'Чтобы найти 10%, раздели число на 10.'
  },
  {
    id: 'p2', skill: 'percent', prompt: 'Товар стоит 4 000 ₸. Сколько составит скидка 15%?',
    options: ['400 ₸', '600 ₸', '800 ₸', '1 500 ₸'], answer: '600 ₸',
    explanation: '4 000 × 0,15 = 600 ₸.',
    hint: '15% = 0,15. Умножь стоимость на 0,15.'
  },
  {
    id: 'p3', skill: 'percent', prompt: 'В классе 25 учеников, 40% из них занимаются спортом. Сколько это человек?',
    options: ['8', '10', '12', '15'], answer: '10',
    explanation: '25 × 0,4 = 10 учеников.',
    hint: '40% = 0,4.'
  },
  {
    id: 'p4', skill: 'percent', prompt: 'Чему равны 25% от 80?',
    type: 'input', answer: '20',
    explanation: '25% — это четверть: 80 : 4 = 20.',
    hint: '25% — одна четвёртая часть.'
  },
  {
    id: 'p5', skill: 'percent', prompt: 'Цена 2 500 ₸ выросла на 20%. Какая новая цена?',
    options: ['2 700 ₸', '2 800 ₸', '3 000 ₸', '3 200 ₸'], answer: '3 000 ₸',
    explanation: 'Повышение: 2 500 × 0,2 = 500 ₸. Новая цена: 2 500 + 500 = 3 000 ₸.',
    hint: 'Сначала найди величину повышения, затем прибавь её к цене.'
  },
  {
    id: 'l1', skill: 'logic', prompt: 'Велосипедист проехал 36 км за 3 часа. Какова его скорость?',
    options: ['9 км/ч', '12 км/ч', '18 км/ч', '39 км/ч'], answer: '12 км/ч',
    explanation: 'Скорость = расстояние : время = 36 : 3 = 12 км/ч.',
    hint: 'Используй формулу v = S : t.'
  },
  {
    id: 'l2', skill: 'logic', prompt: 'Один карандаш стоит 80 ₸. Сколько стоят 7 таких карандашей?',
    options: ['480 ₸', '540 ₸', '560 ₸', '640 ₸'], answer: '560 ₸',
    explanation: '80 × 7 = 560 ₸.',
    hint: 'Умножь цену одного карандаша на их количество.'
  },
  {
    id: 'l3', skill: 'logic', prompt: 'В двух коробках 54 карандаша. В первой на 6 больше, чем во второй. Сколько во второй?',
    options: ['21', '24', '27', '30'], answer: '24',
    explanation: 'Если убрать лишние 6, коробки сравняются: 54 − 6 = 48. Во второй 48 : 2 = 24.',
    hint: 'Вычти разницу 6 из общего количества и раздели поровну.'
  },
  {
    id: 'l4', skill: 'logic', prompt: 'Автобус едет 2 часа со скоростью 65 км/ч. Какое расстояние он проедет? Впиши число в км.',
    type: 'input', answer: '130',
    explanation: 'S = v × t = 65 × 2 = 130 км.',
    hint: 'Расстояние = скорость × время.'
  },
  {
    id: 'l5', skill: 'logic', prompt: 'После покупки книги за 1 250 ₸ у Мади осталось 750 ₸. Сколько денег было сначала?',
    options: ['500 ₸', '1 500 ₸', '1 750 ₸', '2 000 ₸'], answer: '2 000 ₸',
    explanation: 'Сложим потраченную и оставшуюся суммы: 1 250 + 750 = 2 000 ₸.',
    hint: 'Начальная сумма = потрачено + осталось.'
  }
];

export const COURSES = [
  {
    id: 'fractions-course', skill: 'fractions', grade: '5–7 класс',
    title: 'Дроби без страха', subtitle: 'От простых частей к уверенным вычислениям',
    lessons: 12, minutes: 15, level: 'Базовый', progress: 68,
    description: 'Научись понимать дроби, сравнивать их и выполнять все действия без зубрёжки.',
    outcomes: ['Понимать смысл дроби', 'Складывать и вычитать', 'Умножать и сокращать']
  },
  {
    id: 'equations-course', skill: 'equations', grade: '6–8 класс',
    title: 'Уравнения шаг за шагом', subtitle: 'Находи неизвестное без догадок',
    lessons: 10, minutes: 18, level: 'Базовый', progress: 40,
    description: 'Освой надёжный алгоритм решения линейных уравнений и научись проверять ответ.',
    outcomes: ['Решать линейные уравнения', 'Раскрывать скобки', 'Проверять найденный корень']
  },
  {
    id: 'arithmetic-course', skill: 'arithmetic', grade: '5–7 класс',
    title: 'Счёт быстро и точно', subtitle: 'Порядок действий и числовые выражения',
    lessons: 8, minutes: 12, level: 'Базовый', progress: 82,
    description: 'Тренируй вычислительные навыки с короткими заданиями и понятными разборами.',
    outcomes: ['Соблюдать порядок действий', 'Работать со степенями', 'Считать с отрицательными числами']
  },
  {
    id: 'geometry-course', skill: 'geometry', grade: '6–8 класс',
    title: 'Геометрия вокруг нас', subtitle: 'Фигуры, площади и углы на понятных примерах',
    lessons: 9, minutes: 20, level: 'Средний', progress: 25,
    description: 'Учись видеть свойства фигур и применять формулы, а не просто запоминать их.',
    outcomes: ['Находить периметр и площадь', 'Работать с углами', 'Решать задачи на фигуры']
  },
  {
    id: 'percent-course', skill: 'percent', grade: '6–9 класс',
    title: 'Проценты в жизни', subtitle: 'Скидки, финансы и изменение величин',
    lessons: 7, minutes: 15, level: 'Средний', progress: 0,
    description: 'Разберись с процентами на задачах из магазина, спорта и повседневной жизни.',
    outcomes: ['Находить процент от числа', 'Считать скидки', 'Определять новую величину']
  },
  {
    id: 'logic-course', skill: 'logic', grade: '5–8 класс',
    title: 'Текстовые задачи', subtitle: 'От условия — к понятному решению',
    lessons: 11, minutes: 17, level: 'Средний', progress: 55,
    description: 'Научись выделять данные, строить короткую запись и выбирать нужные действия.',
    outcomes: ['Составлять краткую запись', 'Решать задачи на движение', 'Проверять реалистичность ответа']
  }
];

export const DEFAULT_STATE = {
  version: 1,
  user: { name: 'Али', grade: '7', dailyGoal: 15, notifications: true },
  xp: 1240,
  streak: 12,
  dailyCompleted: false,
  dailySolved: 0,
  totalSolved: 126,
  totalCorrect: 105,
  totalMinutes: 580,
  weekly: [4, 6, 3, 5, 7, 0, 0],
  plan: ['fractions', 'equations', 'geometry'],
  diagnostic: {
    completed: true,
    score: 63,
    date: '2026-10-18',
    skills: { arithmetic: 82, fractions: 48, equations: 55, geometry: 61, percent: 70, logic: 74 }
  },
  skillLevels: { arithmetic: 82, fractions: 48, equations: 55, geometry: 61, percent: 70, logic: 74 },
  courseProgress: {
    'fractions-course': 68, 'equations-course': 40, 'arithmetic-course': 82,
    'geometry-course': 25, 'percent-course': 0, 'logic-course': 55
  },
  testScores: { fractions: 75, equations: null, geometry: 60, arithmetic: 90, percent: null, logic: null },
  notificationsRead: false,
  activitySeed: [1, 1, 0, 1, 2, 0, 1, 1, 2, 1, 0, 0, 1, 2, 1, 1, 0, 1, 1, 2, 2, 0, 1, 1, 2, 1, 1, 0]
};
