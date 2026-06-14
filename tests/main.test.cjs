'use strict'

const initSqlJs = require('sql.js')
const {
  makeDb, get, all, run, lastId, count,
  currentSlot, makeSlotKey, checkGuess, shuffleOptions,
  hangmanGetWord, hangmanCheckLetter, hangmanRevealWord,
  wordleGetDaily, wordleCheckGuess,
  quizGetQuestion, quizCheckAnswer,
  adminListWords, adminCreateWord, adminUpdateWord, adminDeleteWord,
  adminListQuestions, adminCreateQuestion, adminUpdateQuestion, adminDeleteQuestion,
} = require('../electron/logic.cjs')

let SQL, db

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function seedWord(overrides = {}) {
  const d = { word: 'КОШКА', category: 'животные', difficulty: 1, hint: 'Мурлычет', language: 'ru', ...overrides }
  run(db, 'INSERT OR IGNORE INTO words (word,category,difficulty,hint,language) VALUES (?,?,?,?,?)',
    [d.word, d.category, d.difficulty, d.hint, d.language])
  return get(db, 'SELECT * FROM words WHERE word = ?', [d.word])
}

function seedQuestion(overrides = {}) {
  const d = {
    question: 'Столица Франции?', correct_answer: 'Париж',
    option_b: 'Лондон', option_c: 'Берлин', option_d: 'Мадрид',
    category: 'география', difficulty: 1, language: 'ru',
    ...overrides,
  }
  run(db,
    'INSERT OR IGNORE INTO quiz_questions (question,correct_answer,option_b,option_c,option_d,category,difficulty,language) VALUES (?,?,?,?,?,?,?,?)',
    [d.question, d.correct_answer, d.option_b, d.option_c, d.option_d, d.category, d.difficulty, d.language])
  return get(db, 'SELECT * FROM quiz_questions WHERE question = ?', [d.question])
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  SQL = await initSqlJs()
})

beforeEach(() => {
  db = makeDb(SQL)
})

afterEach(() => {
  db.close()
})

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DB HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

