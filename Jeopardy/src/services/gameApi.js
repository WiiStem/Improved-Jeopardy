const request = async (path, options) => {
  const response = await fetch(`/api${path}`, options)
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Unable to reach the game server.')
  return response.json()
}

export const listGames = () => request('/games')
// Game creation uses the public endpoint so a host can start a board without
// a Microsoft session.
export const createGame = () => request('/public/games', { method: 'POST' })
export const getGame = (gameId = 'default') => request(`/games/${encodeURIComponent(gameId)}`)
export const getGameByCode = (code) => request(`/public/games/${encodeURIComponent(code)}`)
export const deleteGame = (gameId) => request(`/games/${encodeURIComponent(gameId)}`, { method: 'DELETE' })
export const importGoogleSheet = (gameId, sheetUrl, cellRange) => request(`/games/${encodeURIComponent(gameId)}/import/google-sheets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheetUrl, cellRange }) })
export const saveGame = (gameId, game) => request(`/games/${encodeURIComponent(gameId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game }) })
export const saveProgress = (gameId, scores, usedClues, finalWagers, finalOutcomes, finalRevealed, finalResolved) => request(`/games/${encodeURIComponent(gameId)}/progress`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scores, usedClues, finalWagers, finalOutcomes, finalRevealed, finalResolved }) })
export const resetProgress = (gameId) => request(`/games/${encodeURIComponent(gameId)}/reset`, { method: 'POST' })
