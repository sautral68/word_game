'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { t, ALPHABETS } from '../lib/i18n'
import { ipc } from '../lib/ipc'

const MAX_ERRORS = 6

const SVG_PARTS = [
  `<line x1="20" y1="180" x2="140" y2="180" stroke="#e94560" stroke-width="4" stroke-linecap="round"/>
   <line x1="60" y1="180" x2="60"  y2="20"  stroke="#e94560" stroke-width="4" stroke-linecap="round"/>
   <line x1="60" y1="20"  x2="120" y2="20"  stroke="#e94560" stroke-width="4" stroke-linecap="round"/>
   <line x1="120" y1="20" x2="120" y2="45"  stroke="#e94560" stroke-width="3" stroke-linecap="round"/>`,
  `<circle cx="120" cy="60" r="15" stroke="#eaeaea" stroke-width="3" fill="none"/>`,
  `<line x1="120" y1="75" x2="120" y2="120" stroke="#eaeaea" stroke-width="3" stroke-linecap="round"/>`,
  `<line x1="120" y1="85" x2="95"  y2="105" stroke="#eaeaea" stroke-width="3" stroke-linecap="round"/>`,
  `<line x1="120" y1="85" x2="145" y2="105" stroke="#eaeaea" stroke-width="3" stroke-linecap="round"/>`,
  `<line x1="120" y1="120" x2="95"  y2="150" stroke="#eaeaea" stroke-width="3" stroke-linecap="round"/>`,
  `<line x1="120" y1="120" x2="145" y2="150" stroke="#eaeaea" stroke-width="3" stroke-linecap="round"/>`,
]

interface State {
  wordId: number | null
  wordLength: number
  revealed: (string | null)[]
  hint: string | null
  category: string | null
  guessed: Set<string>
  keyStatus: Record<string, 'correct' | 'wrong'>
  errors: number
  gameOver: boolean
  won: boolean
  lostWord: string | null
}

const INIT: State = {
  wordId: null, wordLength: 0, revealed: [], hint: null, category: null,
  guessed: new Set(), keyStatus: {}, errors: 0, gameOver: false, won: false, lostWord: null,
}

interface Props { lang: string; notify: (msg: string, type?: 'success'|'error'|'info') => void }

export default function Hangman({ lang, notify }: Props) {
  const [state, setState] = useState<State>(INIT)
  const stateRef = useRef(state)
  stateRef.current = state

  const newGame = useCallback(async () => {
    try {
      const data = await ipc.hangman.getWord(lang)
      setState({
        wordId: data.id,
        wordLength: data.length,
        revealed: Array(data.length).fill(null),
        hint: data.hint,
        category: data.category,
        guessed: new Set(),
        keyStatus: {},
        errors: 0,
        gameOver: false,
        won: false,
        lostWord: null,
      })
    } catch {
      notify(t('hangman_error_load', lang), 'error')
    }
  }, [lang, notify])

  useEffect(() => { newGame() }, [newGame])

  const guess = useCallback(async (letter: string) => {
    const s = stateRef.current
    if (s.gameOver || s.guessed.has(letter) || !s.wordId) return

    try {
      const data = await ipc.hangman.checkLetter(s.wordId, letter)

      setState(prev => {
        const newRevealed = [...prev.revealed]
        if (data.correct) data.positions.forEach(i => { newRevealed[i] = letter })

        const newErrors = data.correct ? prev.errors : prev.errors + 1
        const newKeyStatus = { ...prev.keyStatus, [letter]: data.correct ? 'correct' : 'wrong' } as Record<string, 'correct'|'wrong'>
        const newGuessed = new Set(prev.guessed).add(letter)
        const allRevealed = data.correct && newRevealed.every(ch => ch !== null)
        const lost = !data.correct && newErrors >= MAX_ERRORS

        return {
          ...prev,
          revealed: newRevealed,
          errors: newErrors,
          keyStatus: newKeyStatus,
          guessed: newGuessed,
          gameOver: allRevealed || lost,
          won: allRevealed,
        }
      })

      if (!data.correct && s.errors + 1 >= MAX_ERRORS) {
        const revealed = await ipc.hangman.revealWord(s.wordId)
        setState(prev => ({ ...prev, lostWord: revealed.word }))
      }
    } catch {
      notify(t('hangman_error_check', lang), 'error')
    }
  }, [lang, notify])

  const svgContent = SVG_PARTS[0] + SVG_PARTS.slice(1, state.errors + 1).join('')
  const alphabet = ALPHABETS[lang] || ALPHABETS.ru
  const cat = state.category ? ` · ${t('hangman_category', lang)}: ${state.category}` : ''

  return (
    <div className="page">
      <div className="page-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22V12M12 8a2 2 0 100-4 2 2 0 000 4zM8 17l4 5M16 17l-4 5M8 12l4 2 4-2"/>
          <path d="M4 3h16M7 3v5"/>
        </svg>
        {t('hangman_title', lang)}
      </div>
      <p className="page-subtitle">{t('hangman_subtitle', lang)}</p>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={newGame}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
            </svg>
            {t('hangman_new_game', lang)}
          </button>
        </div>

        <div className="hangman-drawing">
          <svg width="160" height="200" dangerouslySetInnerHTML={{ __html: svgContent }} />
        </div>

        <p className="hangman-status">
          {t('hangman_errors', lang)}: {state.errors} / {MAX_ERRORS}{cat}
        </p>

        {state.hint && (
          <p className="hint-text">{t('hangman_hint_label', lang)}: {state.hint}</p>
        )}

        {/* Word display */}
        {!state.lostWord && (
          <div className="word-display">
            {state.revealed.map((ch, i) => (
              <div key={i} className={`letter-slot${ch ? ' revealed' : ''}`}>{ch || ''}</div>
            ))}
          </div>
        )}

        {/* Keyboard */}
        {!state.gameOver && (
          <div className="keyboard">
            {alphabet.map(letter => (
              <button
                key={letter}
                className={`key-btn${state.keyStatus[letter] ? ' ' + state.keyStatus[letter] : ''}`}
                disabled={state.guessed.has(letter)}
                onClick={() => guess(letter)}
              >
                {letter}
              </button>
            ))}
          </div>
        )}

        {/* Result */}
        {state.gameOver && state.won && (
          <div className="game-result win">
            🏆 {t('hangman_win', lang)}
          </div>
        )}

        {state.gameOver && !state.won && state.lostWord && (
          <div className="hangman-loss">
            <div className="hangman-loss-title">✕ {t('hangman_lose_title', lang)}</div>
            <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginBottom: 4 }}>{t('hangman_lose_was', lang)}</p>
            <div className="hangman-loss-word">
              {[...state.lostWord].map((ch, i) => (
                <div key={i} className="hangman-loss-letter">{ch}</div>
              ))}
            </div>
            {state.hint && (
              <div className="hangman-loss-hint">{t('hangman_hint_label', lang)}: {state.hint}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
