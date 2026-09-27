import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactNode } from 'react'
import { useChat } from './useChat'
import type { Credentials, Message } from './model'
import './styles.css'

const SETUP_URL = 'https://github.com/ermahavwork/green-api-max-chat/blob/main/docs/SETUP.md'
const clock = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' })
const calendar = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' })
type IconName = 'chat' | 'arrow' | 'back' | 'plus' | 'search' | 'send' | 'exit' | 'close' | 'eye' | 'eyeOff' | 'check' | 'doubleCheck' | 'clock' | 'help' | 'lock' | 'alert'
const paths: Record<IconName, ReactNode> = {
  chat: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5A8.5 8.5 0 0 1 11.5 3h1a8.5 8.5 0 0 1 8.5 8.5Z" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  back: <path d="m14 6-6 6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  send: <><path d="m21 3-7 18-4-7-7-4L21 3Z" /><path d="m10 14 5-5" /></>,
  exit: <><path d="M9 4H4v16h5m5-13 5 5-5 5m-6-5h11" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="m3 3 18 18M10 5a12 12 0 0 1 2 0c6.5 0 10 7 10 7a20 20 0 0 1-3 4M6 6a20 20 0 0 0-4 6s3.5 7 10 7a11 11 0 0 0 5-1M10 10a3 3 0 0 0 4 4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  doubleCheck: <><path d="m2 12 4 4L16 6m-4 10L22 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .7-1.5 1-1.5 2m0 3h.01" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3h.01" /></>,
}
function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}><span className="brand-mark"><Icon name="chat" /></span><span>MAX<span className="brand-light"> / chat</span><small>на GREEN-API</small></span></div>
}
function Avatar({ name, id }: { name: string; id: string }) {
  const color = [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 4
  const initials = name.replace(/^\+/, '').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
  return <span className={`avatar avatar-${color}`} aria-hidden="true">{initials || '#'}</span>
}
function Status({ status }: { status: Message['status'] }) {
  const labels = { pending: 'Отправляется', queued: 'Принято API', delivered: 'Доставлено', read: 'Прочитано', failed: 'Не отправлено', unknown: 'Статус не подтверждён' }
  if (!status) return null
  const icon = status === 'pending' ? 'clock' : status === 'failed' || status === 'unknown' ? 'alert' : status === 'read' || status === 'delivered' ? 'doubleCheck' : 'check'
  return <span className={`message-status status-${status}`} title={labels[status]} aria-label={labels[status]}><Icon name={icon} />{(status === 'failed' || status === 'unknown') && <span>{labels[status]}</span>}</span>
}
function Login({ onLogin, onDemo }: { onLogin: (credentials: Credentials) => Promise<void>; onDemo: () => void }) {
  const [showToken, setShowToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const errorRef = useRef<HTMLDivElement>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setLoading(true); setError('')
    try {
      await onLogin({ idInstance: String(data.get('idInstance')).trim(), apiTokenInstance: String(data.get('apiTokenInstance')).trim(), apiUrl: String(data.get('apiUrl')).trim() })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось подключиться. Проверьте параметры и попробуйте снова.')
      setTimeout(() => errorRef.current?.focus(), 0)
    } finally { setLoading(false) }
  }
  return <main className="login-page"><div className="login-shell">
    <section className="login-intro" aria-labelledby="welcome-title">
      <Brand />
      <div className="intro-copy"><span className="eyebrow">ПРОСТО БЫТЬ НА СВЯЗИ</span><h1 id="welcome-title">Ваши диалоги.<br />Один экран.</h1><p>Отправляйте и получайте сообщения MAX через ваш аккаунт GREEN-API.</p></div>
      <div className="conversation-art" aria-hidden="true"><span className="art-orbit" /><div className="art-bubble art-bubble-in"><span /><span /></div><div className="art-bubble art-bubble-out"><span /><span /><Icon name="doubleCheck" /></div><span className="art-dot" /></div>
      <div className="intro-footer"><span className="live-dot" />Текстовые сообщения · Личные чаты</div>
    </section>
    <section className="login-panel" aria-labelledby="login-title"><div className="panel-top"><span className="step-pill">Подключение</span><a className="icon-button" href={SETUP_URL} target="_blank" rel="noreferrer" aria-label="Инструкция по настройке"><Icon name="help" /></a></div>
      <h2 id="login-title">Войти в чат</h2><p className="muted login-description">Введите параметры авторизованного MAX-инстанса из <a href="https://console.green-api.com/" target="_blank" rel="noreferrer">личного кабинета</a>.</p>
      <form onSubmit={submit} className="login-form">
        <label htmlFor="idInstance">ID инстанса</label><input id="idInstance" name="idInstance" placeholder="3100…" autoComplete="off" inputMode="numeric" pattern="[0-9]+" required disabled={loading} spellCheck={false} />
        <label htmlFor="apiTokenInstance">API-токен</label><div className="password-field"><input id="apiTokenInstance" name="apiTokenInstance" placeholder="apiTokenInstance" type={showToken ? 'text' : 'password'} autoComplete="off" required disabled={loading} spellCheck={false} /><button className="icon-button" type="button" onClick={() => setShowToken(!showToken)} aria-label={showToken ? 'Скрыть API-токен' : 'Показать API-токен'} aria-pressed={showToken}><Icon name={showToken ? 'eyeOff' : 'eye'} /></button></div>
        <label htmlFor="apiUrl">Адрес API <span className="label-detail">apiUrl</span></label><input id="apiUrl" name="apiUrl" type="url" defaultValue="https://3100.api.green-api.com" required disabled={loading} spellCheck={false} autoComplete="off" aria-describedby="api-help" /><p className="field-help" id="api-help">Скопируйте адрес своего инстанса из кабинета.</p>
        {error && <div className="form-error" role="alert" ref={errorRef} tabIndex={-1}><Icon name="alert" />{error}</div>}
        <button type="submit" className="button button-primary" disabled={loading}>{loading ? <><span className="spinner" />Подключаемся…</> : <>Подключиться<Icon name="arrow" /></>}</button>
      </form>
      <p className="security-note"><Icon name="lock" />Токен хранится только в памяти этой вкладки.</p>
      <div className="demo-divider"><span>Сначала посмотреть?</span></div><button className="button button-secondary" type="button" onClick={onDemo} disabled={loading}>Открыть демо</button><p className="demo-note">Тестовая переписка без подключения к MAX</p>
    </section>
  </div><footer className="page-footer">Учебный клиент MAX · Неофициальное приложение</footer></main>
}

export default function App() {
  const chat = useChat()
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [phone, setPhone] = useState('')
  const [addingBusy, setAddingBusy] = useState(false)
  const [addError, setAddError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const active = chat.chats.find(item => item.id === chat.activeId)
  const draft = active ? drafts[active.id] || '' : ''
  const visible = chat.chats.filter(item => `${item.name} ${item.phone || ''} ${item.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'instant', block: 'end' }) }, [chat.activeId, active?.messages.length])
  useEffect(() => { if (adding) phoneRef.current?.focus() }, [adding])
  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`
  }, [draft, chat.activeId])
  useEffect(() => { if (!chat.session) { setDrafts({}); setSearch(''); setAdding(false); setPhone(''); setAddError('') } }, [chat.session])
  function closeAdd() { setAdding(false); setAddError(''); addButtonRef.current?.focus() }
  async function create(event: FormEvent) {
    event.preventDefault(); if (addingBusy) return
    setAddingBusy(true); setAddError('')
    try { await chat.createChat(phone); setPhone(''); closeAdd() }
    catch (reason) { setAddError(reason instanceof Error ? reason.message : 'Не удалось открыть чат. Попробуйте снова.'); phoneRef.current?.focus() }
    finally { setAddingBusy(false) }
  }
  async function send() {
    if (!active || !draft.trim() || chat.sending || submitting || draft.length > 4000) return
    const id = active.id; const text = draft
    setSubmitting(true)
    try { await chat.send(text); setDrafts(current => current[id] === text ? { ...current, [id]: '' } : current) }
    catch { /* The hook presents the API error. Keep the draft. */ }
    finally { setSubmitting(false); textareaRef.current?.focus() }
  }
  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); void send() }
  }
  if (!chat.session) return <Login onLogin={chat.login} onDemo={chat.startDemo} />
  const isDemo = chat.session.demo
  const statusText: Record<string, string> = { connected: 'Подключено', online: 'Подключено', connecting: 'Подключаемся…', reconnecting: 'Восстанавливаем связь…', disconnected: 'Нет подключения', offline: 'Нет сети', error: 'Ошибка подключения', demo: 'Демонстрационный режим' }
  return <main className={`messenger-page ${active ? 'has-active-chat' : ''}`}><div className="messenger-shell">
    <aside className="sidebar" aria-label="Список чатов"><header className="sidebar-header"><Brand compact /><button className="icon-button" onClick={chat.logout} aria-label="Выйти из чата" title="Выйти"><Icon name="exit" /></button></header>
      <div className={`connection-label ${isDemo ? 'demo-connection' : ''}`} role="status"><span className="live-dot" /><span>{isDemo ? 'Демо · сообщения не отправляются в MAX' : (statusText[chat.connection] || chat.connection)}</span></div>
      {!isDemo && chat.connection !== 'Подключено' && <button className="text-button reconnect-button" onClick={chat.reconnect}>Переподключиться</button>}
      <div className="list-heading"><h1>Сообщения <span>{chat.chats.length}</span></h1><button className={`icon-button new-chat-button ${adding ? 'selected' : ''}`} ref={addButtonRef} onClick={() => adding ? closeAdd() : setAdding(true)} aria-label={adding ? 'Закрыть создание чата' : 'Новый чат'} aria-expanded={adding} title="Новый чат"><Icon name={adding ? 'close' : 'plus'} /></button></div>
      {adding && <form className="new-chat-form" onSubmit={create} onKeyDown={event => { if (event.key === 'Escape') closeAdd() }}><label htmlFor="phone">Номер собеседника</label><input ref={phoneRef} id="phone" name="phone" type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+7 999 123-45-67" autoComplete="tel" required disabled={addingBusy} aria-invalid={!!addError} aria-describedby="phone-help" /><p id="phone-help" className="field-help">Россия +7 или Беларусь +375</p>{addError && <p className="form-error" role="alert">{addError}</p>}<button className="button button-primary" disabled={addingBusy} type="submit">{addingBusy ? 'Проверяем номер…' : 'Открыть чат'}<Icon name="arrow" /></button></form>}
      <div className="search-field"><Icon name="search" /><input aria-label="Поиск чатов" placeholder="Найти диалог" value={search} onChange={event => setSearch(event.target.value)} />{search && <button className="icon-button" aria-label="Очистить поиск" onClick={() => setSearch('')}><Icon name="close" /></button>}</div>
      <nav className="chat-list" aria-label="Диалоги">{visible.map(item => { const last = item.messages.at(-1); return <button key={item.id} className={`chat-item ${active?.id === item.id ? 'active' : ''}`} onClick={() => chat.selectChat(item.id)} aria-current={active?.id === item.id ? 'true' : undefined}><Avatar name={item.name} id={item.id} /><span className="chat-item-copy"><span className="chat-item-top"><strong>{item.name}</strong>{last && <time dateTime={new Date(last.timestamp).toISOString()}>{clock.format(last.timestamp)}</time>}</span><span className="chat-item-bottom"><span>{last ? `${last.direction === 'out' ? 'Вы: ' : ''}${last.text}` : 'Начните разговор'}</span>{item.unread > 0 && <b className="unread" aria-label={`${item.unread} непрочитанных`}>{item.unread > 99 ? '99+' : item.unread}</b>}</span></span></button> })}
        {visible.length === 0 && <div className="list-empty"><Icon name={search ? 'search' : 'chat'} /><p>{search ? 'Диалог не найден' : 'Здесь будут ваши диалоги'}</p><span>{search ? 'Попробуйте другое имя или номер.' : 'Нажмите +, чтобы написать первым.'}</span></div>}
      </nav><footer className="sidebar-footer"><span>{isDemo ? 'Демонстрационный аккаунт' : `Инстанс ${chat.session.idInstance}`}</span><a href={SETUP_URL} target="_blank" rel="noreferrer" aria-label="Инструкция по настройке"><Icon name="help" /></a></footer>
    </aside>
    <section className="conversation" aria-label={active ? `Переписка: ${active.name}` : 'Переписка'}>
      {active ? <><header className="conversation-header"><button className="icon-button mobile-back" onClick={() => chat.selectChat(null)} aria-label="Назад к списку чатов"><Icon name="back" /></button><Avatar name={active.name} id={active.id} /><div className="conversation-person"><h2>{active.name}</h2><p>{active.phone ? `+${active.phone.replace(/^\+/, '')}` : 'Личный чат'}<span className="dot-separator">·</span>{isDemo ? 'Демо' : 'MAX'}</p></div><span className="conversation-type">Текстовые сообщения</span></header>
        {isDemo && <div className="demo-banner">Демо-режим. Переписка остаётся в этой вкладке.</div>}
        {!isDemo && chat.connection !== 'Подключено' && <div className="error-banner" role="status"><Icon name="alert"/><span>{chat.connection}</span><button className="text-button" onClick={chat.reconnect}>Переподключиться</button></div>}
        {chat.error && <div className="error-banner" role="alert"><Icon name="alert" /><span>{chat.error}</span><button className="text-button" onClick={chat.clearError}>Понятно</button></div>}
        <div className="messages" role="log" aria-label="Сообщения" aria-live="polite" aria-relevant="additions text">
          {active.messages.length === 0 && <div className="empty-conversation"><span className="empty-icon"><Icon name="chat" /></span><h3>Начните с «Привет»</h3><p>Ваше первое сообщение появится здесь.</p></div>}
          {active.messages.map((message, index) => { const previous = active.messages[index - 1]; const firstOfDay = !previous || new Date(previous.timestamp).toDateString() !== new Date(message.timestamp).toDateString(); return <div key={message.id} className="message-group">{firstOfDay && <div className="date-divider"><span>{calendar.format(message.timestamp)}</span></div>}<article className={`message-row message-${message.direction}`} aria-label={message.direction === 'out' ? 'Вы' : active.name}><div className="message-bubble"><p>{message.text}</p><div className="message-meta"><time dateTime={new Date(message.timestamp).toISOString()}>{clock.format(message.timestamp)}</time>{message.direction === 'out' && <Status status={message.status} />}</div></div></article></div> })}<div ref={messagesEnd} />
        </div><form className="composer-area" onSubmit={event => { event.preventDefault(); void send() }}><div className="composer"><textarea ref={textareaRef} aria-label="Сообщение" placeholder="Написать сообщение…" value={draft} rows={1} maxLength={4000} onChange={event => active && setDrafts(current => ({ ...current, [active.id]: event.target.value }))} onKeyDown={onComposerKeyDown} /><button type="submit" className="send-button" disabled={!draft.trim() || chat.sending || submitting} aria-label={chat.sending || submitting ? 'Отправляется' : 'Отправить сообщение'}>{chat.sending || submitting ? <span className="spinner" /> : <Icon name="send" />}</button></div><div className="composer-hint"><span>Enter — отправить · Shift + Enter — новая строка</span><span className={draft.length >= 3900 ? 'near-limit' : ''}>{draft.length} / 4000</span></div></form></> : <div className="welcome-chat"><div className="welcome-symbol"><Icon name="chat" /><span /></div><span className="eyebrow">MAX / CHAT</span><h2>Хороший разговор<br />начинается с сообщения</h2><p>Выберите диалог слева или начните новый<br className="desktop-break" /> по номеру телефона.</p><button className="button button-primary" onClick={() => setAdding(true)}><Icon name="plus" />Новый чат</button>{isDemo && <span className="welcome-demo">Вы в демо-режиме. Реальные сообщения не отправляются.</span>}{chat.error && <div className="form-error" role="alert">{chat.error}<button className="text-button" onClick={chat.clearError}>Понятно</button></div>}</div>}
    </section>
  </div></main>
}
