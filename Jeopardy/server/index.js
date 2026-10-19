import express from 'express'
import session from 'express-session'
import { ConfidentialClientApplication } from '@azure/msal-node'
import dotenv from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'

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
const initialProgress = (game) => ({ scores: Object.fromEntries(game.teams.map((team) => [team.id, 0])), usedClues: [], finalWagers: {}, finalOutcomes: {}, finalRevealed: false, finalResolved: false })

const saveSession = (request) => new Promise((resolve, reject) => request.session.save((error) => error ? reject(error) : resolve()))

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

function generateGameCode(store) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const makeCode = () => Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')

  let code = ''
  do {
    code = makeCode()
  } while (Object.values(store.games).some((record) => record.code && record.code.toUpperCase() === code))

  return code
}

async function getOrCreateGame(gameId) {
  const store = await readStore()
  if (!store.games[gameId]) {
    const game = createGame()
    store.games[gameId] = { id: gameId, game, progress: initialProgress(game), code: generateGameCode(store), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    await writeStore(store)
  }

  const record = store.games[gameId]
  if (!record.code) {
    record.code = generateGameCode(store)
    record.updatedAt = new Date().toISOString()
    await writeStore(store)
  }

  return { store, record }
}

function newGameRecord(store) {
  const gameId = randomUUID()
  const game = { ...createGame(), title: 'Untitled Game' }
  const now = new Date().toISOString()
  return { id: gameId, game, progress: initialProgress(game), code: generateGameCode(store), createdAt: now, updatedAt: now }
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index += 1 } else if (character === '"') quoted = false
      else value += character
    } else if (character === '"') quoted = true
    else if (character === ',') { row.push(value); value = '' }
    else if (character === '\n') { row.push(value); rows.push(row); row = []; value = '' }
    else if (character !== '\r') value += character
  }

  if (value || row.length) { row.push(value); rows.push(row) }
  return rows.filter((current) => current.some((cell) => cell.trim()))
}

function columnName(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function badSheetRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

function googleSheetDetails(value) {
  const input = String(value || '').trim()
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  const sheetId = match?.[1] || (/^[a-zA-Z0-9_-]{20,}$/.test(input) ? input : '')
  if (!sheetId) throw badSheetRequest('Paste a valid Google Sheets link or spreadsheet ID.')

  let gid = '0'
  try {
    const parsed = new URL(input)
    gid = parsed.searchParams.get('gid') || parsed.hash.match(/gid=(\d+)/)?.[1] || gid
  } catch { /* A spreadsheet ID does not need URL parsing. */ }
  return { sheetId, gid }
}

function cellRangeBounds(value) {
  if (!String(value || '').trim()) return null
  const match = String(value).trim().match(/^\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)$/i)
  if (!match) throw badSheetRequest('Enter a rectangular cell range such as A1:J7.')
  const columnNumber = (letters) => [...letters.toUpperCase()].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0)
  const bounds = { startColumn: columnNumber(match[1]) - 1, startRow: Number(match[2]) - 1, endColumn: columnNumber(match[3]) - 1, endRow: Number(match[4]) - 1 }
  if (bounds.startRow < 0 || bounds.startColumn < 0 || bounds.startRow > bounds.endRow || bounds.startColumn > bounds.endColumn) {
    throw badSheetRequest('The cell range must start at the top-left and end at the bottom-right, for example A1:J7.')
  }
  return bounds
}

