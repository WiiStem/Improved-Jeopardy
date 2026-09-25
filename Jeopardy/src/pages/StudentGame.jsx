export default function StudentGame({ game, onBack }) {
  return <main className="game-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">LIVE GAME</p>
        <h1>{game?.title || 'Classroom Jeopardy'}</h1>
      </div>
      <button className="secondary-button" onClick={onBack}>Back to join</button>
    </header>

    <section className="scoreboard" aria-label="Scoreboard">
      {(game?.game?.teams || []).map((team, index) => (
        <article key={team.id} className={`score-card ${index % 2 ? 'pink' : 'gold'}`}>
          <span>{team.name || `Team ${index + 1}`}</span>
          <strong>{String(game.progress?.scores?.[team.id] || 0)}</strong>
        </article>
      ))}
    </section>

    {game?.game?.categories?.length ? <section className="board" aria-label="Jeopardy game board" style={{ '--columns': game.game.categories.length }}>
      {game.game.categories.map((cat) => (
        <div className="category" key={cat.id}>
          <div className="category-title">{cat.title}</div>
          {cat.clues.map((item) => (
            <button key={item.id} className="clue" disabled>{game.progress?.usedClues?.includes(item.id) ? '' : `$${Number(item.value).toLocaleString()}`}</button>
          ))}
        </div>
      ))}
    </section> : <p className="hint">This game is loading…</p>}
  </main>
}
