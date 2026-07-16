import inquirer from 'inquirer';
import chalk from 'chalk';
import { addXP } from './statsManager.js';

interface Lesson {
  id: string;
  name: string;
  nameEs: string;
  explanation: string;
  structure: string;
  examples: { label: string; sentence: string }[];
  keywords: string[];
  formRules: string[];
  commonMistakes: { mistake: string; correct: string; why: string }[];
  whenToUse: { scenario: string; example: string }[];
}

interface VerbData {
  en: string;
  es: string;
  past: string;
  participle: string;
}

const VERBS: VerbData[] = [
  { en: 'work', es: 'trabajar', past: 'worked', participle: 'worked' },
  { en: 'eat', es: 'comer', past: 'ate', participle: 'eaten' },
  { en: 'read', es: 'leer', past: 'read', participle: 'read' },
  { en: 'write', es: 'escribir', past: 'wrote', participle: 'written' },
  { en: 'play', es: 'jugar', past: 'played', participle: 'played' },
  { en: 'study', es: 'estudiar', past: 'studied', participle: 'studied' },
  { en: 'go', es: 'ir', past: 'went', participle: 'gone' },
  { en: 'make', es: 'hacer/make', past: 'made', participle: 'made' },
  { en: 'take', es: 'tomar', past: 'took', participle: 'taken' },
  { en: 'speak', es: 'hablar', past: 'spoke', participle: 'spoken' },
  { en: 'buy', es: 'comprar', past: 'bought', participle: 'bought' },
  { en: 'see', es: 'ver', past: 'saw', participle: 'seen' },
];

function sForm(word: string): string {
  // Regla -y: si hay CONSONANTE antes de la y → -ies (study→studies)
  // Si hay VOCAL antes de la y → +s (play→plays, buy→buys)
  if (word.endsWith('y') && word.length > 1 && !'aeiou'.includes(word[word.length - 2])) {
    return word.slice(0, -1) + 'ies';
  }
  // -o, -s, -ch, -sh, -x, -z → +es
  if (word.endsWith('o') || word.endsWith('s') || word.endsWith('ch') || word.endsWith('sh') || word.endsWith('x') || word.endsWith('z')) {
    return word + 'es';
  }
  return word + 's';
}

function ingForm(word: string): string {
  if (word === 'make') return 'making';
  if (word === 'take') return 'taking';
  if (word.endsWith('e')) return word.slice(0, -1) + 'ing';
  return word + 'ing';
}

function pastForm(word: string, past: string): string {
  return past;
}

function participleForm(word: string, participle: string): string {
  return participle;
}

// ─── SENTENCE TEMPLATES ─────────────────────────────────────────
// Cada template: { template: string, answer: string, type: string }
// El template usa {{verb}}, {{subject}}, {{sForm}}, {{ingForm}},
// {{past}}, {{participle}}, {{be}}, {{has}}
// type: 'aff' | 'neg' | 'q'

interface GeneratedExercise {
  prompt: string;
  answer: string;
  type: string;
}

const SUBJECTS = ['I', 'You', 'She', 'He', 'We', 'They'];
const THIRD = ['She', 'He'];

