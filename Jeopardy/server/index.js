import express from 'express'
import session from 'express-session'
import { ConfidentialClientApplication } from '@azure/msal-node'
import dotenv from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, timingSafeEqual } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const dataDir = path.join(rootDir, 'data')
const dataFile = path.join(dataDir, 'games.json')
const envPath = path.resolve(rootDir, '..', '.env')
dotenv.config({ path: envPath })

// The original credentials file used `label: value` lines. Keep accepting it
// while also supporting conventional KEY=value variables documented in .env.example.
function legacyCredentials() {
  try {
    return Object.fromEntries(readFileSync(envPath, 'utf8').split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*([^:]+):\s*(.+?)\s*$/)
      return match ? [[match[1].trim().toLowerCase(), match[2]]] : []
    }))
  } catch { return {} }
}

const legacy = legacyCredentials()
const tenantId = process.env.MS_ENTRA_TENANT_ID || legacy.tennant || legacy.tenant
const clientId = process.env.MS_ENTRA_CLIENT_ID || legacy['app(client)']
const clientSecret = process.env.MS_ENTRA_CLIENT_SECRET || legacy.secret
const port = Number(process.env.PORT) || 3001
const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '')
const redirectUri = process.env.MS_ENTRA_REDIRECT_URI || `${appUrl}/api/auth/callback`
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
const authConfigured = Boolean(tenantId && clientId && clientSecret)
const msalClient = authConfigured ? new ConfidentialClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    clientSecret,
  },
}) : null
const app = express()

app.use(express.json({ limit: '1mb' }))
app.set('trust proxy', 1)
app.use(session({
  name: 'jeopardy.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
}))

const createGame = () => ({ title: 'Classroom Jeopardy', teams: [], categories: [] })
const initialProgress = (game) => ({ scores: Object.fromEntries(game.teams.map((team) => [team.id, 0])), usedClues: [] })

const saveSession = (request) => new Promise((resolve, reject) => request.session.save((error) => error ? reject(error) : resolve()))

function requireAuthentication(request, response, next) {
  if (request.session.user) return next()
  return response.status(401).json({ error: 'Sign in with Microsoft to access this game.' })
}

async function readStore() {
  await mkdir(dataDir, { recursive: true })
  try { return JSON.parse(await readFile(dataFile, 'utf8')) } catch { return { games: {} } }
}

async function writeStore(store) {
  await mkdir(dataDir, { recursive: true })
  await writeFile(dataFile, JSON.stringify(store, null, 2), 'utf8')
}

function validGame(game) {
  return game && typeof game.title === 'string' && Array.isArray(game.teams) && Array.isArray(game.categories)
}

async function getOrCreateGame(gameId) {
  const store = await readStore()
  if (!store.games[gameId]) {
    const game = createGame()
    store.games[gameId] = { id: gameId, game, progress: initialProgress(game), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    await writeStore(store)
  }
  return { store, record: store.games[gameId] }
}

app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))

app.get('/api/auth/me', (request, response) => {
  if (!authConfigured) return response.status(503).json({ error: 'Microsoft authentication has not been configured on the server.' })
  response.json({ authenticated: Boolean(request.session.user), user: request.session.user || null })
})

app.get('/api/auth/login', async (request, response, next) => {
  if (!msalClient) return response.status(503).send('Microsoft authentication has not been configured on the server.')
  try {
    const state = randomBytes(24).toString('hex')
    request.session.oauthState = state
    await saveSession(request)
    const authorizationUrl = await msalClient.getAuthCodeUrl({
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
      state,
    })
    response.redirect(authorizationUrl)
  } catch (error) { next(error) }
})

app.get('/api/auth/callback', async (request, response, next) => {
  if (!msalClient) return response.status(503).send('Microsoft authentication has not been configured on the server.')
  try {
    const returnedState = typeof request.query.state === 'string' ? request.query.state : ''
    const expectedState = request.session.oauthState || ''
    const stateIsValid = returnedState && expectedState && returnedState.length === expectedState.length && timingSafeEqual(Buffer.from(returnedState), Buffer.from(expectedState))
    if (!stateIsValid || typeof request.query.code !== 'string') return response.status(400).send('The Microsoft sign-in response was invalid or expired. Please try again.')

    const tokenResponse = await msalClient.acquireTokenByCode({
      code: request.query.code,
      scopes: ['openid', 'profile', 'email'],
      redirectUri,
    })
    request.session.regenerate((sessionError) => {
      if (sessionError) return next(sessionError)
      request.session.user = {
        name: tokenResponse.account?.name || tokenResponse.account?.username || 'Microsoft user',
        username: tokenResponse.account?.username || null,
      }
      saveSession(request).then(() => response.redirect(appUrl)).catch(next)
    })
  } catch (error) { next(error) }
})

app.post('/api/auth/logout', (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error)
    response.clearCookie('jeopardy.sid')
    response.status(204).end()
  })
})

app.use('/api/games', requireAuthentication)

app.get('/api/games/:gameId', async (request, response, next) => {
  try { const { record } = await getOrCreateGame(request.params.gameId); response.json(record) } catch (error) { next(error) }
})

app.put('/api/games/:gameId', async (request, response, next) => {
  try {
    if (!validGame(request.body.game)) return response.status(400).json({ error: 'A game title, teams array, and categories array are required.' })
    const { store, record } = await getOrCreateGame(request.params.gameId)
    record.game = request.body.game
    record.updatedAt = new Date().toISOString()
    await writeStore(store)
    response.json(record)
  } catch (error) { next(error) }
})

app.put('/api/games/:gameId/progress', async (request, response, next) => {
  try {
    const { scores, usedClues } = request.body
    if (!scores || !Array.isArray(usedClues)) return response.status(400).json({ error: 'Scores and used clues are required.' })
    const { store, record } = await getOrCreateGame(request.params.gameId)
    record.progress = { scores, usedClues }
    record.updatedAt = new Date().toISOString()
    await writeStore(store)
    response.json(record.progress)
  } catch (error) { next(error) }
})

app.post('/api/games/:gameId/reset', async (request, response, next) => {
  try {
    const { store, record } = await getOrCreateGame(request.params.gameId)
    record.progress = initialProgress(record.game)
    record.updatedAt = new Date().toISOString()
    await writeStore(store)
    response.json(record.progress)
  } catch (error) { next(error) }
})

if (existsSync(path.join(rootDir, 'dist'))) {
  app.use(express.static(path.join(rootDir, 'dist')))
  app.get('/{*splat}', (_request, response) => response.sendFile(path.join(rootDir, 'dist', 'index.html')))
}

app.use((error, _request, response, next) => {
  void next
  console.error(error)
  response.status(500).json({ error: 'The server could not complete that request.' })
})

app.listen(port, () => {
  console.log(`Jeopardy API listening on http://localhost:${port}`)
  if (!authConfigured) console.warn('Microsoft authentication is disabled: add the MS_ENTRA_* variables described in .env.example.')
  if (!process.env.SESSION_SECRET) console.warn('Using an ephemeral session secret. Set SESSION_SECRET before deploying.')
})
