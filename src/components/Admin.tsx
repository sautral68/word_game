'use client'

import { useState, useEffect, useCallback } from 'react'
import { t } from '../lib/i18n'
import { ipc, WordRow, QuestionRow } from '../lib/ipc'

type Tab = 'words' | 'questions'

const LANG_LABELS: Record<string, string> = { ru: 'RU', en: 'EN', tm: 'TM' }

interface Props { lang: string; notify: (msg: string, type?: 'success'|'error'|'info') => void }

export default function Admin({ lang, notify }: Props) {
  const [tab, setTab] = useState<Tab>('words')

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        {t('admin_title', lang)}
      </div>
      <p className="page-subtitle">{t('admin_subtitle', lang)}</p>

      <div className="admin-tabs">
        <button className={`admin-tab${tab === 'words' ? ' active' : ''}`} onClick={() => setTab('words')}>
          📝 {t('admin_tab_words', lang)}
        </button>
        <button className={`admin-tab${tab === 'questions' ? ' active' : ''}`} onClick={() => setTab('questions')}>
          ❓ {t('admin_tab_questions', lang)}
        </button>
      </div>

      {tab === 'words'     && <WordsPanel     key={lang} lang={lang} notify={notify} langLabels={LANG_LABELS} />}
      {tab === 'questions' && <QuestionsPanel key={lang} lang={lang} notify={notify} langLabels={LANG_LABELS} />}
    </div>
  )
}

// ─── Words panel ──────────────────────────────────────────────────────────────

