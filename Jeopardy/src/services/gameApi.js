const GAME_ID = 'default'
const request = async (path, options) => {
  const response = await fetch(`/api${path}`, options)
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Unable to reach the game server.')
  return response.json()
}

export const getGame = () => request(`/games/${GAME_ID}`)
export const saveGame = (game) => request(`/games/${GAME_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game }) })
export const saveProgress = (scores, usedClues) => request(`/games/${GAME_ID}/progress`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scores, usedClues }) })
export const resetProgress = () => request(`/games/${GAME_ID}/reset`, { method: 'POST' })