function makeExercise(lessonId: string, verb: VerbData): GeneratedExercise {
  const subj = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
  const isThird = THIRD.includes(subj);
  const bePresent = subj === 'I' ? 'am' : isThird ? 'is' : 'are';
  const bePast = subj === 'I' || isThird ? 'was' : 'were';
  const haveForm = isThird ? 'has' : 'have';

  switch (lessonId) {
    // ── Present Simple ──────────────────────────────────────────
    case 'present-simple': {
      const templates = [
        // Affirmative
        { t: `${subj} ________ (${verb.es}) every morning.`, a: sForm(verb.en), ty: 'aff' },
        { t: `${subj} always ________ (${verb.es}) on weekdays.`, a: sForm(verb.en), ty: 'aff' },
        { t: `${subj} ________ (${verb.es}) at the office.`, a: sForm(verb.en), ty: 'aff' },
        { t: `She often ________ (${verb.es}) with her friends.`, a: sForm(verb.en), ty: 'aff' },
        // Negative
        { t: `${subj} ________ (not / ${verb.en}) on Sundays.`, a: isThird ? `doesn't ${verb.en}` : `don't ${verb.en}`, ty: 'neg' },
        { t: `${subj} ________ (not / ${verb.en}) very often.`, a: isThird ? `doesn't ${verb.en}` : `don't ${verb.en}`, ty: 'neg' },
        { t: `He ________ (not / ${verb.en}) in the afternoon.`, a: `doesn't ${verb.en}`, ty: 'neg' },
        // Question
        { t: `________ ${subj.toLowerCase()} ________ (${verb.es}) every day?`, a: isThird ? `Does` : `Do`, ty: 'q' },
        { t: `________ she ________ (${verb.es}) on weekends?`, a: `Does`, ty: 'q' },
        { t: `________ you ________ (${verb.es}) from home?`, a: `Do`, ty: 'q' },
      ];
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      // For questions, the answer is just the auxiliary (Do/Does)
      // For regular forms, use sForm
      let ans = tpl.a;
      if (tpl.ty === 'aff') {
        ans = isThird ? sForm(verb.en) : verb.en;
      }
      return { prompt: tpl.t, answer: ans, type: tpl.ty };
    }

    // ── Present Continuous ──────────────────────────────────────
    case 'present-continuous': {
      const templates = [
        { t: `Look! ${subj} ________ (${verb.es}) right now.`, a: `${bePresent} ${ingForm(verb.en)}`, ty: 'aff' },
        { t: `Listen! Someone ________ (${verb.es}) outside.`, a: `is ${ingForm(verb.en)}`, ty: 'aff' },
        { t: `${subj} ________ (${verb.es}) at the moment.`, a: `${bePresent} ${ingForm(verb.en)}`, ty: 'aff' },
        { t: `${subj} ________ (not / ${verb.es}) today.`, a: `${bePresent} not ${ingForm(verb.en)}`, ty: 'neg' },
        { t: `He ________ (not / ${verb.es}) right now.`, a: `is not ${ingForm(verb.en)}`, ty: 'neg' },
        { t: `________ ${subj.toLowerCase()} ________ (${verb.es}) this week?`, a: `${bePresent === 'am' ? 'Are' : bePresent}`, ty: 'q' },
        { t: `________ you ________ (${verb.es}) at the moment?`, a: `Are`, ty: 'q' },
      ];
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      return { prompt: tpl.t, answer: tpl.a, type: tpl.ty };
    }

    // ── Past Simple ─────────────────────────────────────────────
    case 'past-simple': {
      const templates = [
        { t: `${subj} ________ (${verb.es}) yesterday.`, a: verb.past, ty: 'aff' },
        { t: `${subj} ________ (${verb.es}) last night.`, a: verb.past, ty: 'aff' },
        { t: `She ________ (${verb.es}) two days ago.`, a: verb.past, ty: 'aff' },
        { t: `${subj} ________ (not / ${verb.es}) last week.`, a: `didn't ${verb.en}`, ty: 'neg' },
        { t: `He ________ (not / ${verb.es}) yesterday.`, a: `didn't ${verb.en}`, ty: 'neg' },
        { t: `________ ${subj.toLowerCase()} ________ (${verb.es}) yesterday?`, a: `Did`, ty: 'q' },
        { t: `________ you ________ (${verb.es}) last night?`, a: `Did`, ty: 'q' },
      ];
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      return { prompt: tpl.t, answer: tpl.a, type: tpl.ty };
    }

    // ── Past Continuous ─────────────────────────────────────────
    case 'past-continuous': {
      const templates = [
        { t: `${subj} ________ (${verb.es}) when I arrived.`, a: `${bePast} ${ingForm(verb.en)}`, ty: 'aff' },
        { t: `${subj} ________ (${verb.es}) at 8 PM last night.`, a: `${bePast} ${ingForm(verb.en)}`, ty: 'aff' },
        { t: `While ${subj.toLowerCase()} ________ (${verb.es}), the phone rang.`, a: `${bePast} ${ingForm(verb.en)}`, ty: 'aff' },
        { t: `${subj} ________ (not / ${verb.es}) when you called.`, a: `${bePast} not ${ingForm(verb.en)}`, ty: 'neg' },
        { t: `________ ${subj.toLowerCase()} ________ (${verb.es}) at that moment?`, a: `${bePast === 'was' ? 'Was' : 'Were'}`, ty: 'q' },
      ];
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      return { prompt: tpl.t, answer: tpl.a, type: tpl.ty };
    }

    // ── Future Simple ───────────────────────────────────────────
    case 'future-simple': {
      const templates = [
        { t: `${subj} ________ (${verb.es}) tomorrow.`, a: `will ${verb.en}`, ty: 'aff' },
        { t: `${subj} ________ (${verb.es}) next week.`, a: `will ${verb.en}`, ty: 'aff' },
        { t: `I think it ________ (${verb.es}) soon.`, a: `will ${verb.en}`, ty: 'aff' },
        { t: `${subj} ________ (not / ${verb.es}) tomorrow.`, a: `won't ${verb.en}`, ty: 'neg' },
        { t: `________ ${subj.toLowerCase()} ________ (${verb.es}) later?`, a: `Will`, ty: 'q' },
      ];
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      return { prompt: tpl.t, answer: tpl.a, type: tpl.ty };
    }

    // ── Going To ────────────────────────────────────────────────
    case 'going-to': {
      const templates = [
        { t: `${subj} ________ (${verb.es}) next year.`, a: `${bePresent} going to ${verb.en}`, ty: 'aff' },
        { t: `${subj} ________ (${verb.es}) this weekend.`, a: `${bePresent} going to ${verb.en}`, ty: 'aff' },
        { t: `Look at the sky! It ________ (rain).`, a: `is going to rain`, ty: 'aff' },
        { t: `${subj} ________ (not / ${verb.es}) tomorrow.`, a: `${bePresent} not going to ${verb.en}`, ty: 'neg' },
        { t: `________ ${subj.toLowerCase()} ________ (${verb.es}) this weekend?`, a: `${bePresent === 'am' ? 'Are' : bePresent}`, ty: 'q' },
      ];
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      return { prompt: tpl.t, answer: tpl.a, type: tpl.ty };
    }

    // ── Present Perfect ─────────────────────────────────────────
    case 'present-perfect': {
      const templates = [
        { t: `${subj} ________ (${verb.es}) already.`, a: `${haveForm} ${verb.participle}`, ty: 'aff' },
        { t: `${subj} just ________ (${verb.es}) it.`, a: `${haveForm} ${verb.participle}`, ty: 'aff' },
        { t: `${subj} never ________ (${verb.es}) that.`, a: `${haveForm} ${verb.participle}`, ty: 'aff' },
        { t: `${subj} ________ (not / ${verb.es}) yet.`, a: `${haveForm} not ${verb.participle}`, ty: 'neg' },
        { t: `________ ${subj.toLowerCase()} ever ________ (${verb.es}) this?`, a: `${haveForm === 'has' ? 'Has' : 'Have'}`, ty: 'q' },
      ];
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      return { prompt: tpl.t, answer: tpl.a, type: tpl.ty };
    }

    default:
      return { prompt: `${subj} ________ (${verb.es}).`, answer: verb.en, type: 'aff' };
  }
}

