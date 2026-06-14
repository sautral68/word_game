'use strict'

// ─── DB helpers ──────────────────────────────────────────────────────────────

function makeDb(SQL) {
  const db = new SQL.Database()

  db.run(`
    CREATE TABLE IF NOT EXISTS words (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      word       TEXT NOT NULL UNIQUE,
      category   TEXT,
      difficulty INTEGER NOT NULL DEFAULT 1,
      hint       TEXT,
      language   TEXT NOT NULL DEFAULT 'ru',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      question       TEXT NOT NULL UNIQUE,
      correct_answer TEXT NOT NULL,
      option_b       TEXT NOT NULL,
      option_c       TEXT NOT NULL,
      option_d       TEXT NOT NULL,
      category       TEXT,
      difficulty     INTEGER NOT NULL DEFAULT 1,
      language       TEXT NOT NULL DEFAULT 'ru',
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_wordle (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id INTEGER NOT NULL REFERENCES words(id),
      date    TEXT NOT NULL UNIQUE
    )
  `)
  return db
}

function get(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const row = stmt.step() ? stmt.getAsObject() : null
  stmt.free()
  return row
}

function all(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function run(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.run(params)
  stmt.free()
}

function lastId(db) {
  return db.exec('SELECT last_insert_rowid()')[0].values[0][0]
}

function count(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const n = stmt.step() ? stmt.getAsObject() : { cnt: 0 }
  stmt.free()
  return Number(n.cnt ?? 0)
}

// ─── Wordle helpers ──────────────────────────────────────────────────────────

function currentSlot(date) {
  const h = (date || new Date()).getHours()
  return h <= 7 ? 0 : h <= 15 ? 1 : 2
}

function makeSlotKey(lang, date) {
  const d = date || new Date()
  const today = d.toISOString().slice(0, 10)
  return `${today}-${currentSlot(d)}-${lang}`
}

function getOrAssignSlot(db, key, lang) {
  const existing = get(db, 'SELECT word_id FROM daily_wordle WHERE date = ?', [key])
  let wordId
  if (existing) {
    wordId = existing.word_id
  } else {
    const word = get(
      db,
      "SELECT * FROM words WHERE language = ? AND length(word) = 5 " +
      "AND id NOT IN (SELECT word_id FROM daily_wordle ORDER BY id DESC LIMIT 90) " +
      "ORDER BY RANDOM() LIMIT 1",
      [lang]
    )
    if (!word) throw new Error('No 5-letter words available')
    run(db, 'INSERT INTO daily_wordle (word_id, date) VALUES (?, ?)', [word.id, key])
    wordId = word.id
  }
  return get(db, 'SELECT * FROM words WHERE id = ?', [wordId])
}

function checkGuess(guess, targetWord) {
  const target = [...targetWord.toUpperCase()]
  const g = [...guess.toUpperCase()]
  const len = target.length
  const result = Array.from({ length: len }, (_, i) => ({ letter: g[i] || ' ', status: 'absent' }))
  const used = Array(len).fill(false)
  const correct = Array(len).fill(false)
  for (let i = 0; i < len; i++) {
    if (g[i] === target[i]) { result[i].status = 'correct'; used[i] = true; correct[i] = true }
  }
  for (let i = 0; i < len; i++) {
    if (correct[i]) continue
    for (let j = 0; j < len; j++) {
      if (!used[j] && g[i] === target[j]) { result[i].status = 'present'; used[j] = true; break }
    }
  }
  return result
}

// ─── Quiz helpers ────────────────────────────────────────────────────────────

function shuffleOptions(options, id) {
  const opts = [...options]
  let h = BigInt(id)
  for (let i = opts.length - 1; i > 0; i--) {
    h = BigInt.asUintN(64, h * 6364136223846793005n + 1442695040888963407n)
    const j = Number(h % BigInt(i + 1))
    ;[opts[i], opts[j]] = [opts[j], opts[i]]
  }
  return opts
}

// ─── IPC handler logic (pure, no ipcMain) ────────────────────────────────────

function hangmanGetWord(db, lang) {
  const word = get(db, 'SELECT * FROM words WHERE language = ? ORDER BY RANDOM() LIMIT 1', [lang])
  if (!word) throw new Error('No words found')
  return { id: word.id, length: [...word.word].length, hint: word.hint, category: word.category }
}

function hangmanCheckLetter(db, { wordId, letter }) {
  const word = get(db, 'SELECT * FROM words WHERE id = ?', [wordId])
  if (!word) throw new Error('Word not found')
  const upper = letter.toUpperCase()
  const positions = [...word.word].reduce((acc, ch, i) => { if (ch === upper) acc.push(i); return acc }, [])
  return { correct: positions.length > 0, positions }
}

function hangmanRevealWord(db, wordId) {
  const row = get(db, 'SELECT word FROM words WHERE id = ?', [wordId])
  if (!row) throw new Error('Word not found')
  return { word: row.word }
}

function wordleGetDaily(db, lang, date) {
  const key = makeSlotKey(lang, date)
  const word = getOrAssignSlot(db, key, lang)
  return { slotKey: key, slotNum: currentSlot(date), wordLength: [...word.word].length }
}

function wordleCheckGuess(db, { guess, slotKey, lang }) {
  const key = slotKey || makeSlotKey(lang || 'ru')
  const target = getOrAssignSlot(db, key, lang || 'ru')
  const result = checkGuess(guess, target.word)
  return { result, won: result.every(r => r.status === 'correct') }
}

function quizGetQuestion(db, { lang, seen }) {
  const seenIds = Array.isArray(seen) ? seen.filter(Number.isInteger) : []
  const total = count(db, 'SELECT COUNT(*) as cnt FROM quiz_questions WHERE language = ?', [lang])
  let q
  if (seenIds.length === 0 || seenIds.length >= total) {
    q = get(db, 'SELECT * FROM quiz_questions WHERE language = ? ORDER BY RANDOM() LIMIT 1', [lang])
  } else {
    const ph = seenIds.map(() => '?').join(',')
    q = get(db, `SELECT * FROM quiz_questions WHERE language = ? AND id NOT IN (${ph}) ORDER BY RANDOM() LIMIT 1`, [lang, ...seenIds])
  }
  if (!q) throw new Error('No questions found')
  const options = shuffleOptions([q.correct_answer, q.option_b, q.option_c, q.option_d], q.id)
  return { id: q.id, question: q.question, options, category: q.category, difficulty: q.difficulty, total }
}

function quizCheckAnswer(db, { questionId, answer }) {
  const q = get(db, 'SELECT * FROM quiz_questions WHERE id = ?', [questionId])
  if (!q) throw new Error('Question not found')
  const correct = answer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()
  return { correct, correctAnswer: q.correct_answer }
}

function adminListWords(db, lang) {
  return all(db, 'SELECT * FROM words WHERE language = ? ORDER BY id DESC', [lang])
}

function adminCreateWord(db, data) {
  run(db, 'INSERT INTO words (word,category,difficulty,hint,language) VALUES (?,?,?,?,?)',
    [data.word.toUpperCase(), data.category || null, data.difficulty || 1, data.hint || null, data.language || 'ru'])
  const id = lastId(db)
  return get(db, 'SELECT * FROM words WHERE id = ?', [id])
}

function adminUpdateWord(db, { id, data }) {
  run(db, 'UPDATE words SET word=?,category=?,difficulty=?,hint=?,language=? WHERE id=?',
    [data.word.toUpperCase(), data.category || null, data.difficulty || 1, data.hint || null, data.language || 'ru', id])
  return get(db, 'SELECT * FROM words WHERE id = ?', [id])
}

function adminDeleteWord(db, id) {
  run(db, 'DELETE FROM words WHERE id = ?', [id])
  return null
}

function adminListQuestions(db, lang) {
  return all(db, 'SELECT * FROM quiz_questions WHERE language = ? ORDER BY id DESC', [lang])
}

function adminCreateQuestion(db, data) {
  run(db, 'INSERT INTO quiz_questions (question,correct_answer,option_b,option_c,option_d,category,difficulty,language) VALUES (?,?,?,?,?,?,?,?)',
    [data.question, data.correct_answer, data.option_b, data.option_c, data.option_d, data.category || null, data.difficulty || 1, data.language || 'ru'])
  const id = lastId(db)
  return get(db, 'SELECT * FROM quiz_questions WHERE id = ?', [id])
}

function adminUpdateQuestion(db, { id, data }) {
  run(db, 'UPDATE quiz_questions SET question=?,correct_answer=?,option_b=?,option_c=?,option_d=?,category=?,difficulty=?,language=? WHERE id=?',
    [data.question, data.correct_answer, data.option_b, data.option_c, data.option_d, data.category || null, data.difficulty || 1, data.language || 'ru', id])
  return get(db, 'SELECT * FROM quiz_questions WHERE id = ?', [id])
}

function adminDeleteQuestion(db, id) {
  run(db, 'DELETE FROM quiz_questions WHERE id = ?', [id])
  return null
}

module.exports = {
  makeDb, get, all, run, lastId, count,
  currentSlot, makeSlotKey, checkGuess, shuffleOptions,
  hangmanGetWord, hangmanCheckLetter, hangmanRevealWord,
  wordleGetDaily, wordleCheckGuess,
  quizGetQuestion, quizCheckAnswer,
  adminListWords, adminCreateWord, adminUpdateWord, adminDeleteWord,
  adminListQuestions, adminCreateQuestion, adminUpdateQuestion, adminDeleteQuestion,
}
