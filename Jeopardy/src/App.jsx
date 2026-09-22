import { useEffect, useMemo, useState } from 'react'
import { getGame, resetProgress, saveGame, saveProgress } from './services/gameApi'
import Login from './pages/Login'
import './index.css'

const id = () => crypto.randomUUID()
const clue = (value = 100) => ({ id: id(), value, question: '', answer: '' })
const category = () => ({ id: id(), title: '', clues: [clue()] })

function App() {
  const [auth, setAuth] = useState(null)
  const [authError, setAuthError] = useState('')
  const [game, setGame] = useState(null)
  const [editing, setEditing] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [used, setUsed] = useState([])
  const [scores, setScores] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/auth/me').then(async (response) => {
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Unable to check your sign-in status.')
      if (active) setAuth(body.authenticated)
    }).catch((requestError) => {
      if (active) { setAuth(false); setAuthError(requestError.message) }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    getGame().then((record) => {
      if (!active) return
      setGame(record.game)
      setScores(record.progress.scores)
      setUsed(record.progress.usedClues)
      setLoaded(true)
    }).catch((requestError) => active && setError(requestError.message))
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!loaded || !game) return undefined
    const timer = setTimeout(() => saveGame(game).catch((requestError) => setError(requestError.message)), 300)
    return () => clearTimeout(timer)
  }, [game, loaded])

  useEffect(() => {
    if (!loaded) return undefined
    const timer = setTimeout(() => saveProgress(scores, used).catch((requestError) => setError(requestError.message)), 300)
    return () => clearTimeout(timer)
  }, [scores, used, loaded])

  const selected = useMemo(() => (game?.categories ?? []).flatMap((cat) => cat.clues.map((item) => ({ cat, item }))).find(({ item }) => item.id === selectedId), [game, selectedId])

  if (auth === null) return <main className="status-shell"><p>Checking sign-in…</p></main>
  if (!auth) return <Login error={authError} />
  if (error && !loaded) return <main className="status-shell"><h1>Could not connect to the game server</h1><p>{error}</p><p>Start the backend with <code>npm run server</code>, then refresh this page.</p></main>
  if (!game) return <main className="status-shell"><p>Loading game…</p></main>

  const ready = game.teams.length > 0 && game.categories.length > 0 && game.categories.every((cat) => cat.title.trim() && cat.clues.length && cat.clues.every((item) => item.question.trim() && item.answer.trim() && Number(item.value) > 0))
  const update = (fn) => setGame((current) => fn(current))
  const modifyCategory = (categoryId, fn) => update((current) => ({ ...current, categories: current.categories.map((cat) => cat.id === categoryId ? fn(cat) : cat) }))
  const close = () => { setSelectedId(null); setShowAnswer(false) }
  const reset = async () => {
    close()
    try {
      const progress = await resetProgress()
      setScores(progress.scores)
      setUsed(progress.usedClues)
    } catch (requestError) { setError(requestError.message) }
  }
  const start = () => { if (ready) { reset(); setEditing(false) } }
  const score = (teamId) => { setScores((current) => ({ ...current, [teamId]: (current[teamId] || 0) + Number(selected.item.value) })); setUsed((current) => [...new Set([...current, selectedId])]); close() }
  const finish = () => { setUsed((current) => [...new Set([...current, selectedId])]); close() }

  if (editing) return <Builder game={game} ready={ready} start={start} update={update} modifyCategory={modifyCategory} />
  return <main className="game-shell">
    <header className="topbar"><div><p className="eyebrow">LIVE GAME</p><h1>{game.title}</h1></div><div className="header-actions"><button className="secondary-button" onClick={() => setEditing(true)}>Game editor</button><button className="new-game" onClick={reset}>↻ Reset scores</button></div></header>
    <section className="scoreboard" aria-label="Scoreboard">{game.teams.map((team, index) => <ScoreCard key={team.id} label={team.name || `Team ${index + 1}`} score={scores[team.id] || 0} tone={index % 2 ? 'pink' : 'gold'} />)}</section>
    <section className="board" aria-label="Jeopardy game board" style={{ '--columns': game.categories.length }}>{game.categories.map((cat) => <div className="category" key={cat.id}><div className="category-title">{cat.title}</div>{cat.clues.map((item) => <button key={item.id} className={`clue ${used.includes(item.id) ? 'used' : ''}`} disabled={used.includes(item.id)} onClick={() => { setSelectedId(item.id); setShowAnswer(false) }}>{used.includes(item.id) ? '' : `$${Number(item.value).toLocaleString()}`}</button>)}</div>)}</section>
    <p className="hint">Select a clue, reveal its answer, then award its configured value.</p>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="clue-modal" role="dialog" aria-modal="true" aria-label="Selected clue" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={close} aria-label="Close clue">×</button><p className="modal-category">{selected.cat.title} · ${Number(selected.item.value).toLocaleString()}</p><p className="clue-text">{showAnswer ? selected.item.answer : selected.item.question}</p>{showAnswer ? <div className="scoring"><p>Who got it right?</p><div>{game.teams.map((team) => <button className="team-score" key={team.id} onClick={() => score(team.id)}>+ {team.name || 'Unnamed team'}</button>)}</div><button className="no-one" onClick={finish}>No correct answer</button></div> : <button className="reveal" onClick={() => setShowAnswer(true)}>Reveal answer</button>}</section></div>}
  </main>
}