async function googleSheetTitle(sheetId, fallback) {
  try {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit`)
    if (!response.ok) return fallback
    const html = await response.text()
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s*-\s*Google Sheets\s*$/i, '').trim()
    return title || fallback
  } catch { return fallback }
}

function gameFromSheet(csv, title, range) {
  let sheetRows = parseCsv(csv)
  const bounds = cellRangeBounds(range)
  if (bounds) {
    sheetRows = sheetRows.slice(bounds.startRow, bounds.endRow + 1).map((row) => {
      const selected = row.slice(bounds.startColumn, bounds.endColumn + 1)
      while (selected.length < bounds.endColumn - bounds.startColumn + 1) selected.push('')
      return selected
    })
  }
  const [headers, ...rows] = sheetRows
  if (!headers?.length) throw badSheetRequest('The sheet is empty.')

  // Wide board layout: Category in column A, then alternating Question/Answer
  // pairs. Each subsequent row is a category and can contain several clues.
  const normalizedHeaders = headers.map(columnName)
  if (normalizedHeaders[0] === 'category' && normalizedHeaders[1] === 'question' && normalizedHeaders[2] === 'answer'
    && normalizedHeaders[3] === 'question' && normalizedHeaders[4] === 'answer') {
    const categories = new Map()
    let finalJeopardy = null
    rows.forEach((row) => {
      const label = row[0]?.trim()
      if (!label) return

      // The final row stores its category in column D and its clue in B/C.
      if (label.toLowerCase() === 'final') {
        const question = row[1]?.trim()
        const answer = row[2]?.trim()
        if (question || answer) {
          if (!question || !answer) throw badSheetRequest('The final round needs both a question and an answer.')
          finalJeopardy = { category: row[3]?.trim() || 'Final', question, answer }
        }
        return
      }

      if (!categories.has(label)) categories.set(label, { id: randomUUID(), title: label, clues: [] })
      const category = categories.get(label)
      for (let questionColumn = 1; questionColumn < headers.length; questionColumn += 2) {
        const question = row[questionColumn]?.trim()
        const answer = row[questionColumn + 1]?.trim()
        if (!question && !answer) continue
        if (!question || !answer) throw badSheetRequest(`Every question in “${label}” needs both a question and an answer.`)
        category.clues.push({ id: randomUUID(), value: (category.clues.length + 1) * 100, question, answer })
      }
    })
    if (!categories.size) throw badSheetRequest('No questions were found in the sheet.')
    return { title, teams: [], categories: [...categories.values()], ...(finalJeopardy ? { finalJeopardy } : {}) }
  }

  const columns = Object.fromEntries(headers.map((header, index) => [columnName(header), index]))
  const categoryColumn = columns.category ?? columns.cat
  const questionColumn = columns.question ?? columns.clue
  const answerColumn = columns.answer ?? columns.response
  const valueColumn = columns.value ?? columns.points ?? columns.pointvalue
  if ([categoryColumn, questionColumn, answerColumn].some((column) => column === undefined)) {
    throw badSheetRequest('The first row must include Category, Question, and Answer columns. Value is optional.')
  }

  const categories = new Map()
  rows.forEach((row) => {
    const categoryTitle = row[categoryColumn]?.trim()
    const question = row[questionColumn]?.trim()
    const answer = row[answerColumn]?.trim()
    if (!categoryTitle && !question && !answer) return
    if (!categoryTitle || !question || !answer) throw badSheetRequest('Every imported row needs a category, question, and answer.')

    if (!categories.has(categoryTitle)) categories.set(categoryTitle, { id: randomUUID(), title: categoryTitle, clues: [] })
    const category = categories.get(categoryTitle)
    const suppliedValue = Number(row[valueColumn])
    category.clues.push({
      id: randomUUID(),
      value: Number.isFinite(suppliedValue) && suppliedValue > 0 ? suppliedValue : (category.clues.length + 1) * 100,
      question,
      answer,
    })
  })

  if (!categories.size) throw badSheetRequest('No questions were found in the sheet.')
  return { title, teams: [], categories: [...categories.values()] }
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

app.get('/api/public/games/:code', async (request, response, next) => {
  try {
    const code = String(request.params.code || '').trim().toUpperCase()
    const store = await readStore()
    if (!code) return response.status(400).json({ error: 'A game code is required.' })

    const record = Object.values(store.games).find((item) => String(item.code || '').toUpperCase() === code)
    if (!record) return response.status(404).json({ error: 'No game was found for that code.' })

    response.json(record)
  } catch (error) { next(error) }
})

app.post('/api/public/games', async (_request, response, next) => {
  try {
    const store = await readStore()
    const record = newGameRecord(store)
    store.games[record.id] = record
    await writeStore(store)
    response.status(201).json(record)
  } catch (error) { next(error) }
})

app.post('/api/games/:gameId/import/google-sheets', async (request, response, next) => {
  try {
    const { sheetUrl, cellRange } = request.body
    const { sheetId, gid } = googleSheetDetails(sheetUrl)
    const exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${encodeURIComponent(gid)}`
    const sheetResponse = await fetch(exportUrl)
    if (!sheetResponse.ok) throw new Error('Google could not open that sheet. Set sharing to “Anyone with the link” and try again.')

    const { store, record } = await getOrCreateGame(request.params.gameId)
    const sheetTitle = await googleSheetTitle(sheetId, record.game.title)
    record.game = gameFromSheet(await sheetResponse.text(), sheetTitle, cellRange)
    record.progress = initialProgress(record.game)
    record.updatedAt = new Date().toISOString()
    await writeStore(store)
    response.json(record)
  } catch (error) {
    if (error.status === 400) return response.status(400).json({ error: error.message })
    if (error instanceof TypeError) return response.status(400).json({ error: 'Unable to retrieve that Google Sheet.' })
    next(error)
  }
})

app.get('/api/games', async (_request, response, next) => {
  try {
    const store = await readStore()
    const games = Object.values(store.games)
      .map(({ id, game, createdAt, updatedAt }) => ({ id, title: game.title, createdAt, updatedAt }))
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    response.json(games)
  } catch (error) { next(error) }
})

app.post('/api/games', async (_request, response, next) => {
  try {
    const store = await readStore()
    const record = newGameRecord(store)
    store.games[record.id] = record
    await writeStore(store)
    response.status(201).json(record)
  } catch (error) { next(error) }
})

app.get('/api/games/:gameId', async (request, response, next) => {
  try { const { record } = await getOrCreateGame(request.params.gameId); response.json(record) } catch (error) { next(error) }
})

app.delete('/api/games/:gameId', async (request, response, next) => {
  try {
    const store = await readStore()
    if (!store.games[request.params.gameId]) return response.status(404).json({ error: 'That game could not be found.' })
    delete store.games[request.params.gameId]
    await writeStore(store)
    response.json({ deleted: true })
  } catch (error) { next(error) }
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
    const { scores, usedClues, finalWagers = {}, finalOutcomes = {}, finalRevealed = false, finalResolved = false } = request.body
    if (!scores || !Array.isArray(usedClues)) return response.status(400).json({ error: 'Scores and used clues are required.' })
    const { store, record } = await getOrCreateGame(request.params.gameId)
    record.progress = { scores, usedClues, finalWagers, finalOutcomes, finalRevealed, finalResolved }
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
  if (!authConfigured) console.warn('Microsoft authentication is disabled: add the MS_ENTRA_* variables described in .env.')
  if (!process.env.SESSION_SECRET) console.warn('Using an ephemeral session secret. Set SESSION_SECRET before deploying.')
})