// ─── LESSONS DATA ────────────────────────────────────────────────
const LESSONS: Lesson[] = [
  {
    id: 'present-simple',
    name: 'Present Simple',
    nameEs: 'Presente Simple',
    explanation:
      'Se usa para hablar de rutinas, hechos generales y verdades universales. Acciones que ocurren regularmente o que siempre son verdad.',
    structure: 'Sujeto + verbo (con -s/-es para he/she/it)',
    examples: [
      { label: 'Rutina', sentence: 'I **wake up** at 7 AM every day.' },
      { label: 'Hecho general', sentence: 'Water **boils** at 100°C.' },
      { label: 'Verbo terminado en -s/-ch/-sh/-o/-x → +es', sentence: 'She **watches** TV at night.' },
      { label: 'Verbo terminado en consonante + -y → -ies', sentence: 'He **studies** English.' },
      { label: 'Verbo terminado en vocal + -y → +s', sentence: 'She **plays** tennis on Saturdays.' },
      { label: 'Negativa', sentence: 'I **don\'t** like coffee.' },
      { label: 'Pregunta', sentence: '**Do** you speak Spanish?' },
    ],
    keywords: ['every day', 'always', 'usually', 'sometimes', 'never', 'on Mondays', 'once a week', 'often'],
    formRules: [
      'He/She/It → verb + -s (work → works)',
      'He/She/It → verb + -es si termina en -o, -s, -ch, -sh, -x, -z (go → goes, watch → watches)',
      'Con -y: si hay CONSONANTE antes → -ies (study → studies). Si hay VOCAL antes → +s (play → plays)',
      'I/You/We/They → verbo SIN cambios',
      'Negativa: don\'t / doesn\'t + verbo BASE. Pregunta: Do/Does + sujeto + verbo BASE',
    ],
    commonMistakes: [
      { mistake: 'He work every day', correct: 'He works every day', why: 'Con he/she/it, el verbo necesita -s.' },
      { mistake: 'He doesn\'t works', correct: 'He doesn\'t work', why: 'Después de doesn\'t el verbo va en BASE, sin -s.' },
      { mistake: 'She plaies tennis', correct: 'She plays tennis', why: 'Play termina en vocal + y, así que solo +s. La regla -ies es para consonante + y.' },
      { mistake: 'Do he works?', correct: 'Does he work?', why: 'Con he/she/it se usa DOES, no DO. Y el verbo va sin -s.' },
    ],
    whenToUse: [
      { scenario: 'Hablar de tu rutina diaria', example: 'I wake up at 7, eat breakfast, and go to work.' },
      { scenario: 'Hablar de hechos científicos o verdades universales', example: 'The sun rises in the east.' },
      { scenario: 'Describir hábitos o frecuencias', example: 'She always drinks tea in the morning.' },
    ],
  },
  {
    id: 'present-continuous',
    name: 'Present Continuous',
    nameEs: 'Presente Continuo / Progresivo',
    explanation:
      'Se usa para acciones que están ocurriendo AHORA mismo o alrededor del momento actual (no necesariamente en este segundo). También para planes futuros cercanos.',
    structure: 'Sujeto + am/is/are + verbo(-ing)',
    examples: [
      { label: 'Acción ahora mismo', sentence: 'I **am writing** an email right now.' },
      { label: 'Acción alrededor del ahora', sentence: 'She **is studying** for her exam this week.' },
      { label: 'Plan futuro cercano', sentence: 'We **are meeting** friends tonight.' },
      { label: 'Negativa', sentence: 'He **is not** (isn\'t) **working** today.' },
      { label: 'Pregunta', sentence: '**Are** you **coming** to the party?' },
    ],
    keywords: ['now', 'right now', 'at the moment', 'today', 'this week', 'currently', 'look!', 'listen!'],
    formRules: [
      'I → am | He/She/It → is | You/We/They → are',
      'Verbo + -ing (work → working, play → playing)',
      'Verbo termina en -e → quita -e + -ing (make → making, take → taking)',
      'Verbo CVC → dobla consonante + -ing (run → running, swim → swimming)',
      '🔴 No se usa con stative verbs: know, believe, love, hate, want, need, understand',
    ],
    commonMistakes: [
      { mistake: 'I am work right now', correct: 'I am working right now', why: 'Present continuous necesita el verbo en -ing, no base.' },
      { mistake: 'She is know the answer', correct: 'She knows the answer', why: '"Know" es un stative verb. No usamos continuous con verbos de estado mental.' },
      { mistake: 'He is working every day', correct: 'He works every day', why: 'Si es una rutina, usa Present Simple. Continuous es para AHORA.' },
    ],
    whenToUse: [
      { scenario: 'Algo que está pasando en este momento', example: 'Please be quiet. I\'m on the phone.' },
      { scenario: 'Planes ya organizados para el futuro cercano', example: 'I\'m seeing the dentist tomorrow at 10.' },
      { scenario: 'Situaciones temporales', example: 'She\'s living with her parents until she finds an apartment.' },
    ],
  },
  {
    id: 'past-simple',
    name: 'Past Simple',
    nameEs: 'Pasado Simple',
    explanation:
      'Se usa para acciones completadas en el pasado. Indica que la acción comenzó y terminó en un momento específico.',
    structure: 'Sujeto + verbo en pasado (-ed o irregular)',
    examples: [
      { label: 'Verbo regular', sentence: 'I **walked** to work yesterday.' },
      { label: 'Verbo irregular', sentence: 'She **went** to the store.' },
      { label: 'Otro irregular', sentence: 'They **ate** pizza for dinner.' },
      { label: 'Negativa', sentence: 'I **didn\'t** go to the party.' },
      { label: 'Pregunta', sentence: '**Did** you see the movie?' },
    ],
    keywords: ['yesterday', 'last night', 'last week', 'in 2020', '2 days ago', 'when I was a child', 'then'],
    formRules: [
      'Verbos regulares → verbo + -ed (work → worked)',
      'Verbos terminados en -e → + -d (like → liked)',
      'Verbo termina en consonante + -y → -ied (study → studied)',
      'Verbos CVC → dobla consonante + -ed (stop → stopped)',
      'Verbos irregulares: hay que memorizarlos (go→went, eat→ate, buy→bought)',
      'Negativa: didn\'t + verbo BASE. Pregunta: Did + sujeto + verbo BASE',
    ],
    commonMistakes: [
      { mistake: 'I didn\'t went', correct: 'I didn\'t go', why: 'Después de "didn\'t" el verbo va en BASE, no en pasado.' },
      { mistake: 'Did you went?', correct: 'Did you go?', why: 'En preguntas, "did" ya indica pasado. El verbo va en BASE.' },
      { mistake: 'I work yesterday', correct: 'I worked yesterday', why: 'Para pasado con verbos regulares, necesitas -ed.' },
    ],
    whenToUse: [
      { scenario: 'Algo que pasó en un momento específico del pasado', example: 'I visited my grandmother last weekend.' },
      { scenario: 'Una serie de acciones en el pasado (historia/narración)', example: 'He woke up, took a shower, and left the house.' },
      { scenario: 'Una acción que ya terminó', example: 'She lived in London for 3 years (but she doesn\'t anymore).' },
    ],
  },
  {
    id: 'past-continuous',
    name: 'Past Continuous',
    nameEs: 'Pasado Continuo',
    explanation:
      'Se usa para acciones que estaban en progreso en un momento específico del pasado. A menudo se combina con Past Simple para acciones interrumpidas.',
    structure: 'Sujeto + was/were + verbo(-ing)',
    examples: [
      { label: 'En progreso en un momento', sentence: 'I **was watching** TV at 8 PM.' },
      { label: 'Interrumpido por otra acción', sentence: 'She **was cooking** dinner when I arrived.' },
      { label: 'Dos acciones simultáneas', sentence: 'While he **was reading**, she **was listening** to music.' },
      { label: 'Negativa', sentence: 'They **weren\'t sleeping** when I came home.' },
      { label: 'Pregunta', sentence: '**Were** you **working** at 5 PM?' },
    ],
    keywords: ['at 8 PM', 'when', 'while', 'all morning', 'at that moment', 'as'],
    formRules: [
      'I/He/She/It → was | You/We/They → were',
      'Mismas reglas de -ing que Present Continuous',
      '"When" + Past Simple (acción corta): "I was eating when you called"',
      '"While" + Past Continuous (acción larga): "While I was sleeping, someone knocked"',
    ],
    commonMistakes: [
      { mistake: 'I was work when you called', correct: 'I was working when you called', why: 'Después de was/were, el verbo necesita -ing.' },
      { mistake: 'I was going to the store yesterday', correct: 'I went to the store yesterday', why: 'Si la acción está completa, usa Past Simple. Past Continuous = en progreso.' },
      { mistake: 'While I ate, she called', correct: 'While I was eating, she called', why: '"While" introduce la acción larga/en progreso, que va en Past Continuous.' },
    ],
    whenToUse: [
      { scenario: 'Describir lo que estaba pasando en un momento específico', example: 'At 10 PM, I was still doing my homework.' },
      { scenario: 'Una acción larga interrumpida por una acción corta', example: 'I was taking a shower when the doorbell rang.' },
      { scenario: 'Dos acciones largas al mismo tiempo', example: 'While I was cooking, my husband was setting the table.' },
    ],
  },
  {
    id: 'future-simple',
    name: 'Future Simple (Will)',
    nameEs: 'Futuro Simple (Will)',
    explanation:
      'Se usa para decisiones espontáneas, predicciones sin evidencia, promesas, ofrecimientos y hechos futuros.',
    structure: 'Sujeto + will + verbo base',
    examples: [
      { label: 'Decisión espontánea', sentence: 'The phone is ringing. I\'ll get it.' },
      { label: 'Predicción', sentence: 'I think it **will rain** tomorrow.' },
      { label: 'Promesa', sentence: 'I **will always love** you.' },
      { label: 'Ofrecimiento', sentence: 'I **will help** you with that.' },
      { label: 'Negativa', sentence: 'I **won\'t** tell anyone.' },
      { label: 'Pregunta', sentence: '**Will** you come to the party?' },
    ],
    keywords: ['tomorrow', 'next week', 'soon', 'later', 'someday', 'I think', 'probably', 'I promise', 'I\'ll'],
    formRules: [
      'Will + verbo BASE — el verbo NO cambia para ninguna persona',
      'Contracción: will → \'ll (I\'ll, you\'ll, she\'ll)',
      'Negativa: will not → won\'t',
      'Usa will para decisiones en el momento: "I\'ll take this one."',
      'Usa will para predicciones basadas en opinión: "I think she\'ll pass the exam."',
    ],
    commonMistakes: [
      { mistake: 'I will to go tomorrow', correct: 'I will go tomorrow', why: 'Después de will, el verbo va en BASE. No se usa "to".' },
      { mistake: 'She will goes', correct: 'She will go', why: 'Will no cambia con he/she/it. El verbo siempre va en base.' },
      { mistake: 'I will travel next year (cuando es un plan)', correct: 'I\'m going to travel next year', why: 'Si es un plan decidido antes, usa "going to". "Will" es para decisiones espontáneas.' },
    ],
    whenToUse: [
      { scenario: 'Decidir algo en el momento de hablar', example: 'Wait, I forgot my keys. I\'ll go back and get them.' },
      { scenario: 'Hacer una predicción sin evidencia concreta', example: 'I think Brazil will win the World Cup.' },
      { scenario: 'Ofrecer ayuda voluntariamente', example: 'Don\'t worry, I\'ll carry that for you.' },
    ],
  },
  {
    id: 'going-to',
    name: 'Be Going To',
    nameEs: 'Ir a (Futuro Planificado)',
    explanation:
      'Se usa para planes e intenciones decididas ANTES del momento de hablar, y para predicciones basadas en EVIDENCIA VISIBLE.',
    structure: 'Sujeto + am/is/are + going to + verbo base',
    examples: [
      { label: 'Plan ya decidido', sentence: 'I **am going to travel** to Spain next year.' },
      { label: 'Intención clara', sentence: 'She **is going to study** medicine at university.' },
      { label: 'Evidencia visible', sentence: 'Look at those clouds! It **is going to rain**.' },
      { label: 'Negativa', sentence: 'I **am not going to buy** that car.' },
      { label: 'Pregunta', sentence: '**Are** you **going to apply** for the job?' },
    ],
    keywords: ['plan to', 'intend to', 'next year', 'this weekend', 'tonight', 'look!', 'I\'ve decided'],
    formRules: [
      'am/is/are + going to + verbo BASE',
      'Con I → am. Con he/she/it → is. Con you/we/they → are',
      'Usa going to para PLANES PREVIOS: decididos antes de hablar',
      'Usa going to para EVIDENCIA: ves señales físicas de lo que va a pasar',
      'Diferencia clave: "I\'ll help" (espontáneo) vs "I\'m going to help" (planeado)',
    ],
    commonMistakes: [
      { mistake: 'I\'m going to studying', correct: 'I\'m going to study', why: 'Después de "going to", el verbo va en BASE, no en -ing.' },
      { mistake: 'She going to travel', correct: 'She is going to travel', why: 'Siempre necesitas el verbo "to be" (am/is/are) antes de "going to".' },
      { mistake: 'I will visit my family (cuando ya compré el boleto)', correct: 'I\'m going to visit my family', why: 'Si ya tienes el plan concreto, usa going to. "Will" es para decisiones del momento.' },
    ],
    whenToUse: [
      { scenario: 'Un plan que ya tienes decidido y preparado', example: 'We\'re going to move to a new apartment next month. We already signed the contract.' },
      { scenario: 'Una predicción basada en lo que ves', example: 'Be careful! You\'re going to drop your phone.' },
      { scenario: 'Una intención firme', example: 'I\'m going to learn English this year. I\'ve already started.' },
    ],
  },
  {
    id: 'present-perfect',
    name: 'Present Perfect',
    nameEs: 'Presente Perfecto',
    explanation:
      'Conecta el pasado con el presente. Se usa para experiencias de vida, cambios, acciones que empezaron en el pasado y continúan, o acciones pasadas con resultado presente. No importa CUÁNDO pasó, sino que pasó.',
    structure: 'Sujeto + have/has + participio pasado',
    examples: [
      { label: 'Experiencia de vida', sentence: 'I **have visited** Paris twice.' },
      { label: 'Resultado presente', sentence: 'She **has lost** her keys. (She can\'t find them now)' },
      { label: 'Desde/hasta ahora', sentence: 'They **have lived** here for 5 years.' },
      { label: 'Con "just" (recién)', sentence: 'I **have just finished** my homework.' },
      { label: 'Negativa', sentence: 'I **haven\'t seen** that movie yet.' },
      { label: 'Pregunta', sentence: '**Have** you ever **eaten** sushi?' },
    ],
    keywords: ['ever', 'never', 'already', 'yet', 'just', 'for', 'since', 'so far', 'recently'],
    formRules: [
      'I/You/We/They → have | He/She/It → has',
      'Participio pasado: verbos regulares = -ed. Verbos irregulares: hay que memorizarlos',
      '"For" + duración: for 3 years, for 2 hours, for a long time',
      '"Since" + punto de inicio: since 2020, since Monday, since I was a child',
      '"Ever" = en preguntas (Have you ever...) | "Never" = negativo (I have never...)',
      '"Just" = acción recién terminada | "Already" = antes de lo esperado | "Yet" = en negativas/preguntas',
    ],
    commonMistakes: [
      { mistake: 'I have went to the store', correct: 'I have gone to the store', why: '"Went" es pasado simple. "Gone" es el participio para present perfect.' },
      { mistake: 'I have seen it yesterday', correct: 'I saw it yesterday', why: 'Si dices cuándo (yesterday, last week), usa Past Simple no Present Perfect.' },
      { mistake: 'He has 5 years in this company', correct: 'He has worked here for 5 years', why: 'En inglés necesitas el verbo. "Has" solo no significa "tiene trabajando".' },
      { mistake: 'I have visited Paris last year', correct: 'I visited Paris last year', why: 'Present Perfect no se usa con tiempo específico. "Last year" requiere Past Simple.' },
    ],
    whenToUse: [
      { scenario: 'Hablar de experiencias sin decir cuándo', example: 'I\'ve tried Italian food. It\'s delicious.' },
      { scenario: 'Algo que empezó en el pasado y sigue ahora', example: 'I\'ve known her since we were in school.' },
      { scenario: 'Noticias o cambios recientes', example: 'The government has announced a new law.' },
      { scenario: 'Con "ever/never" en preguntas sobre experiencia', example: 'Have you ever been to Japan? — No, I\'ve never been.' },
    ],
  },
];

