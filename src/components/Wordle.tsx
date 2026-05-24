'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { t, WORDLE_KEYBOARDS } from '../lib/i18n'
import { ipc } from '../lib/ipc'

const MAX_ATTEMPTS = 6

interface TileColor { status: string }
interface State {
  board: string[][]
  tileColors: (TileColor | null)[][]
  currentRow: number
  currentCol: number
  keyColors: Record<string, string>
  gameOver: boolean
  won: boolean
  wordLength: number
  slotKey: string
  slotNum: number
  feedback: string
}

function makeBoard(wl: number): string[][] {
  return Array.from({ length: MAX_ATTEMPTS }, () => Array(wl).fill(''))
}
function makeColors(wl: number): (TileColor | null)[][] {
  return Array.from({ length: MAX_ATTEMPTS }, () => Array(wl).fill(null))
}

interface Props { lang: string; notify: (msg: string, type?: 'success'|'error'|'info') => void }

export default function Wordle({ lang, notify }: Props) {
  const [state, setState] = useState<State>({
    board: makeBoard(5), tileColors: makeColors(5),
    currentRow: 0, currentCol: 0, keyColors: {},
    gameOver: false, won: false, wordLength: 5,
    slotKey: '', slotNum: 0, feedback: '',
  })
  const stateRef = useRef(state)
  stateRef.current = state

  const loadDaily = useCallback(async () => {
    try {
      const data = await ipc.wordle.getDaily(lang)
      setState({
        board: makeBoard(data.wordLength),
        tileColors: makeColors(data.wordLength),
        currentRow: 0, currentCol: 0, keyColors: {},
        gameOver: false, won: false,
        wordLength: data.wordLength,
        slotKey: data.slotKey,
        slotNum: data.slotNum,
        feedback: '',
      })
    } catch {
      notify(t('wordle_error_load', lang), 'error')
    }
  }, [lang, notify])

  useEffect(() => { loadDaily() }, [loadDaily])

  const showFeedback = useCallback((msg: string) => {
    setState(prev => ({ ...prev, feedback: msg }))
    setTimeout(() => setState(prev => prev.feedback === msg ? { ...prev, feedback: '' } : prev), 2000)
  }, [])

  const submitGuess = useCallback(async () => {
    const s = stateRef.current
    if (s.currentCol < s.wordLength) { showFeedback(t('wordle_enter_full', lang)); return }
    const guess = s.board[s.currentRow].join('')
    try {
      const data = await ipc.wordle.checkGuess(guess, s.slotKey, lang)
      const newTileColors = s.tileColors.map(r => [...r])
      data.result.forEach((r, c) => { newTileColors[s.currentRow][c] = { status: r.status } })

      const newKeyColors = { ...s.keyColors }
      data.result.forEach(r => {
        const k = r.letter.toUpperCase()
        const prev = newKeyColors[k]
        if (!prev || prev === 'absent' || (prev === 'present' && r.status === 'correct')) {
          newKeyColors[k] = r.status
        }
      })

      const won = data.won
      const nextRow = s.currentRow + 1
      const gameOver = won || nextRow >= MAX_ATTEMPTS

      setState(prev => ({
        ...prev,
        tileColors: newTileColors,
        keyColors: newKeyColors,
        currentRow: won ? prev.currentRow : nextRow,
        currentCol: 0,
        gameOver,
        won,
        feedback: '',
      }))
    } catch {
      showFeedback(t('wordle_error_check', lang))
    }
  }, [lang, showFeedback])

  const handleKey = useCallback((key: string) => {
    const s = stateRef.current
    if (s.gameOver) return
    if (key === '⌫') {
      if (s.currentCol > 0) {
        setState(prev => {
          const newBoard = prev.board.map(r => [...r])
          newBoard[prev.currentRow][prev.currentCol - 1] = ''
          return { ...prev, board: newBoard, currentCol: prev.currentCol - 1 }
        })
      }
      return
    }
    if (key === 'ENTER') { submitGuess(); return }
    if (s.currentCol < s.wordLength) {
      setState(prev => {
        const newBoard = prev.board.map(r => [...r])
        newBoard[prev.currentRow][prev.currentCol] = key
        return { ...prev, board: newBoard, currentCol: prev.currentCol + 1 }
      })
    }
  }, [submitGuess])

  useEffect(() => {
    const validKeys = new Set(
      (WORDLE_KEYBOARDS[lang] || WORDLE_KEYBOARDS.ru).flat().filter(k => k !== 'ENTER' && k !== '⌫')
    )
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { handleKey('ENTER'); return }
      if (e.key === 'Backspace') { handleKey('⌫'); return }
      const up = e.key.toUpperCase()
      if (validKeys.has(up)) handleKey(up)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lang, handleKey])

  const slotLabelKey = `wordle_slot_${state.slotNum}` as Parameters<typeof t>[0]
  const rows = WORDLE_KEYBOARDS[lang] || WORDLE_KEYBOARDS.ru

  const attemptSuffix = (n: number) => {
    if (lang !== 'ru') return ''
    if (n === 1) return 'ку'
    if (n >= 2 && n <= 4) return 'ки'
    return 'ок'
  }

  return (
    <div className="page">
      <div className="page-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        {t('wordle_title', lang)}
      </div>
      <p className="page-subtitle">{t('wordle_subtitle', lang)}</p>

      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span className="wordle-slot-badge">📅 {t(slotLabelKey, lang)}</span>
        </div>

        <div className="wordle-legend">
          {(['correct','present','absent'] as const).map(s => (
            <div key={s} className="wordle-legend-item">
              <div className={`legend-dot ${s}`} />
              {t(`wordle_legend_${s}` as Parameters<typeof t>[0], lang)}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="wordle-grid">
          {Array.from({ length: MAX_ATTEMPTS }, (_, r) => (
            <div key={r} className="wordle-row">
              {Array.from({ length: state.wordLength }, (_, c) => {
                const color = state.tileColors[r]?.[c]
                const letter = state.board[r]?.[c] || ''
                let cls = 'wordle-tile'
                if (color) cls += ` ${color.status}`
                else if (r === state.currentRow && letter) cls += ' filled'
                else if (r === state.currentRow) cls += ' current'
                return <div key={c} className={cls}>{letter}</div>
              })}
            </div>
          ))}
        </div>

        {/* Feedback */}
        {state.feedback && (
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '.875rem', margin: '8px 0' }}>
            {state.feedback}
          </p>
        )}

        {/* Result */}
        {state.gameOver && (
          <div className={`game-result ${state.won ? 'win' : 'lose'}`} style={{ marginBottom: 12 }}>
            {state.won
              ? `🏆 ${t('wordle_won', lang).replace('{n}', String(state.currentRow)).replace('{s}', attemptSuffix(state.currentRow))}`
              : `⏱ ${t('wordle_lost', lang)}`
            }
          </div>
        )}

        {/* Keyboard */}
        <div className="wordle-keyboard">
          {rows.map((row, ri) => (
            <div key={ri} className="wordle-key-row">
              {row.map(key => (
                <button
                  key={key}
                  className={`wordle-key${key === 'ENTER' || key === '⌫' ? ' wide' : ''}${state.keyColors[key] ? ' ' + state.keyColors[key] : ''}`}
                  onClick={() => handleKey(key)}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
