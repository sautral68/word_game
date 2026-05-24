'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close:    () => ipcRenderer.send('window:close'),

  // Hangman
  hangmanGetWord:    (lang)           => ipcRenderer.invoke('hangman:getWord', lang),
  hangmanCheckLetter:(wordId, letter) => ipcRenderer.invoke('hangman:checkLetter', { wordId, letter }),
  hangmanRevealWord: (wordId)         => ipcRenderer.invoke('hangman:revealWord', wordId),

  // Wordle
  wordleGetDaily:  (lang)                    => ipcRenderer.invoke('wordle:getDaily', lang),
  wordleCheckGuess:(guess, slotKey, lang)    => ipcRenderer.invoke('wordle:checkGuess', { guess, slotKey, lang }),

  // Quiz
  quizGetQuestion: (lang, seen)              => ipcRenderer.invoke('quiz:getQuestion', { lang, seen }),
  quizCheckAnswer: (questionId, answer)      => ipcRenderer.invoke('quiz:checkAnswer', { questionId, answer }),

  // Admin – words
  adminListWords:    (lang)       => ipcRenderer.invoke('admin:listWords', lang),
  adminCreateWord:   (data)       => ipcRenderer.invoke('admin:createWord', data),
  adminUpdateWord:   (id, data)   => ipcRenderer.invoke('admin:updateWord', { id, data }),
  adminDeleteWord:   (id)         => ipcRenderer.invoke('admin:deleteWord', id),

  // Admin – questions
  adminListQuestions:    (lang)     => ipcRenderer.invoke('admin:listQuestions', lang),
  adminCreateQuestion:   (data)     => ipcRenderer.invoke('admin:createQuestion', data),
  adminUpdateQuestion:   (id, data) => ipcRenderer.invoke('admin:updateQuestion', { id, data }),
  adminDeleteQuestion:   (id)       => ipcRenderer.invoke('admin:deleteQuestion', id),
})