// ─── SHOW LESSON ─────────────────────────────────────────────────
function showLesson(lesson: Lesson): void {
  console.clear();
  console.log(chalk.magenta.bold(`\n📚 ${lesson.name} — ${lesson.nameEs}`));
  console.log(chalk.blue('═'.repeat(56)));

  console.log(chalk.cyan.bold('\n📖 What is it?'));
  lesson.explanation.split('. ').forEach((s) => console.log(chalk.white(`  ${s.trim()}.`)));

  console.log(chalk.cyan.bold('\n📐 Structure:'));
  console.log(chalk.yellow(`  ${lesson.structure}`));

  console.log(chalk.cyan.bold('\n📝 Examples:'));
  lesson.examples.forEach((ex) => {
    console.log(chalk.gray(`  ${ex.label}:`) + chalk.white(` ${ex.sentence}`));
  });

  console.log(chalk.cyan.bold('\n🔑 Key Words:'));
  console.log(chalk.yellow(`  ${lesson.keywords.join(' · ')}`));

  console.log(chalk.cyan.bold('\n📋 Rules:'));
  lesson.formRules.forEach((rule, i) => {
    console.log(chalk.white(`  ${i + 1}. ${rule}`));
  });

  console.log(chalk.cyan.bold('\n⚠️  Common Mistakes (Errores típicos):'));
  lesson.commonMistakes.forEach((m, i) => {
    console.log(chalk.white(`  ${i + 1}. "${chalk.red(m.mistake)}" → "${chalk.green(m.correct)}"`));
    console.log(chalk.gray(`     💡 ${m.why}`));
  });

  console.log(chalk.cyan.bold('\n🎯 When to Use (Cuándo usarlo):'));
  lesson.whenToUse.forEach((w, i) => {
    console.log(chalk.white(`  ${i + 1}. ${w.scenario}:`));
    console.log(chalk.gray(`     "${w.example}"`));
  });
}

