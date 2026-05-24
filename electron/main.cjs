'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

let SQL_LIB, db, dbFile, win

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#f8faf9',
  })

  if (process.env.IS_DEV === '1') {
    win.loadURL('http://localhost:3001')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../out/index.html'))
  }
}

ipcMain.on('window:minimize', () => win?.minimize())
ipcMain.on('window:maximize', () => win?.isMaximized() ? win.unmaximize() : win?.maximize())
ipcMain.on('window:close',    () => win?.close())

// ─── DB helpers ──────────────────────────────────────────────────────────────

function saveDb() {
  const data = db.export()
  fs.writeFileSync(dbFile, Buffer.from(data))
}

function get(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const row = stmt.step() ? stmt.getAsObject() : null
  stmt.free()
  return row
}

function all(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function run(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.run(params)
  stmt.free()
}

function lastId() {
  return db.exec('SELECT last_insert_rowid()')[0].values[0][0]
}

function count(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const n = stmt.step() ? stmt.getAsObject() : { cnt: 0 }
  stmt.free()
  return Number(n.cnt ?? 0)
}

// ─── Database init ────────────────────────────────────────────────────────────

async function initDb() {
  const initSqlJs = require('sql.js')
  SQL_LIB = await initSqlJs()

  dbFile = path.join(app.getPath('userData'), 'word_games.db')

  if (fs.existsSync(dbFile)) {
    db = new SQL_LIB.Database(fs.readFileSync(dbFile))
  } else {
    db = new SQL_LIB.Database()
  }

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

  if (count('SELECT COUNT(*) as cnt FROM words') === 0) {
    seedData()
  }

  // Remove duplicate questions
  db.run("DELETE FROM quiz_questions WHERE id NOT IN (SELECT MIN(id) FROM quiz_questions GROUP BY question)")

  saveDb()
}

// ─── Seed data ────────────────────────────────────────────────────────────────

function seedData() {
  for (const r of [
    ['КОШКА','животные',1,'Домашний питомец, мурлычет','ru'],
    ['СОБАКА','животные',1,'Лучший друг человека','ru'],
    ['СЛОВО','лингвистика',1,'Единица языка','ru'],
    ['ЗЕМЛЯ','природа',1,'Третья планета от Солнца','ru'],
    ['КНИГА','культура',1,'Источник знаний','ru'],
    ['СТОЛ','мебель',1,'На нём едят и пишут','ru'],
    ['ОКНО','архитектура',1,'Отверстие в стене со стеклом','ru'],
    ['ЛИМОН','фрукты',1,'Жёлтый кислый фрукт','ru'],
    ['МЯЧ','спорт',1,'Круглый предмет для игр','ru'],
    ['ПЧЕЛА','насекомые',1,'Делает мёд','ru'],
    ['РОЗА','цветы',1,'Цветок с шипами','ru'],
    ['СНЕГ','природа',1,'Белые осадки зимой','ru'],
    ['ВОЛК','животные',2,'Серый хищник леса','ru'],
    ['ГРИБ','природа',1,'Растёт в лесу, бывает съедобным','ru'],
    ['МОСТ','архитектура',2,'Переправа через реку','ru'],
    ['ПОЕЗД','транспорт',1,'Едет по рельсам','ru'],
    ['САМОЛЁТ','транспорт',2,'Летит по небу','ru'],
    ['ГОРОД','география',1,'Большое населённое место','ru'],
    ['ШКОЛА','образование',1,'Здесь учатся дети','ru'],
    ['МУЗЫКА','искусство',1,'Сочетание звуков и ритма','ru'],
    ['APPLE','food',1,'A red or green fruit','en'],
    ['CHAIR','furniture',1,'You sit on it','en'],
    ['WATER','nature',1,'Essential liquid for life','en'],
    ['TIGER','animals',2,'Striped big cat','en'],
    ['MUSIC','art',1,'Sounds in harmony','en'],
    ['PIANO','art',2,'A keyboard instrument','en'],
    ['RIVER','nature',1,'Flowing body of water','en'],
    ['NIGHT','nature',1,'Opposite of day','en'],
    ['BRAIN','biology',2,'Organ of thought','en'],
    ['FLAME','nature',1,'Burning fire','en'],
    ['GRAPE','food',1,'Small purple or green fruit','en'],
    ['HEART','biology',1,'Pumps blood','en'],
    ['KNIFE','tools',1,'Sharp cutting tool','en'],
    ['MOUSE','animals',1,'Small rodent','en'],
    ['OCEAN','nature',1,'Vast body of salt water','en'],
    ['SUGAR','food',1,'Sweet white crystals','en'],
    ['TRAIN','transport',1,'Runs on rails','en'],
    ['DANCE','art',1,'Movement to music','en'],
    ['EARTH','nature',1,'Our planet','en'],
    ['LEMON','food',1,'Yellow sour citrus fruit','en'],
    ['KITAP','bilim',1,'Okamak üçin ulanylýar','tm'],
    ['HABAR','maglumat',1,'Täzelikler we maglumat','tm'],
    ['DUMAN','tebigat',1,'Gyş ýa-da güýz tumanly howa','tm'],
    ['BAZAR','söwda',1,'Haryt satylýan ýer','tm'],
    ['ALMAZ','minerallar',2,'Gymmatbaha daş','tm'],
    ['OKEAN','tebigat',1,'Uly duzly suw howdany','tm'],
    ['DERYA','tebigat',1,'Akýan suw','tm'],
    ['MEKAN','coğrafiýa',1,'Ýaşaýan ýer','tm'],
    ['ÇÖREK','iýmit',1,'Esasy iýmit','tm'],
    ['PIŞIK','haýwanlar',1,'Öý haýwany, miyawlaýar','tm'],
    ['ŞÄHER','coğrafiýa',1,'Uly ilatly ýer','tm'],
    ['ÇOPAN','hünärler',2,'Goýun bakyp ýören adam','tm'],
    ['GÜJÜK','haýwanlar',1,'Ownuk it','tm'],
    ['KABUL','düşünje',2,'Razy bolmak','tm'],
    ['GABAT','düşünje',1,'Duşuşmak','tm'],
    ['DAGLY','tebigat',2,'Daglara degişli','tm'],
    ['ÇEMEN','tebigat',1,'Ýaşyl otly meýdan','tm'],
    ['MIRAS','medeniýet',2,'Geçmişden galan gymmatly zat','tm'],
    ['MAKUL','düşünje',1,'Kabul ederlikli','tm'],
    ['ULULY','düşünje',2,'Uly bolmak häsiýeti','tm'],
  ]) run('INSERT OR IGNORE INTO words (word,category,difficulty,hint,language) VALUES (?,?,?,?,?)', r)

  for (const r of [
    ['Какая планета ближайшая к Солнцу?','Меркурий','Венера','Марс','Земля','астрономия',1,'ru'],
    ['Сколько букв в русском алфавите?','33','32','30','26','лингвистика',1,'ru'],
    ['Кто написал «Евгений Онегин»?','Пушкин','Толстой','Достоевский','Гоголь','литература',1,'ru'],
    ['Какой химический символ у воды?','H₂O','CO₂','NaCl','O₂','химия',1,'ru'],
    ['Столица Франции?','Париж','Лион','Марсель','Бордо','география',1,'ru'],
    ['Сколько сторон у шестиугольника?','6','5','7','8','математика',1,'ru'],
    ['Какой газ составляет большую часть атмосферы Земли?','Азот','Кислород','Углекислый газ','Аргон','физика',2,'ru'],
    ['В каком году Россия впервые запустила человека в космос?','1961','1957','1969','1965','история',1,'ru'],
    ['Какое животное является символом России?','Медведь','Орёл','Волк','Лось','культура',1,'ru'],
    ['Какая нота следует после «ля»?','Си','До','Ре','Фа','музыка',2,'ru'],
    ['Сколько дней в високосном году?','366','365','364','367','общие знания',1,'ru'],
    ['Кто изобрёл телефон?','Белл','Эдисон','Тесла','Маркони','история науки',2,'ru'],
    ['Какая самая длинная река в мире?','Нил','Амазонка','Янцзы','Миссисипи','география',1,'ru'],
    ['Сколько цветов в радуге?','7','6','5','8','физика',1,'ru'],
    ['Как называется самая маленькая частица химического элемента?','Атом','Молекула','Электрон','Протон','химия',2,'ru'],
    ['What is the capital of France?','Paris','London','Berlin','Madrid','geography',1,'en'],
    ['How many letters are in the English alphabet?','26','24','28','30','linguistics',1,'en'],
    ['Who wrote "Romeo and Juliet"?','Shakespeare','Dickens','Tolstoy','Hugo','literature',1,'en'],
    ['What is the chemical formula for water?','H₂O','CO₂','NaCl','O₂','chemistry',1,'en'],
    ['What is the capital of Russia?','Moscow','London','Paris','Berlin','geography',1,'en'],
    ['How many sides does a hexagon have?','6','5','7','8','mathematics',1,'en'],
    ["Which gas makes up most of Earth's atmosphere?",'Nitrogen','Oxygen','Carbon dioxide','Argon','science',2,'en'],
    ['In what year did the first human walk on the Moon?','1969','1957','1961','1975','history',1,'en'],
    ['What is the largest planet in the Solar System?','Jupiter','Saturn','Neptune','Uranus','astronomy',1,'en'],
    ['How many colors are in a rainbow?','7','6','5','8','science',1,'en'],
    ['Who invented the telephone?','Bell','Edison','Tesla','Marconi','history',2,'en'],
    ['What is the longest river in the world?','Nile','Amazon','Yangtze','Mississippi','geography',1,'en'],
    ['How many days are in a leap year?','366','365','364','367','general',1,'en'],
    ['What is the smallest particle of a chemical element?','Atom','Molecule','Electron','Proton','chemistry',2,'en'],
    ['Which planet is closest to the Sun?','Mercury','Venus','Mars','Earth','astronomy',1,'en'],
    ['Fransiýanyň paýtagty haýsy?','Pariž','London','Berlin','Madrid','coğrafiýa',1,'tm'],
    ['Iňlis elipbiýinde näçe harp bar?','26','24','28','30','lingwistika',1,'tm'],
    ['Suwuň himiki formulasy näme?','H₂O','CO₂','NaCl','O₂','himiýa',1,'tm'],
    ['Russiýanyň paýtagty haýsy?','Moskwa','London','Pariž','Berlin','coğrafiýa',1,'tm'],
    ['Altyburçlugyň näçe gyragy bar?','6','5','7','8','matematika',1,'tm'],
    ['Ýer ýüzüniň atmosferasynyň esasy gazy haýsy?','Azot','Kislorod','Kömürturşy gazy','Argon','fizika',2,'tm'],
    ['Adamzat aýa ilkinji gezek haçan bardy?','1969','1957','1961','1975','taryh',1,'tm'],
    ['Gün ulgamyndaky iň uly planeta haýsy?','Ýupiter','Saturn','Neptun','Uran','astronomiýa',1,'tm'],
    ['Älemgoşarda näçe reňk bar?','7','6','5','8','fizika',1,'tm'],
    ['Telefony kim oýlap tapdy?','Bell','Edison','Tesla','Markoni','taryh',2,'tm'],
    ['Dünýäniň iň uzyn derýasy haýsy?','Nil','Amazon','Ýantszi','Mississipi','coğrafiýa',1,'tm'],
    ['Belent ýylda näçe gün bolýar?','366','365','364','367','umumy',1,'tm'],
    ['Himiki elementiň iň kiçi bölegi näme?','Atom','Molekula','Elektron','Proton','himiýa',2,'tm'],
    ['Güne iň ýakyn planeta haýsy?','Merkuriý','Wenera','Mars','Ýer','astronomiýa',1,'tm'],
    ['Türkmenistanyň paýtagty haýsy?','Aşgabat','Türkmenbaşy','Mary','Balkanabat','coğrafiýa',1,'tm'],
  ]) run('INSERT OR IGNORE INTO quiz_questions (question,correct_answer,option_b,option_c,option_d,category,difficulty,language) VALUES (?,?,?,?,?,?,?,?)', r)
}

// ─── Wordle helpers ──────────────────────────────────────────────────────────

function currentSlot() {
  const h = new Date().getHours()
  return h <= 7 ? 0 : h <= 15 ? 1 : 2
}

function makeSlotKey(lang) {
  const today = new Date().toISOString().slice(0, 10)
  return `${today}-${currentSlot()}-${lang}`
}

function getOrAssignSlot(key, lang) {
  const existing = get('SELECT word_id FROM daily_wordle WHERE date = ?', [key])
  let wordId
  if (existing) {
    wordId = existing.word_id
  } else {
    const word = get(
      "SELECT * FROM words WHERE language = ? AND length(word) = 5 " +
      "AND id NOT IN (SELECT word_id FROM daily_wordle ORDER BY id DESC LIMIT 90) " +
      "ORDER BY RANDOM() LIMIT 1",
      [lang]
    )
    if (!word) throw new Error('No 5-letter words available')
    run('INSERT INTO daily_wordle (word_id, date) VALUES (?, ?)', [word.id, key])
    saveDb()
    wordId = word.id
  }
  return get('SELECT * FROM words WHERE id = ?', [wordId])
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

// ─── IPC handlers ────────────────────────────────────────────────────────────

ipcMain.handle('hangman:getWord', (_, lang) => {
  const word = get('SELECT * FROM words WHERE language = ? ORDER BY RANDOM() LIMIT 1', [lang])
  if (!word) throw new Error('No words found')
  return { id: word.id, length: [...word.word].length, hint: word.hint, category: word.category }
})

ipcMain.handle('hangman:checkLetter', (_, { wordId, letter }) => {
  const word = get('SELECT * FROM words WHERE id = ?', [wordId])
  if (!word) throw new Error('Word not found')
  const upper = letter.toUpperCase()
  const positions = [...word.word].reduce((acc, ch, i) => { if (ch === upper) acc.push(i); return acc }, [])
  return { correct: positions.length > 0, positions }
})

ipcMain.handle('hangman:revealWord', (_, wordId) => {
  const row = get('SELECT word FROM words WHERE id = ?', [wordId])
  if (!row) throw new Error('Word not found')
  return { word: row.word }
})

ipcMain.handle('wordle:getDaily', (_, lang) => {
  const key = makeSlotKey(lang)
  const word = getOrAssignSlot(key, lang)
  return { slotKey: key, slotNum: currentSlot(), wordLength: [...word.word].length }
})

ipcMain.handle('wordle:checkGuess', (_, { guess, slotKey, lang }) => {
  const key = slotKey || makeSlotKey(lang || 'ru')
  const target = getOrAssignSlot(key, lang || 'ru')
  const result = checkGuess(guess, target.word)
  return { result, won: result.every(r => r.status === 'correct') }
})

ipcMain.handle('quiz:getQuestion', (_, { lang, seen }) => {
  const seenIds = Array.isArray(seen) ? seen.filter(Number.isInteger) : []
  const total = count('SELECT COUNT(*) as cnt FROM quiz_questions WHERE language = ?', [lang])
  let q
  if (seenIds.length === 0 || seenIds.length >= total) {
    q = get('SELECT * FROM quiz_questions WHERE language = ? ORDER BY RANDOM() LIMIT 1', [lang])
  } else {
    const ph = seenIds.map(() => '?').join(',')
    q = get(`SELECT * FROM quiz_questions WHERE language = ? AND id NOT IN (${ph}) ORDER BY RANDOM() LIMIT 1`, [lang, ...seenIds])
  }
  if (!q) throw new Error('No questions found')
  const options = shuffleOptions([q.correct_answer, q.option_b, q.option_c, q.option_d], q.id)
  return { id: q.id, question: q.question, options, category: q.category, difficulty: q.difficulty, total }
})

ipcMain.handle('quiz:checkAnswer', (_, { questionId, answer }) => {
  const q = get('SELECT * FROM quiz_questions WHERE id = ?', [questionId])
  if (!q) throw new Error('Question not found')
  const correct = answer.trim().toLowerCase() === q.correct_answer.trim().toLowerCase()
  return { correct, correctAnswer: q.correct_answer }
})

ipcMain.handle('admin:listWords',    (_, lang) => all('SELECT * FROM words WHERE language = ? ORDER BY id DESC', [lang]))
ipcMain.handle('admin:createWord',   (_, data) => {
  run('INSERT INTO words (word,category,difficulty,hint,language) VALUES (?,?,?,?,?)',
    [data.word.toUpperCase(), data.category || null, data.difficulty || 1, data.hint || null, data.language || 'ru'])
  const id = lastId(); saveDb()
  return get('SELECT * FROM words WHERE id = ?', [id])
})
ipcMain.handle('admin:updateWord',   (_, { id, data }) => {
  run('UPDATE words SET word=?,category=?,difficulty=?,hint=?,language=? WHERE id=?',
    [data.word.toUpperCase(), data.category || null, data.difficulty || 1, data.hint || null, data.language || 'ru', id])
  saveDb(); return get('SELECT * FROM words WHERE id = ?', [id])
})
ipcMain.handle('admin:deleteWord',   (_, id) => { run('DELETE FROM words WHERE id = ?', [id]); saveDb(); return null })

ipcMain.handle('admin:listQuestions',    (_, lang) => all('SELECT * FROM quiz_questions WHERE language = ? ORDER BY id DESC', [lang]))
ipcMain.handle('admin:createQuestion',   (_, data) => {
  run('INSERT INTO quiz_questions (question,correct_answer,option_b,option_c,option_d,category,difficulty,language) VALUES (?,?,?,?,?,?,?,?)',
    [data.question, data.correct_answer, data.option_b, data.option_c, data.option_d, data.category || null, data.difficulty || 1, data.language || 'ru'])
  const id = lastId(); saveDb()
  return get('SELECT * FROM quiz_questions WHERE id = ?', [id])
})
ipcMain.handle('admin:updateQuestion',   (_, { id, data }) => {
  run('UPDATE quiz_questions SET question=?,correct_answer=?,option_b=?,option_c=?,option_d=?,category=?,difficulty=?,language=? WHERE id=?',
    [data.question, data.correct_answer, data.option_b, data.option_c, data.option_d, data.category || null, data.difficulty || 1, data.language || 'ru', id])
  saveDb(); return get('SELECT * FROM quiz_questions WHERE id = ?', [id])
})
ipcMain.handle('admin:deleteQuestion',   (_, id) => { run('DELETE FROM quiz_questions WHERE id = ?', [id]); saveDb(); return null })

// ─── Lifecycle ────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await initDb()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
