'use client'

import { useState, useCallback, useEffect } from 'react'
import { t } from '../lib/i18n'
import { ipc } from '../lib/ipc'

type Phase = 'setup' | 'playing' | 'finish'

interface QuizState {
  phase: Phase
  questionId: number | null
  question: string
  options: string[]
  category: string | null
  difficulty: number
  score: number
  answered: boolean
  answerStatus: Record<string, 'correct-ans' | 'wrong-ans'>
  feedbackMsg: string
  feedbackOk: boolean
  seenIds: number[]
  targetCount: number
  askedCount: number
  totalInDb: number
}

const INIT: QuizState = {
  phase: 'setup', questionId: null, question: '', options: [],
  category: null, difficulty: 1, score: 0, answered: false,
  answerStatus: {}, feedbackMsg: '', feedbackOk: false,
  seenIds: [], targetCount: 0, askedCount: 0, totalInDb: 15,
}

interface Props { lang: string; notify: (msg: string, type?: 'success'|'error'|'info') => void }

export default function Quiz({ lang, notify }: Props) {
  const [state, setState] = useState<QuizState>(INIT)

  // Get total count on mount
  useEffect(() => {
    ipc.quiz.getQuestion(lang, []).then(q => {
      setState(prev => ({ ...prev, totalInDb: q.total }))
    }).catch(() => {})
  }, [lang])

  const loadQuestion = useCallback(async (seenIds: number[], askedCount: number, score: number, targetCount: number) => {
    try {
      const q = await ipc.quiz.getQuestion(lang, seenIds)
      const newSeen = seenIds.includes(q.id) ? seenIds : [...seenIds, q.id]
      const finalSeen = newSeen.length >= q.total ? [q.id] : newSeen
      setState(prev => ({
        ...prev,
        questionId: q.id,
        question: q.question,
        options: q.options,
        category: q.category,
        difficulty: q.difficulty,
        answered: false,
        answerStatus: {},
        feedbackMsg: '',
        seenIds: finalSeen,
        askedCount,
        score,
        totalInDb: q.total,
        targetCount,
      }))
    } catch {
      notify(t('quiz_error_load', lang), 'error')
    }
  }, [lang, notify])

  const startQuiz = useCallback((count: number) => {
    setState(prev => ({ ...prev, phase: 'playing', score: 0, seenIds: [], askedCount: 0, targetCount: count }))
    loadQuestion([], 1, 0, count)
  }, [loadQuestion])

  const pickAnswer = useCallback(async (answer: string) => {
    if (state.answered || !state.questionId) return
    setState(prev => ({ ...prev, answered: true }))
    try {
      const res = await ipc.quiz.checkAnswer(state.questionId, answer)
      const newScore = state.score + (res.correct ? 1 : 0)
      const newStatus: Record<string, 'correct-ans'|'wrong-ans'> = {}
      if (res.correct) {
        newStatus[answer] = 'correct-ans'
      } else {
        newStatus[answer] = 'wrong-ans'
        newStatus[res.correctAnswer] = 'correct-ans'
      }
      setState(prev => ({
        ...prev,
        score: newScore,
        answerStatus: newStatus,
        feedbackMsg: res.correct ? t('quiz_correct', lang) : `${t('quiz_wrong_prefix', lang)} ${res.correctAnswer}`,
        feedbackOk: res.correct,
      }))
    } catch {
      notify(t('quiz_error_check', lang), 'error')
    }
  }, [state.answered, state.questionId, state.score, lang, notify])

  const nextQuestion = useCallback(() => {
    const nextAsked = state.askedCount + 1
    if (nextAsked > state.targetCount) {
      setState(prev => ({ ...prev, phase: 'finish' }))
    } else {
      loadQuestion(state.seenIds, nextAsked, state.score, state.targetCount)
    }
  }, [state, loadQuestion])

  const resetToSetup = useCallback(() => {
    setState({ ...INIT, totalInDb: state.totalInDb })
  }, [state.totalInDb])

  if (state.phase === 'finish') {
    const pct = Math.round((state.score / state.targetCount) * 100)
    let gradeClass: string, gradeKey: Parameters<typeof t>[0]
    if (pct >= 90)      { gradeClass = 'grade-excellent'; gradeKey = 'quiz_grade_excellent' }
    else if (pct >= 70) { gradeClass = 'grade-good';      gradeKey = 'quiz_grade_good' }
    else if (pct >= 50) { gradeClass = 'grade-ok';        gradeKey = 'quiz_grade_ok' }
    else                { gradeClass = 'grade-poor';      gradeKey = 'quiz_grade_poor' }

    return (
      <div className="page">
        <QuizHeader lang={lang} score={state.score} askedCount={state.targetCount} phase="finish" />
        <div className="card">
          <div className="quiz-finish">
            <div className="quiz-finish-score">{state.score}/{state.targetCount}</div>
            <div className="quiz-finish-label">{t('quiz_result_of', lang)} {state.targetCount} {t('quiz_result_qs', lang)}</div>
            <div className={`quiz-finish-grade ${gradeClass}`}>{t(gradeKey, lang)} · {pct}%</div>
            <button className="btn btn-primary" onClick={resetToSetup}>
              🔄 {t('quiz_restart', lang)}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (state.phase === 'setup') {
    const options = [5, 10, 15, state.totalInDb].filter((v, i, a) => a.indexOf(v) === i)
    return (
      <div className="page">
        <QuizHeader lang={lang} score={0} askedCount={0} phase="setup" />
        <div className="card">
          <div className="quiz-setup">
            <h3>{t('quiz_setup_title', lang)}</h3>
            <p>{t('quiz_setup_sub', lang)}</p>
            <div className="quiz-count-grid">
              {options.map(n => (
                <button key={n} className="quiz-count-btn" onClick={() => startQuiz(n)}>
                  {n}
                  <span>{n === state.totalInDb ? t('quiz_all', lang) : t('quiz_count_label', lang)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const isLast = state.askedCount >= state.targetCount

  return (
    <div className="page">
      <QuizHeader lang={lang} score={state.score} askedCount={state.askedCount} phase="playing" targetCount={state.targetCount} />
      <div className="card">
        {/* Meta */}
        <div className="quiz-meta">
          {state.category && <span className="badge">{state.category}</span>}
          <span>{'★'.repeat(state.difficulty)}{'☆'.repeat(3 - state.difficulty)}</span>
        </div>

        <p className="quiz-question-text">{state.question || t('quiz_loading', lang)}</p>

        <div className="options-grid">
          {state.options.map(opt => (
            <button
              key={opt}
              className={`option-btn${state.answerStatus[opt] ? ' ' + state.answerStatus[opt] : ''}`}
              disabled={state.answered}
              onClick={() => pickAnswer(opt)}
            >
              {opt}
            </button>
          ))}
        </div>

        <div className="quiz-feedback" style={{ color: state.feedbackOk ? 'var(--success-fg)' : 'var(--error-fg)' }}>
          {state.feedbackMsg}
        </div>

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button
            className="btn btn-primary"
            disabled={!state.answered}
            onClick={nextQuestion}
          >
            {isLast ? `🏆 ${t('quiz_finish_btn', lang)}` : `➡ ${t('quiz_next', lang)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuizHeader({ lang, score, askedCount, phase, targetCount }: {
  lang: string; score: number; askedCount: number; phase: Phase; targetCount?: number
}) {
  const pct = askedCount > 0 ? Math.round((score / askedCount) * 100) : null
  return (
    <>
      <div className="page-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/>
        </svg>
        {t('quiz_title', lang)}
      </div>
      <p className="page-subtitle">{t('quiz_subtitle', lang)}</p>
      <div className="quiz-score">
        <div>
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 2 }}>{t('quiz_score', lang)}</div>
          <div className="score-badge">{score} / {askedCount}</div>
        </div>
        <div className="quiz-progress">
          {phase === 'playing' && targetCount
            ? `${t('quiz_question_of', lang)} ${askedCount} ${t('quiz_of', lang)} ${targetCount}`
            : ''}
        </div>
        <div>
          <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginBottom: 2 }}>{t('quiz_accuracy', lang)}</div>
          <div className="score-badge">{pct !== null ? `${pct}%` : '—'}</div>
        </div>
      </div>
    </>
  )
}