// ─── GENERATE EXERCISE ──────────────────────────────────────────
async function generateExercise(lesson: Lesson): Promise<void> {
  const { exerciseCount } = await inquirer.prompt([
    {
      type: 'number',
      name: 'exerciseCount',
      message: 'How many exercises? (Enter a number between 2 and 6):',
      default: 3,
      validate: (input: number) => Number.isInteger(input) && input >= 2 && input <= 6,
    },
  ]);

  const shuffled = [...VERBS].sort(() => Math.random() - 0.5).slice(0, exerciseCount);

  console.log(chalk.cyan.bold(`\n--- ✍️  ${lesson.name} Practice ---`));
  console.log(chalk.gray('Write the correct verb form. Type ? for a hint.\n'));

  let correctCount = 0;

  for (const verb of shuffled) {
    let exercise: GeneratedExercise;

    // Regenerate until we get a fresh exercise (avoid duplicates in same session)
    do {
      exercise = makeExercise(lesson.id, verb);
    } while (exercise.prompt.includes('undefined'));

    const typeLabel = exercise.type === 'aff' ? '✅ affirmative' : exercise.type === 'neg' ? '❌ negative' : '❓ question';
    const { userAnswer } = await inquirer.prompt([
      {
        type: 'input',
        name: 'userAnswer',
        message: chalk.white(`${chalk.yellow(typeLabel)}\n${exercise.prompt}`),
      },
    ]);

    if (userAnswer.trim() === '?') {
      console.log(chalk.blue(`  Hint: "${exercise.answer}"\n`));
      continue;
    }

    if (userAnswer.toLowerCase().trim() === exercise.answer.toLowerCase().trim()) {
      console.log(chalk.green('  ✔ Correct!\n'));
      correctCount++;
    } else {
      console.log(chalk.red(`  ✘ The correct answer is: "${chalk.bold(exercise.answer)}"\n`));
    }
  }

  const xp = correctCount * 15;
  addXP(xp);
  console.log(chalk.green.bold(`\n✔ ${correctCount}/${shuffled.length} correct! +${xp} XP\n`));
}

// ─── MAIN ────────────────────────────────────────────────────────
export async function interactiveGrammarLesson(): Promise<void> {
  console.log(chalk.magenta.bold('\n📚 English Grammar Lessons\n'));
  console.log(chalk.gray('Learn English tenses with clear explanations, examples, and practice exercises.\n'));

  while (true) {
    const { lessonId } = await inquirer.prompt([
      {
        type: 'select',
        name: 'lessonId',
        message: 'Select a tense to study:',
        choices: [
          ...LESSONS.map((l) => ({ name: `${l.name} — ${l.nameEs}`, value: l.id })),
          new inquirer.Separator(),
          { name: '↩️  Back to main menu', value: 'back' },
        ],
      },
    ]);

    if (lessonId === 'back') return;

    const lesson = LESSONS.find((l) => l.id === lessonId)!;
    showLesson(lesson);

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '✍️  Practice with exercises', value: 'practice' },
          { name: '📖 Read the lesson again', value: 'read' },
          { name: '↩️  Back to lesson list', value: 'back' },
        ],
      },
    ]);

    if (action === 'back') continue;
    if (action === 'practice') {
      await generateExercise(lesson);
    }
  }
}