function Builder({ game, ready, start, update, modifyCategory }) {
  const addTeam = () => update((current) => ({ ...current, teams: [...current.teams, { id: id(), name: `Team ${current.teams.length + 1}` }] }))
  const updateTeam = (teamId, name) => update((current) => ({ ...current, teams: current.teams.map((team) => team.id === teamId ? { ...team, name } : team) }))
  const addCategory = () => update((current) => ({ ...current, categories: [...current.categories, category()] }))
  return <main className="builder-shell"><header className="topbar"><div><p className="eyebrow">GAME EDITOR</p><h1>Edit your board</h1></div><button className="new-game" disabled={!ready} onClick={start}>Start game</button></header><p className="builder-intro">Edit the title, teams, categories, clue values, questions, and answers. Changes save automatically to the game server.</p><label className="title-field">Game title<input value={game.title} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} /></label><section className="editor-section"><div className="section-heading"><h2>Teams</h2><button className="secondary-button" onClick={addTeam}>Add team</button></div><div className="team-editor">{game.teams.map((team, index) => <div className="team-row" key={team.id}><input aria-label={`Team ${index + 1}`} value={team.name} onChange={(event) => updateTeam(team.id, event.target.value)} /><button className="remove-button" onClick={() => update((current) => ({ ...current, teams: current.teams.filter((item) => item.id !== team.id) }))}>Remove</button></div>)}</div></section><section className="editor-section"><div className="section-heading"><h2>Categories and clues</h2><button className="secondary-button" onClick={addCategory}>Add category</button></div><div className="category-editor-list">{game.categories.map((cat, categoryIndex) => <CategoryEditor key={cat.id} cat={cat} index={categoryIndex} modify={modifyCategory} remove={() => update((current) => ({ ...current, categories: current.categories.filter((item) => item.id !== cat.id) }))} />)}</div></section>{!ready && <p className="validation-message">Each category needs a title and at least one clue with a value, question, and answer before the game can start.</p>}</main>
}

function CategoryEditor({ cat, index, modify, remove }) {
  const updateClue = (clueId, field, value) => modify(cat.id, (current) => ({ ...current, clues: current.clues.map((item) => item.id === clueId ? { ...item, [field]: value } : item) }))
  return <article className="category-editor"><div className="category-editor-title"><input aria-label={`Category ${index + 1} title`} value={cat.title} placeholder={`Category ${index + 1} title`} onChange={(event) => modify(cat.id, (current) => ({ ...current, title: event.target.value }))} /><button className="remove-button" onClick={remove}>Remove category</button></div><div className="clue-editor-list">{cat.clues.map((item, clueIndex) => <div className="clue-editor" key={item.id}><label>Value<input type="number" min="1" value={item.value} onChange={(event) => updateClue(item.id, 'value', event.target.value)} /></label><label>Clue<textarea value={item.question} onChange={(event) => updateClue(item.id, 'question', event.target.value)} placeholder="Question or clue" /></label><label>Answer<textarea value={item.answer} onChange={(event) => updateClue(item.id, 'answer', event.target.value)} placeholder="Correct response" /></label><button className="remove-button" aria-label={`Remove clue ${clueIndex + 1}`} onClick={() => modify(cat.id, (current) => ({ ...current, clues: current.clues.filter((clueItem) => clueItem.id !== item.id) }))}>Remove</button></div>)}</div><button className="add-clue" onClick={() => modify(cat.id, (current) => ({ ...current, clues: [...current.clues, clue((current.clues.length + 1) * 100)] }))}>+ Add clue</button></article>
}

function ScoreCard({ label, score, tone }) { return <article className={`score-card ${tone}`}><span>{label}</span><strong>${score.toLocaleString()}</strong></article> }
export default App