function WordsPanel({ lang, notify, langLabels }: { lang: string; notify: Props['notify']; langLabels: Record<string,string> }) {
  const [words, setWords] = useState<WordRow[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ word: '', category: '', difficulty: '1', hint: '' })

  const loadWords = useCallback(async () => {
    try { setWords(await ipc.admin.listWords(lang)) }
    catch { notify(t('admin_error_load_words', lang), 'error') }
  }, [lang, notify])

  useEffect(() => { loadWords() }, [loadWords])

  const resetForm = () => {
    setEditingId(null)
    setForm({ word: '', category: '', difficulty: '1', hint: '' })
  }

  const editWord = (w: WordRow) => {
    setEditingId(w.id)
    setForm({ word: w.word, category: w.category || '', difficulty: String(w.difficulty), hint: w.hint || '' })
  }

  const submitWord = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = { word: form.word, category: form.category || null, difficulty: Number(form.difficulty), hint: form.hint || null, language: lang }
    try {
      if (editingId) {
        await ipc.admin.updateWord(editingId, body)
        notify(t('admin_word_updated', lang), 'success')
        resetForm()
      } else {
        await ipc.admin.createWord(body)
        notify(t('admin_word_added', lang), 'success')
      }
      loadWords()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error', 'error')
    }
  }

  const deleteWord = async (id: number) => {
    if (!confirm(`${t('admin_confirm_del_word', lang)} #${id}?`)) return
    try {
      await ipc.admin.deleteWord(id)
      notify(t('admin_word_deleted', lang), 'success')
      loadWords()
    } catch {
      notify(t('admin_error_del', lang), 'error')
    }
  }

  return (
    <>
      <div className="card">
        <div className="section-title">{editingId ? `${t('admin_edit_word', lang)} #${editingId}` : t('admin_add_word', lang)}</div>
        <form onSubmit={submitWord}>
          <div className="admin-form">
            <div className="form-group">
              <label>{t('admin_label_word', lang)}</label>
              <input required className="form-input" value={form.word} onChange={e => setForm(p => ({...p, word: e.target.value}))} />
            </div>
            <div className="form-group">
              <label>{t('admin_label_category', lang)}</label>
              <input className="form-input" value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))} />
            </div>
            <div className="form-group">
              <label>{t('admin_label_difficulty', lang)}</label>
              <select className="form-input" value={form.difficulty} onChange={e => setForm(p => ({...p, difficulty: e.target.value}))}>
                <option value="1">{t('admin_diff_easy', lang)}</option>
                <option value="2">{t('admin_diff_medium', lang)}</option>
                <option value="3">{t('admin_diff_hard', lang)}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t('admin_label_hint', lang)}</label>
              <input className="form-input" value={form.hint} onChange={e => setForm(p => ({...p, hint: e.target.value}))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary">{t('admin_save', lang)}</button>
            {editingId && <button type="button" className="btn btn-secondary" onClick={resetForm}>{t('admin_cancel', lang)}</button>}
          </div>
        </form>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t('admin_col_word', lang)}</th>
              <th>{t('admin_col_category', lang)}</th>
              <th>{t('admin_col_difficulty', lang)}</th>
              <th>{t('admin_col_hint', lang)}</th>
              <th>{t('lang_label', lang)}</th>
              <th>{t('admin_col_actions', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {words.map(w => (
              <tr key={w.id}>
                <td>{w.id}</td>
                <td><b>{w.word}</b></td>
                <td>{w.category ? <span className="badge">{w.category}</span> : '—'}</td>
                <td>{'★'.repeat(w.difficulty)}{'☆'.repeat(3 - w.difficulty)}</td>
                <td>{w.hint || '—'}</td>
                <td><span className={`lang-badge lang-${w.language}`}>{langLabels[w.language] || w.language}</span></td>
                <td className="table-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => editWord(w)}>✏</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteWord(w.id)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ─── Questions panel ──────────────────────────────────────────────────────────

function QuestionsPanel({ lang, notify, langLabels }: { lang: string; notify: Props['notify']; langLabels: Record<string,string> }) {
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({ question: '', correct: '', b: '', c: '', d: '', category: '', difficulty: '1' })

  const loadQuestions = useCallback(async () => {
    try { setQuestions(await ipc.admin.listQuestions(lang)) }
    catch { notify(t('admin_error_load_qs', lang), 'error') }
  }, [lang, notify])

  useEffect(() => { loadQuestions() }, [loadQuestions])

  const resetForm = () => {
    setEditingId(null)
    setForm({ question: '', correct: '', b: '', c: '', d: '', category: '', difficulty: '1' })
  }

  const editQ = (q: QuestionRow) => {
    setEditingId(q.id)
    setForm({ question: q.question, correct: q.correct_answer, b: q.option_b, c: q.option_c, d: q.option_d, category: q.category || '', difficulty: String(q.difficulty) })
  }

  const submitQ = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = { question: form.question, correct_answer: form.correct, option_b: form.b, option_c: form.c, option_d: form.d, category: form.category || null, difficulty: Number(form.difficulty), language: lang }
    try {
      if (editingId) {
        await ipc.admin.updateQuestion(editingId, body)
        notify(t('admin_q_updated', lang), 'success')
        resetForm()
      } else {
        await ipc.admin.createQuestion(body)
        notify(t('admin_q_added', lang), 'success')
      }
      loadQuestions()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Error', 'error')
    }
  }

  const deleteQ = async (id: number) => {
    if (!confirm(`${t('admin_confirm_del_q', lang)} #${id}?`)) return
    try {
      await ipc.admin.deleteQuestion(id)
      notify(t('admin_q_deleted', lang), 'success')
      loadQuestions()
    } catch {
      notify(t('admin_error_del', lang), 'error')
    }
  }

  const f = (key: keyof typeof form, label: Parameters<typeof t>[0], req = false) => (
    <div className="form-group">
      <label>{t(label, lang)}</label>
      <input required={req} className="form-input" value={form[key]} onChange={e => setForm(p => ({...p, [key]: e.target.value}))} />
    </div>
  )

  return (
    <>
      <div className="card">
        <div className="section-title">{editingId ? `${t('admin_edit_q', lang)} #${editingId}` : t('admin_add_q', lang)}</div>
        <form onSubmit={submitQ}>
          <div className="admin-form full-width">
            <div className="form-group span2">
              <label>{t('admin_label_question', lang)}</label>
              <input required className="form-input" value={form.question} onChange={e => setForm(p => ({...p, question: e.target.value}))} />
            </div>
          </div>
          <div className="admin-form">
            {f('correct', 'admin_label_correct', true)}
            {f('b', 'admin_label_opt_b', true)}
            {f('c', 'admin_label_opt_c', true)}
            {f('d', 'admin_label_opt_d', true)}
            {f('category', 'admin_label_category')}
            <div className="form-group">
              <label>{t('admin_label_difficulty', lang)}</label>
              <select className="form-input" value={form.difficulty} onChange={e => setForm(p => ({...p, difficulty: e.target.value}))}>
                <option value="1">{t('admin_diff_easy', lang)}</option>
                <option value="2">{t('admin_diff_medium', lang)}</option>
                <option value="3">{t('admin_diff_hard', lang)}</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary">{t('admin_save', lang)}</button>
            {editingId && <button type="button" className="btn btn-secondary" onClick={resetForm}>{t('admin_cancel', lang)}</button>}
          </div>
        </form>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>{t('admin_col_question', lang)}</th>
              <th>{t('admin_col_correct', lang)}</th>
              <th>{t('admin_col_category', lang)}</th>
              <th>{t('lang_label', lang)}</th>
              <th>{t('admin_col_actions', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {questions.map(q => (
              <tr key={q.id}>
                <td>{q.id}</td>
                <td style={{ maxWidth: 240 }}>{q.question}</td>
                <td style={{ color: 'var(--success-fg)' }}>{q.correct_answer}</td>
                <td>{q.category ? <span className="badge">{q.category}</span> : '—'}</td>
                <td><span className={`lang-badge lang-${q.language}`}>{langLabels[q.language] || q.language}</span></td>
                <td className="table-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => editQ(q)}>✏</button>
                  <button className="btn btn-danger btn-sm" onClick={() => deleteQ(q.id)}>🗑</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
