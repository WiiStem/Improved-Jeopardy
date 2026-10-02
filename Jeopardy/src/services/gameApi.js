const request = async (path, options) => {
  const response = await fetch(`/api${path}`, options)
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Unable to reach the game server.')
  return response.json()
}

export const listGames = () => request('/games')
export const createGame = () => request('/games', { method: 'POST' })
export const getGame = (gameId = 'default') => request(`/games/${encodeURIComponent(gameId)}`)
export const getGameByCode = (code) => request(`/public/games/${encodeURIComponent(code)}`)
export const saveGame = (gameId, game) => request(`/games/${encodeURIComponent(gameId)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game }) })
export const saveProgress = (gameId, scores, usedClues) => request(`/games/${encodeURIComponent(gameId)}/progress`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scores, usedClues }) })
export const resetProgress = (gameId) => request(`/games/${encodeURIComponent(gameId)}/reset`, { method: 'POST' })
