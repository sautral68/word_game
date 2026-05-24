export interface WordRow {
  id: number; word: string; category: string | null
  difficulty: number; hint: string | null; language: string; created_at: string
}
export interface QuestionRow {
  id: number; question: string; correct_answer: string
  option_b: string; option_c: string; option_d: string
  category: string | null; difficulty: number; language: string; created_at: string
}

type API = {
  minimize: () => void
  maximize: () => void
  close: () => void
  hangmanGetWord:     (lang: string) => Promise<{ id: number; length: number; hint: string | null; category: string | null }>
  hangmanCheckLetter: (wordId: number, letter: string) => Promise<{ correct: boolean; positions: number[] }>
  hangmanRevealWord:  (wordId: number) => Promise<{ word: string }>
  wordleGetDaily:     (lang: string) => Promise<{ slotKey: string; slotNum: number; wordLength: number }>
  wordleCheckGuess:   (guess: string, slotKey: string, lang: string) => Promise<{ result: { letter: string; status: string }[]; won: boolean }>
  quizGetQuestion:    (lang: string, seen: number[]) => Promise<{ id: number; question: string; options: string[]; category: string | null; difficulty: number; total: number }>
  quizCheckAnswer:    (questionId: number, answer: string) => Promise<{ correct: boolean; correctAnswer: string }>
  adminListWords:     (lang: string) => Promise<WordRow[]>
  adminCreateWord:    (data: object) => Promise<WordRow>
  adminUpdateWord:    (id: number, data: object) => Promise<WordRow>
  adminDeleteWord:    (id: number) => Promise<null>
  adminListQuestions: (lang: string) => Promise<QuestionRow[]>
  adminCreateQuestion:(data: object) => Promise<QuestionRow>
  adminUpdateQuestion:(id: number, data: object) => Promise<QuestionRow>
  adminDeleteQuestion:(id: number) => Promise<null>
}

declare global {
  interface Window { electronAPI: API }
}

function api(): API {
  if (typeof window === 'undefined' || !('electronAPI' in window)) {
    throw new Error('electronAPI not available')
  }
  return window.electronAPI
}

export const ipc = {
  win: {
    minimize: () => api().minimize(),
    maximize: () => api().maximize(),
    close:    () => api().close(),
  },
  hangman: {
    getWord:     (lang: string)                     => api().hangmanGetWord(lang),
    checkLetter: (wordId: number, letter: string)   => api().hangmanCheckLetter(wordId, letter),
    revealWord:  (wordId: number)                   => api().hangmanRevealWord(wordId),
  },
  wordle: {
    getDaily:    (lang: string)                           => api().wordleGetDaily(lang),
    checkGuess:  (guess: string, slotKey: string, lang: string) => api().wordleCheckGuess(guess, slotKey, lang),
  },
  quiz: {
    getQuestion: (lang: string, seen: number[])          => api().quizGetQuestion(lang, seen),
    checkAnswer: (questionId: number, answer: string)    => api().quizCheckAnswer(questionId, answer),
  },
  admin: {
    listWords:      (lang: string)             => api().adminListWords(lang),
    createWord:     (data: object)             => api().adminCreateWord(data),
    updateWord:     (id: number, data: object) => api().adminUpdateWord(id, data),
    deleteWord:     (id: number)               => api().adminDeleteWord(id),
    listQuestions:  (lang: string)             => api().adminListQuestions(lang),
    createQuestion: (data: object)             => api().adminCreateQuestion(data),
    updateQuestion: (id: number, data: object) => api().adminUpdateQuestion(id, data),
    deleteQuestion: (id: number)               => api().adminDeleteQuestion(id),
  },
}