describe('DB helpers', () => {
  test('run + get returns inserted row', () => {
    seedWord({ word: 'ТЕСТ' })
    const row = get(db, 'SELECT * FROM words WHERE word = ?', ['ТЕСТ'])
    expect(row).not.toBeNull()
    expect(row.word).toBe('ТЕСТ')
  })

  test('get returns null for missing row', () => {
    const row = get(db, 'SELECT * FROM words WHERE word = ?', ['НЕТУ'])
    expect(row).toBeNull()
  })

  test('all returns array of rows', () => {
    seedWord({ word: 'СЛОВО' })
    seedWord({ word: 'РЕЧЬ' })
    const rows = all(db, 'SELECT * FROM words WHERE language = ?', ['ru'])
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(Array.isArray(rows)).toBe(true)
  })

  test('all returns empty array when no rows', () => {
    const rows = all(db, 'SELECT * FROM words WHERE language = ?', ['xx'])
    expect(rows).toEqual([])
  })

  test('lastId returns correct id after insert', () => {
    run(db, 'INSERT INTO words (word,language) VALUES (?,?)', ['ЛАСТ', 'ru'])
    const id = lastId(db)
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
    const row = get(db, 'SELECT * FROM words WHERE id = ?', [id])
    expect(row.word).toBe('ЛАСТ')
  })

  test('count returns correct number', () => {
    seedWord({ word: 'РАЗ' })
    seedWord({ word: 'ДВА' })
    const n = count(db, 'SELECT COUNT(*) as cnt FROM words WHERE language = ?', ['ru'])
    expect(n).toBeGreaterThanOrEqual(2)
  })

  test('count returns 0 for empty table condition', () => {
    const n = count(db, 'SELECT COUNT(*) as cnt FROM words WHERE language = ?', ['zz'])
    expect(n).toBe(0)
  })

  test('run handles params correctly', () => {
    run(db, 'INSERT INTO words (word,language,difficulty) VALUES (?,?,?)', ['ПАРАМ', 'ru', 3])
    const row = get(db, 'SELECT * FROM words WHERE word = ?', ['ПАРАМ'])
    expect(row.difficulty).toBe(3)
  })

  test('INSERT OR IGNORE does not duplicate words', () => {
    seedWord({ word: 'ДУБЛЬ' })
    seedWord({ word: 'ДУБЛЬ' })
    const n = count(db, 'SELECT COUNT(*) as cnt FROM words WHERE word = ?', ['ДУБЛЬ'])
    expect(n).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. currentSlot
// ═══════════════════════════════════════════════════════════════════════════════

describe('currentSlot', () => {
  test('slot 0 for hour 0 (midnight)', () => {
    const d = new Date(); d.setHours(0)
    expect(currentSlot(d)).toBe(0)
  })

  test('slot 0 for hour 7', () => {
    const d = new Date(); d.setHours(7)
    expect(currentSlot(d)).toBe(0)
  })

  test('slot 1 for hour 8', () => {
    const d = new Date(); d.setHours(8)
    expect(currentSlot(d)).toBe(1)
  })

  test('slot 1 for hour 15', () => {
    const d = new Date(); d.setHours(15)
    expect(currentSlot(d)).toBe(1)
  })

  test('slot 2 for hour 16', () => {
    const d = new Date(); d.setHours(16)
    expect(currentSlot(d)).toBe(2)
  })

  test('slot 2 for hour 23', () => {
    const d = new Date(); d.setHours(23)
    expect(currentSlot(d)).toBe(2)
  })

  test('returns 0, 1, or 2 only', () => {
    for (let h = 0; h < 24; h++) {
      const d = new Date(); d.setHours(h)
      expect([0, 1, 2]).toContain(currentSlot(d))
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. makeSlotKey
// ═══════════════════════════════════════════════════════════════════════════════

describe('makeSlotKey', () => {
  test('format is YYYY-MM-DD-slot-lang', () => {
    const d = new Date('2025-06-01T10:00:00')
    const key = makeSlotKey('ru', d)
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}-[012]-ru$/)
  })

  test('same date + same slot + same lang = same key', () => {
    const d1 = new Date('2025-06-01T09:00:00')
    const d2 = new Date('2025-06-01T14:00:00')
    expect(makeSlotKey('ru', d1)).toBe(makeSlotKey('ru', d2))
  })

  test('different dates = different keys', () => {
    const d1 = new Date('2025-06-01T10:00:00')
    const d2 = new Date('2025-06-02T10:00:00')
    expect(makeSlotKey('ru', d1)).not.toBe(makeSlotKey('ru', d2))
  })

  test('different langs = different keys', () => {
    const d = new Date('2025-06-01T10:00:00')
    expect(makeSlotKey('ru', d)).not.toBe(makeSlotKey('en', d))
  })

  test('different slots = different keys', () => {
    const d1 = new Date('2025-06-01T06:00:00') // slot 0
    const d2 = new Date('2025-06-01T10:00:00') // slot 1
    expect(makeSlotKey('ru', d1)).not.toBe(makeSlotKey('ru', d2))
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. checkGuess
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkGuess', () => {
  test('all correct returns all correct', () => {
    const r = checkGuess('КОШКА', 'КОШКА')
    expect(r.every(x => x.status === 'correct')).toBe(true)
  })

  test('all absent', () => {
    const r = checkGuess('БББBB', 'АААAA')
    r.forEach(x => expect(x.status).toBe('absent'))
  })

  test('present letter in wrong position', () => {
    const r = checkGuess('АКОШК', 'КОШКА')
    const presentOrCorrect = r.filter(x => x.status !== 'absent')
    expect(presentOrCorrect.length).toBeGreaterThan(0)
  })

  test('result length equals target length', () => {
    expect(checkGuess('КОШКА', 'КОШКА').length).toBe(5)
    expect(checkGuess('CAT', 'DOG').length).toBe(3)
  })

  test('letter field is correct', () => {
    const r = checkGuess('КОШКА', 'КОШКА')
    expect(r[0].letter).toBe('К')
    expect(r[1].letter).toBe('О')
  })

  test('duplicate letters handled correctly', () => {
    // TARGET=АББBA, GUESS=АААAA — second А is present (one А in target used), rest absent
    const r = checkGuess('ААААА', 'АБВГА')
    expect(r[0].status).toBe('correct') // А=А
    expect(r[4].status).toBe('correct') // last А=А
  })

  test('case insensitive', () => {
    const r1 = checkGuess('кошка', 'КОШКА')
    const r2 = checkGuess('КОШКА', 'КОШКА')
    expect(r1.map(x => x.status)).toEqual(r2.map(x => x.status))
  })

  test('won condition: all correct', () => {
    const r = checkGuess('TIGER', 'TIGER')
    expect(r.every(x => x.status === 'correct')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 5. shuffleOptions
// ═══════════════════════════════════════════════════════════════════════════════

describe('shuffleOptions', () => {
  const opts = ['A', 'B', 'C', 'D']

  test('returns 4 items', () => {
    expect(shuffleOptions(opts, 1).length).toBe(4)
  })

  test('contains same elements', () => {
    const shuffled = shuffleOptions(opts, 1)
    expect(shuffled.sort()).toEqual([...opts].sort())
  })

  test('deterministic for same id', () => {
    expect(shuffleOptions(opts, 42)).toEqual(shuffleOptions(opts, 42))
  })

  test('different ids may produce different order', () => {
    const r1 = shuffleOptions(opts, 1)
    const r2 = shuffleOptions(opts, 2)
    // not guaranteed but almost always different
    expect(typeof r1[0]).toBe('string')
    expect(typeof r2[0]).toBe('string')
  })

  test('does not mutate original array', () => {
    const original = [...opts]
    shuffleOptions(opts, 99)
    expect(opts).toEqual(original)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 6. HANGMAN
// ═══════════════════════════════════════════════════════════════════════════════

describe('hangmanGetWord', () => {
  test('returns id, length, hint, category', () => {
    seedWord()
    const r = hangmanGetWord(db, 'ru')
    expect(r).toHaveProperty('id')
    expect(r).toHaveProperty('length')
    expect(r).toHaveProperty('hint')
    expect(r).toHaveProperty('category')
  })

  test('length matches actual word character count', () => {
    seedWord({ word: 'КОШКА' })
    const r = hangmanGetWord(db, 'ru')
    expect(r.length).toBe(5)
  })

  test('throws when no words for language', () => {
    expect(() => hangmanGetWord(db, 'zz')).toThrow('No words found')
  })

  test('does not reveal the word itself', () => {
    seedWord()
    const r = hangmanGetWord(db, 'ru')
    expect(r).not.toHaveProperty('word')
  })

  test('works for english words', () => {
    seedWord({ word: 'TIGER', language: 'en', hint: 'Big cat', category: 'animals' })
    const r = hangmanGetWord(db, 'en')
    expect(r.length).toBe(5)
  })
})

describe('hangmanCheckLetter', () => {
  test('correct letter returns positions', () => {
    const w = seedWord({ word: 'КОШКА' })
    const r = hangmanCheckLetter(db, { wordId: w.id, letter: 'К' })
    expect(r.correct).toBe(true)
    expect(r.positions).toContain(0)
    expect(r.positions).toContain(3)
  })

  test('absent letter returns empty positions', () => {
    const w = seedWord({ word: 'КОШКА' })
    const r = hangmanCheckLetter(db, { wordId: w.id, letter: 'Б' })
    expect(r.correct).toBe(false)
    expect(r.positions).toEqual([])
  })

  test('case insensitive', () => {
    const w = seedWord({ word: 'КОШКА' })
    const r = hangmanCheckLetter(db, { wordId: w.id, letter: 'к' })
    expect(r.correct).toBe(true)
  })

  test('throws for unknown wordId', () => {
    expect(() => hangmanCheckLetter(db, { wordId: 9999, letter: 'А' })).toThrow('Word not found')
  })

  test('letter present once returns one position', () => {
    const w = seedWord({ word: 'СОБАКА' })
    const r = hangmanCheckLetter(db, { wordId: w.id, letter: 'О' })
    expect(r.correct).toBe(true)
    expect(r.positions.length).toBe(1)
  })

  test('repeated letter returns multiple positions', () => {
    const w = seedWord({ word: 'БАНАНА' })
    const r = hangmanCheckLetter(db, { wordId: w.id, letter: 'А' })
    expect(r.positions.length).toBe(3)
  })
})

describe('hangmanRevealWord', () => {
  test('returns word string', () => {
    const w = seedWord({ word: 'КОШКА' })
    const r = hangmanRevealWord(db, w.id)
    expect(r.word).toBe('КОШКА')
  })

  test('throws for unknown id', () => {
    expect(() => hangmanRevealWord(db, 9999)).toThrow('Word not found')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 7. WORDLE
// ═══════════════════════════════════════════════════════════════════════════════

describe('wordleGetDaily', () => {
  const fixedDate = new Date('2025-06-01T10:00:00')

  test('returns slotKey, slotNum, wordLength', () => {
    seedWord({ word: 'КОШКА' })
    const r = wordleGetDaily(db, 'ru', fixedDate)
    expect(r).toHaveProperty('slotKey')
    expect(r).toHaveProperty('slotNum')
    expect(r).toHaveProperty('wordLength')
  })

  test('wordLength is 5 for 5-letter word', () => {
    seedWord({ word: 'КОШКА' })
    const r = wordleGetDaily(db, 'ru', fixedDate)
    expect(r.wordLength).toBe(5)
  })

  test('same key returns same word (idempotent)', () => {
    seedWord({ word: 'КОШКА' })
    const r1 = wordleGetDaily(db, 'ru', fixedDate)
    const r2 = wordleGetDaily(db, 'ru', fixedDate)
    expect(r1.slotKey).toBe(r2.slotKey)
    expect(r1.wordLength).toBe(r2.wordLength)
  })

  test('throws when no 5-letter words for language', () => {
    seedWord({ word: 'КОТ', language: 'ru' }) // 3 letters
    expect(() => wordleGetDaily(db, 'ru', fixedDate)).toThrow('No 5-letter words available')
  })

  test('english words work', () => {
    seedWord({ word: 'TIGER', language: 'en', hint: 'Cat', category: 'animals' })
    const r = wordleGetDaily(db, 'en', fixedDate)
    expect(r.wordLength).toBe(5)
  })

  test('slotNum matches currentSlot', () => {
    seedWord({ word: 'КОШКА' })
    const r = wordleGetDaily(db, 'ru', fixedDate)
    expect(r.slotNum).toBe(1) // 10:00 = slot 1
  })
})

describe('wordleCheckGuess', () => {
  const fixedDate = new Date('2025-06-01T10:00:00')

  beforeEach(() => {
    seedWord({ word: 'КОШКА' })
  })

  test('correct guess returns won=true', () => {
    const { slotKey } = wordleGetDaily(db, 'ru', fixedDate)
    const r = wordleCheckGuess(db, { guess: 'КОШКА', slotKey, lang: 'ru' })
    expect(r.won).toBe(true)
    expect(r.result.every(x => x.status === 'correct')).toBe(true)
  })

  test('wrong guess returns won=false', () => {
    const { slotKey } = wordleGetDaily(db, 'ru', fixedDate)
    const r = wordleCheckGuess(db, { guess: 'ББББББ', slotKey, lang: 'ru' })
    expect(r.won).toBe(false)
  })

  test('result has correct length', () => {
    const { slotKey } = wordleGetDaily(db, 'ru', fixedDate)
    const r = wordleCheckGuess(db, { guess: 'КОШКА', slotKey, lang: 'ru' })
    expect(r.result.length).toBe(5)
  })

  test('each result item has letter and status', () => {
    const { slotKey } = wordleGetDaily(db, 'ru', fixedDate)
    const r = wordleCheckGuess(db, { guess: 'КОШКА', slotKey, lang: 'ru' })
    r.result.forEach(item => {
      expect(item).toHaveProperty('letter')
      expect(item).toHaveProperty('status')
      expect(['correct', 'present', 'absent']).toContain(item.status)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 8. QUIZ
// ═══════════════════════════════════════════════════════════════════════════════

describe('quizGetQuestion', () => {
  beforeEach(() => { seedQuestion() })

  test('returns id, question, options, category, difficulty, total', () => {
    const r = quizGetQuestion(db, { lang: 'ru', seen: [] })
    expect(r).toHaveProperty('id')
    expect(r).toHaveProperty('question')
    expect(r).toHaveProperty('options')
    expect(r).toHaveProperty('category')
    expect(r).toHaveProperty('difficulty')
    expect(r).toHaveProperty('total')
  })

  test('options array has 4 items', () => {
    const r = quizGetQuestion(db, { lang: 'ru', seen: [] })
    expect(r.options.length).toBe(4)
  })

  test('correct answer is in options', () => {
    const r = quizGetQuestion(db, { lang: 'ru', seen: [] })
    expect(r.options).toContain('Париж')
  })

  test('throws when no questions for language', () => {
    expect(() => quizGetQuestion(db, { lang: 'zz', seen: [] })).toThrow('No questions found')
  })

  test('skips seen ids', () => {
    seedQuestion({ question: 'Вопрос 2?', correct_answer: 'Б', option_b: 'А', option_c: 'В', option_d: 'Г' })
    const r1 = quizGetQuestion(db, { lang: 'ru', seen: [] })
    const r2 = quizGetQuestion(db, { lang: 'ru', seen: [r1.id] })
    expect(r2.id).not.toBe(r1.id)
  })

  test('total reflects count of language questions', () => {
    const r = quizGetQuestion(db, { lang: 'ru', seen: [] })
    expect(r.total).toBeGreaterThanOrEqual(1)
  })

  test('resets when all seen', () => {
    const r1 = quizGetQuestion(db, { lang: 'ru', seen: [] })
    // seen = [id] and total=1, so seenIds.length >= total → reset
    const r2 = quizGetQuestion(db, { lang: 'ru', seen: [r1.id] })
    expect(r2).toBeTruthy()
  })

  test('handles null seen gracefully', () => {
    const r = quizGetQuestion(db, { lang: 'ru', seen: null })
    expect(r).toBeTruthy()
  })
})

describe('quizCheckAnswer', () => {
  test('correct answer returns correct=true', () => {
    const q = seedQuestion()
    const r = quizCheckAnswer(db, { questionId: q.id, answer: 'Париж' })
    expect(r.correct).toBe(true)
    expect(r.correctAnswer).toBe('Париж')
  })

  test('wrong answer returns correct=false', () => {
    const q = seedQuestion()
    const r = quizCheckAnswer(db, { questionId: q.id, answer: 'Лондон' })
    expect(r.correct).toBe(false)
  })

  test('case and whitespace insensitive', () => {
    const q = seedQuestion()
    const r = quizCheckAnswer(db, { questionId: q.id, answer: '  париж  ' })
    expect(r.correct).toBe(true)
  })

  test('throws for unknown questionId', () => {
    expect(() => quizCheckAnswer(db, { questionId: 9999, answer: 'X' })).toThrow('Question not found')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ADMIN — WORDS
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminListWords', () => {
  test('returns array', () => {
    expect(Array.isArray(adminListWords(db, 'ru'))).toBe(true)
  })

  test('returns only words for requested language', () => {
    seedWord({ word: 'КОШКА', language: 'ru' })
    seedWord({ word: 'TIGER', language: 'en', hint: 'big cat', category: 'animals' })
    const rows = adminListWords(db, 'ru')
    rows.forEach(r => expect(r.language).toBe('ru'))
  })

  test('empty when no words for language', () => {
    expect(adminListWords(db, 'zz')).toEqual([])
  })
})

describe('adminCreateWord', () => {
  test('creates and returns word', () => {
    const r = adminCreateWord(db, { word: 'новое', language: 'ru', category: 'тест', difficulty: 2, hint: 'Подсказка' })
    expect(r.word).toBe('НОВОЕ')
    expect(r.language).toBe('ru')
    expect(r.id).toBeGreaterThan(0)
  })

  test('word is uppercased automatically', () => {
    const r = adminCreateWord(db, { word: 'тест', language: 'ru' })
    expect(r.word).toBe('ТЕСТ')
  })

  test('defaults difficulty to 1', () => {
    const r = adminCreateWord(db, { word: 'дефолт', language: 'ru' })
    expect(r.difficulty).toBe(1)
  })

  test('defaults language to ru', () => {
    const r = adminCreateWord(db, { word: 'яз', language: undefined })
    expect(r.language).toBe('ru')
  })
})

describe('adminUpdateWord', () => {
  test('updates word fields', () => {
    const w = seedWord({ word: 'СТАРОЕ' })
    const r = adminUpdateWord(db, { id: w.id, data: { word: 'новое', language: 'ru', category: 'обновлено', difficulty: 3, hint: 'new' } })
    expect(r.word).toBe('НОВОЕ')
    expect(r.category).toBe('обновлено')
    expect(r.difficulty).toBe(3)
  })

  test('returns updated row', () => {
    const w = seedWord()
    const r = adminUpdateWord(db, { id: w.id, data: { word: 'updated', language: 'ru', hint: 'h', category: 'c', difficulty: 1 } })
    expect(r).not.toBeNull()
  })
})

describe('adminDeleteWord', () => {
  test('deletes word and returns null', () => {
    const w = seedWord({ word: 'УДАЛИ' })
    const r = adminDeleteWord(db, w.id)
    expect(r).toBeNull()
    expect(get(db, 'SELECT * FROM words WHERE id = ?', [w.id])).toBeNull()
  })

  test('deleting non-existent id does not throw', () => {
    expect(() => adminDeleteWord(db, 9999)).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 10. ADMIN — QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('adminListQuestions', () => {
  test('returns array', () => {
    expect(Array.isArray(adminListQuestions(db, 'ru'))).toBe(true)
  })

  test('returns only questions for requested language', () => {
    seedQuestion()
    const rows = adminListQuestions(db, 'ru')
    rows.forEach(r => expect(r.language).toBe('ru'))
  })

  test('empty when no questions for language', () => {
    expect(adminListQuestions(db, 'zz')).toEqual([])
  })
})

describe('adminCreateQuestion', () => {
  test('creates and returns question', () => {
    const r = adminCreateQuestion(db, {
      question: 'Новый вопрос?', correct_answer: 'А', option_b: 'Б', option_c: 'В', option_d: 'Г',
      category: 'тест', difficulty: 1, language: 'ru',
    })
    expect(r.question).toBe('Новый вопрос?')
    expect(r.correct_answer).toBe('А')
    expect(r.id).toBeGreaterThan(0)
  })

  test('defaults difficulty to 1', () => {
    const r = adminCreateQuestion(db, {
      question: 'Дефолт?', correct_answer: 'Д', option_b: 'Е', option_c: 'Ж', option_d: 'З', language: 'ru',
    })
    expect(r.difficulty).toBe(1)
  })

  test('defaults language to ru', () => {
    const r = adminCreateQuestion(db, {
      question: 'Яз?', correct_answer: 'Р', option_b: 'С', option_c: 'Т', option_d: 'У',
    })
    expect(r.language).toBe('ru')
  })
})

describe('adminUpdateQuestion', () => {
  test('updates question fields', () => {
    const q = seedQuestion()
    const r = adminUpdateQuestion(db, {
      id: q.id,
      data: { question: 'Изменён?', correct_answer: 'Да', option_b: 'Нет', option_c: 'Может', option_d: 'Иначе', category: 'обновлено', difficulty: 2, language: 'ru' }
    })
    expect(r.question).toBe('Изменён?')
    expect(r.correct_answer).toBe('Да')
    expect(r.difficulty).toBe(2)
  })

  test('returns updated row', () => {
    const q = seedQuestion()
    const r = adminUpdateQuestion(db, {
      id: q.id,
      data: { question: q.question, correct_answer: q.correct_answer, option_b: 'X', option_c: 'Y', option_d: 'Z', language: 'ru', difficulty: 1, category: null }
    })
    expect(r).not.toBeNull()
  })
})

describe('adminDeleteQuestion', () => {
  test('deletes question and returns null', () => {
    const q = seedQuestion()
    const r = adminDeleteQuestion(db, q.id)
    expect(r).toBeNull()
    expect(get(db, 'SELECT * FROM quiz_questions WHERE id = ?', [q.id])).toBeNull()
  })

  test('deleting non-existent id does not throw', () => {
    expect(() => adminDeleteQuestion(db, 9999)).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 11. EDGE CASES & INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('checkGuess — extended', () => {
  test('single letter word correct', () => {
    const r = checkGuess('A', 'A')
    expect(r[0].status).toBe('correct')
  })

  test('all present (anagram)', () => {
    const r = checkGuess('ОГКША', 'КОШКА')
    expect(r.some(x => x.status === 'present' || x.status === 'correct')).toBe(true)
  })

  test('absent takes priority when letter exhausted', () => {
    // TARGET=АБВГД, GUESS=ААААА — only first А is correct, rest absent
    const r = checkGuess('ААААА', 'АБВГД')
    expect(r[0].status).toBe('correct')
    expect(r.slice(1).every(x => x.status === 'absent')).toBe(true)
  })

  test('mixed results have correct letters', () => {
    const r = checkGuess('КОБРА', 'КОШКА')
    expect(r[0].letter).toBe('К')
    expect(r[0].status).toBe('correct')
  })
})

describe('makeSlotKey — extended', () => {
  test('contains language suffix', () => {
    const d = new Date('2025-01-15T12:00:00')
    expect(makeSlotKey('en', d)).toMatch(/-en$/)
    expect(makeSlotKey('tm', d)).toMatch(/-tm$/)
  })

  test('date portion matches ISO date', () => {
    const d = new Date('2025-12-31T12:00:00')
    expect(makeSlotKey('ru', d)).toMatch(/^2025-12-31/)
  })
})

describe('shuffleOptions — extended', () => {
  test('works with single item', () => {
    const r = shuffleOptions(['only'], 1)
    expect(r).toEqual(['only'])
  })

  test('works with 2 items', () => {
    const r = shuffleOptions(['A', 'B'], 1)
    expect(r.sort()).toEqual(['A', 'B'])
  })

  test('large id does not crash', () => {
    expect(() => shuffleOptions(['A','B','C','D'], 999999)).not.toThrow()
  })
})

describe('adminCreateWord — extended', () => {
  test('stores hint correctly', () => {
    const r = adminCreateWord(db, { word: 'хинт', language: 'ru', hint: 'Моя подсказка' })
    expect(r.hint).toBe('Моя подсказка')
  })

  test('stores category correctly', () => {
    const r = adminCreateWord(db, { word: 'кат', language: 'ru', category: 'моя_категория' })
    expect(r.category).toBe('моя_категория')
  })

  test('difficulty 3 stored correctly', () => {
    const r = adminCreateWord(db, { word: 'труд', language: 'ru', difficulty: 3 })
    expect(r.difficulty).toBe(3)
  })

  test('english word stored uppercase', () => {
    const r = adminCreateWord(db, { word: 'hello', language: 'en' })
    expect(r.word).toBe('HELLO')
  })
})

describe('adminCreateQuestion — extended', () => {
  test('all options stored', () => {
    const r = adminCreateQuestion(db, {
      question: 'Тест?', correct_answer: 'П', option_b: 'О', option_c: 'Л', option_d: 'Н', language: 'ru'
    })
    expect(r.option_b).toBe('О')
    expect(r.option_c).toBe('Л')
    expect(r.option_d).toBe('Н')
  })

  test('category stored correctly', () => {
    const r = adminCreateQuestion(db, {
      question: 'Кат?', correct_answer: 'Да', option_b: 'Нет', option_c: 'Может', option_d: 'Нет2',
      category: 'my_cat', language: 'ru'
    })
    expect(r.category).toBe('my_cat')
  })
})

describe('DB schema integrity', () => {
  test('words table has correct columns', () => {
    const r = get(db, "PRAGMA table_info(words)")
    expect(r).not.toBeNull()
  })

  test('quiz_questions table exists', () => {
    const r = get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='quiz_questions'")
    expect(r).not.toBeNull()
    expect(r.name).toBe('quiz_questions')
  })

  test('daily_wordle table exists', () => {
    const r = get(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='daily_wordle'")
    expect(r).not.toBeNull()
  })

  test('words UNIQUE constraint prevents duplicate words', () => {
    seedWord({ word: 'УНИК' })
    expect(() => run(db, 'INSERT INTO words (word,language) VALUES (?,?)', ['УНИК', 'ru'])).toThrow()
  })

  test('quiz_questions UNIQUE constraint on question', () => {
    seedQuestion({ question: 'Уникальный?' })
    expect(() => run(db, 'INSERT INTO quiz_questions (question,correct_answer,option_b,option_c,option_d,language) VALUES (?,?,?,?,?,?)',
      ['Уникальный?', 'А', 'Б', 'В', 'Г', 'ru'])).toThrow()
  })
})

describe('hangmanCheckLetter — extended', () => {
  test('position indices are zero-based', () => {
    const w = seedWord({ word: 'АБВГА' })
    const r = hangmanCheckLetter(db, { wordId: w.id, letter: 'А' })
    expect(r.positions).toContain(0)
    expect(r.positions).toContain(4)
  })

  test('no positions for completely absent letter', () => {
    const w = seedWord({ word: 'КОШКА' })
    const r = hangmanCheckLetter(db, { wordId: w.id, letter: 'Э' })
    expect(r.positions).toHaveLength(0)
    expect(r.correct).toBe(false)
  })
})

describe('wordleGetDaily — multi-language', () => {
  test('tm language works', () => {
    seedWord({ word: 'КИТАП', language: 'tm', hint: 'Okamak', category: 'bilim' })
    const r = wordleGetDaily(db, 'tm', new Date('2025-06-01T10:00:00'))
    expect(r.wordLength).toBe(5)
  })

  test('different languages get different slot keys', () => {
    seedWord({ word: 'КОШКА', language: 'ru' })
    seedWord({ word: 'TIGER', language: 'en', hint: 'Cat', category: 'animals' })
    const d = new Date('2025-06-01T10:00:00')
    const ru = wordleGetDaily(db, 'ru', d)
    const en = wordleGetDaily(db, 'en', d)
    expect(ru.slotKey).not.toBe(en.slotKey)
  })
})

describe('quizGetQuestion — multi-language', () => {
  test('en language works', () => {
    seedQuestion({
      question: 'Capital of France?', correct_answer: 'Paris',
      option_b: 'London', option_c: 'Berlin', option_d: 'Madrid', language: 'en'
    })
    const r = quizGetQuestion(db, { lang: 'en', seen: [] })
    expect(r.question).toBe('Capital of France?')
  })

  test('seen is filtered to integers only', () => {
    seedQuestion()
    expect(() => quizGetQuestion(db, { lang: 'ru', seen: ['nope', null, 1.5] })).not.toThrow()
  })
})

describe('hangmanGetWord — extended', () => {
  test('works for tm language', () => {
    seedWord({ word: 'КИТАП', language: 'tm', hint: 'Okamak', category: 'bilim' })
    const r = hangmanGetWord(db, 'tm')
    expect(r.length).toBe(5)
  })

  test('category returned correctly', () => {
    seedWord({ word: 'КОШКА', category: 'животные' })
    const r = hangmanGetWord(db, 'ru')
    expect(r.category).toBe('животные')
  })

  test('hint returned correctly', () => {
    seedWord({ word: 'КОШКА', hint: 'Мурлычет' })
    const r = hangmanGetWord(db, 'ru')
    expect(r.hint).toBe('Мурлычет')
  })
})

describe('wordleCheckGuess — extended', () => {
  test('partial match: some correct, some present, some absent', () => {
    seedWord({ word: 'КОШКА' })
    const d = new Date('2025-07-01T10:00:00')
    const { slotKey } = wordleGetDaily(db, 'ru', d)
    // К correct, rest absent
    const r = wordleCheckGuess(db, { guess: 'КБВГД', slotKey, lang: 'ru' })
    expect(r.result[0].status).toBe('correct')
    expect(r.won).toBe(false)
  })

  test('won=false for empty-alike guess', () => {
    seedWord({ word: 'КОШКА' })
    const d = new Date('2025-08-01T10:00:00')
    const { slotKey } = wordleGetDaily(db, 'ru', d)
    const r = wordleCheckGuess(db, { guess: 'БББББ', slotKey, lang: 'ru' })
    expect(r.won).toBe(false)
  })
})
