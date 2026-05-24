'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { t } from '../lib/i18n'
import { ipc } from '../lib/ipc'
import Hangman from '../components/Hangman'
import Wordle from '../components/Wordle'
import Quiz from '../components/Quiz'
import Admin from '../components/Admin'

type Page = 'home' | 'hangman' | 'wordle' | 'quiz' | 'admin'
type NotifType = 'success' | 'error' | 'info'

interface Notif { msg: string; type: NotifType; id: number }

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [lang, setLang] = useState<string>('ru')
  const [notif, setNotif] = useState<Notif | null>(null)
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('lang') || 'ru'
    setLang(saved)
  }, [])

  const changeLang = useCallback((l: string) => {
    setLang(l)
    localStorage.setItem('lang', l)
  }, [])

  const notify = useCallback((msg: string, type: NotifType = 'info') => {
    if (notifTimer.current) clearTimeout(notifTimer.current)
    setNotif({ msg, type, id: Date.now() })
    notifTimer.current = setTimeout(() => setNotif(null), 3000)
  }, [])

  const navItems: { id: Page; labelKey: string; icon: React.ReactNode }[] = [
    { id: 'home',    labelKey: 'nav_home',    icon: <IconHome /> },
    { id: 'hangman', labelKey: 'nav_hangman', icon: <IconHangman /> },
    { id: 'wordle',  labelKey: 'nav_wordle',  icon: <IconWordle /> },
    { id: 'quiz',    labelKey: 'nav_quiz',    icon: <IconQuiz /> },
    { id: 'admin',   labelKey: 'nav_admin',   icon: <IconAdmin /> },
  ]

  return (
    <div id="app">
      {/* Sidebar */}
      <div id="sidebar">
        <div className="sidebar-titlebar">
          <button className="win-btn win-close" onClick={() => ipc.win.close()} title="Close" />
          <button className="win-btn win-min"   onClick={() => ipc.win.minimize()} title="Minimize" />
          <button className="win-btn win-max"   onClick={() => ipc.win.maximize()} title="Maximize" />
        </div>

        <div className="sidebar-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          Word Games
        </div>

        <nav>
          {navItems.map(item => (
            <div
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => setCurrentPage(item.id)}
            >
              {item.icon}
              {t(item.labelKey as Parameters<typeof t>[0], lang)}
            </div>
          ))}
        </nav>

        <div className="lang-switcher">
          {(['ru','en','tm'] as const).map(l => (
            <button
              key={l}
              className={`lang-btn ${lang === l ? 'active' : ''}`}
              onClick={() => changeLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">v1.0.0</div>
      </div>

      {/* Content */}
      <div id="content">
        {currentPage === 'home' && <HomePage lang={lang} onNavigate={setCurrentPage} />}
        {currentPage === 'hangman' && <Hangman key={lang} lang={lang} notify={notify} />}
        {currentPage === 'wordle'  && <Wordle  key={lang} lang={lang} notify={notify} />}
        {currentPage === 'quiz'    && <Quiz    key={lang} lang={lang} notify={notify} />}
        {currentPage === 'admin'   && <Admin   key={lang} lang={lang} notify={notify} />}
      </div>

      {/* Notification */}
      <div
        id="notification"
        className={notif ? `show ${notif.type}` : ''}
      >
        {notif?.msg}
      </div>
    </div>
  )
}

// ─── Home page ────────────────────────────────────────────────────────────────

function HomePage({ lang, onNavigate }: { lang: string; onNavigate: (p: Page) => void }) {
  return (
    <div className="page" style={{ maxWidth: 840 }}>
      <div className="home-hero">
        <h1>{t('home_title', lang)}</h1>
        <p>{t('home_subtitle', lang)}</p>
      </div>
      <div className="games-grid">
        <div className="game-card" onClick={() => onNavigate('hangman')}>
          <div className="game-icon"><IconHangmanLg /></div>
          <h3>{t('nav_hangman', lang)}</h3>
          <p>{t('home_hangman_desc', lang)}</p>
        </div>
        <div className="game-card" onClick={() => onNavigate('wordle')}>
          <div className="game-icon"><IconWordleLg /></div>
          <h3>{t('nav_wordle', lang)}</h3>
          <p>{t('home_wordle_desc', lang)}</p>
        </div>
        <div className="game-card" onClick={() => onNavigate('quiz')}>
          <div className="game-icon"><IconQuizLg /></div>
          <h3>{t('nav_quiz', lang)}</h3>
          <p>{t('home_quiz_desc', lang)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconHome() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function IconHangman() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22V12M12 8a2 2 0 100-4 2 2 0 000 4zM8 17l4 5M16 17l-4 5M8 12l4 2 4-2"/><path d="M4 3h16M7 3v5"/></svg>
}
function IconWordle() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
}
function IconQuiz() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg>
}
function IconAdmin() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
}
function IconHangmanLg() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22V12M12 8a2 2 0 100-4 2 2 0 000 4zM8 17l4 5M16 17l-4 5M8 12l4 2 4-2"/><path d="M4 3h16M7 3v5"/></svg>
}
function IconWordleLg() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
}
function IconQuizLg() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01"/></svg>
}
