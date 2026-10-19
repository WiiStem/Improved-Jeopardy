import TeamScore from './TeamScore'
import QuestionCard from './QuestionCard'
import LogoutConfirmation from './Modal'
import FinalJeopardy from './FinalJeopardy'

export default function GameBoard({ game, scores, used, selected, showAnswer, onOpenClue, onCloseClue, onRevealAnswer, onScore, onFinish, onEdit, onReset, onLogout, logoutOpen, onCancelLogout, onConfirmLogout, allCluesAnswered, finalJeopardyReady, finalResolved, finalOpen, onBeginFinal, finalWagers, onSetFinalWager, finalRevealed, onRevealFinal, finalOutcomes, onSetFinalOutcome, onResolveFinal, onCloseFinal }) {
  return <main className="game-shell">
    <header className="topbar"><div><p className="eyebrow">LIVE GAME</p><h1>{game.title}</h1></div><div className="header-actions"><button className="secondary-button" onClick={onEdit}>Game editor</button><button className="new-game" onClick={onReset}>↻ Reset scores</button><button className="logout-button" onClick={onLogout}>Log out</button></div></header>
    <section className="scoreboard" aria-label="Scoreboard">{game.teams.map((team, index) => <TeamScore key={team.id} label={team.name || `Team ${index + 1}`} score={scores[team.id] || 0} tone={index % 2 ? 'pink' : 'gold'} />)}</section>
    <section className="board" aria-label="Jeopardy game board" style={{ '--columns': game.categories.length }}>{game.categories.map((category) => <div className="category" key={category.id}><div className="category-title">{category.title}</div>{category.clues.map((item) => <button key={item.id} className={`clue ${used.includes(item.id) ? 'used' : ''}`} disabled={used.includes(item.id)} onClick={() => onOpenClue(item.id)}>{used.includes(item.id) ? '' : `$${Number(item.value).toLocaleString()}`}</button>)}</div>)}</section>
    <p className="hint">Select a question, reveal its answer, then award its configured value.</p>
    {allCluesAnswered && finalJeopardyReady && <section className="final-jeopardy-launch"><div><p className="eyebrow">FINAL JEOPARDY</p><h2>{finalResolved ? 'Final Jeopardy is complete' : 'The board is clear'}</h2></div>{!finalResolved && <button className="new-game" onClick={onBeginFinal}>Start Final Jeopardy</button>}</section>}
    <QuestionCard selected={selected} showAnswer={showAnswer} teams={game.teams} onClose={onCloseClue} onReveal={onRevealAnswer} onScore={onScore} onFinish={onFinish} />
    <FinalJeopardy open={finalOpen} finalJeopardy={game.finalJeopardy} teams={game.teams} scores={scores} wagers={finalWagers} onWagerChange={onSetFinalWager} revealed={finalRevealed} onReveal={onRevealFinal} outcomes={finalOutcomes} onOutcomeChange={onSetFinalOutcome} onResolve={onResolveFinal} onClose={onCloseFinal} />
    <LogoutConfirmation open={logoutOpen} onCancel={onCancelLogout} onConfirm={onConfirmLogout} />
  </main>
}
