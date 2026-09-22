# Improved Jeopardy

A configurable Jeopardy-style classroom game backed by a Node/Express API.

## Run locally

Install dependencies once:

```bash
npm install
```

Start the API in one terminal:

```bash
npm run server
```

Start the Vite frontend in another terminal:

```bash
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`). Requests to `/api` are proxied to the Express server on port 3001.

## API

The app uses the `default` game record. The backend also supports any game ID.

- `GET /api/health` — server health check
- `GET /api/games/:gameId` — retrieve a game and its progress; creates an empty record if it does not exist
- `PUT /api/games/:gameId` — save game configuration with `{ "game": ... }`
- `PUT /api/games/:gameId/progress` — save `{ "scores": ..., "usedClues": [...] }`
- `POST /api/games/:gameId/reset` — reset scores and used clues

Game data is persisted to `data/games.json`, which is deliberately excluded from Git so local games are not committed.

## Production

```bash
npm run build
npm start
```

The Express server serves the compiled frontend from `dist` when it is present.
