import { useEffect, useState } from 'react'
import { getGameByCode } from '../services/gameApi'

export default function JoinGame({ onJoined }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const hash = window.location.hash || ''
    const queryString = hash.includes('?') ? hash.split('?')[1] : window.location.search.replace(/^\?/, '')
    const params = new URLSearchParams(queryString)
    const codeFromQuery = params.get('code')

    if (codeFromQuery) {
      setCode(codeFromQuery.toUpperCase())
    }
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmedCode = code.trim()

    if (!trimmedCode) {
      setError('Enter the game code to continue.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const record = await getGameByCode(trimmedCode)
      if (onJoined) onJoined(record)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoading(false)
    }
  }

  return <main className="login-shell">
    <section className="login-card" aria-labelledby="join-title">
      <p className="eyebrow">CLASSROOM JEOPARDY</p>
      <h1 id="join-title">Join a game</h1>
      <p>Enter the code from the host’s Microsoft sign-in session.</p>
      <form onSubmit={handleSubmit}>
        <label className="title-field" style={{ marginBottom: '16px' }}>
          Game code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABCD12"
            maxLength={12}
            autoComplete="off"
          />
        </label>
        {error && <p className="login-error">{error}</p>}
        <button className="microsoft-login" type="submit" disabled={isLoading} style={{ border: 'none', width: '100%' }}>
          {isLoading ? 'Checking code...' : 'Join game'}
        </button>
      </form>
    </section>
  </main>
}
