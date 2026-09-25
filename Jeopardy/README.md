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

## Microsoft / Outlook login setup

This project uses Microsoft Entra ID (Azure AD) for sign-in. The app is already wired to use the `/api/auth/login` OAuth flow, so your part is to create the Azure app registration and fill in the environment values.

### What you need to do in Azure

1. Open the Azure portal and sign in with your school Microsoft account.
2. Go to Microsoft Entra ID > App registrations > New registration.
3. Set:
   - Name: `Improved Jeopardy`
   - Supported account types: `Accounts in this organizational directory only` if you want only school accounts to sign in.
4. After registration, copy these values:
   - Directory (tenant) ID
   - Application (client) ID
5. Go to Certificates & secrets > New client secret.
   - Save the value immediately; Azure will only show it once.
6. Go to Authentication > Add a platform > Web.
   - Redirect URI: `http://localhost:3001/api/auth/callback`
   - For production, also add `https://your-domain.com/api/auth/callback`
7. Save the app registration.

### Fill in your local environment

Create a root `.env` file (or update the one already in the project) with values like this:

```env
MS_ENTRA_TENANT_ID=<your-tenant-id>
MS_ENTRA_CLIENT_ID=<your-app-client-id>
MS_ENTRA_CLIENT_SECRET=<your-client-secret>
MS_ENTRA_REDIRECT_URI=http://localhost:3001/api/auth/callback
APP_URL=http://localhost:3001
SESSION_SECRET=replace-with-a-long-random-string
```

Use a real random string for `SESSION_SECRET` in production.

### Start the app

```bash
npm install
npm run server
npm run dev
```

Then open the Vite app and click "Continue with Outlook". If the tenant, client ID, secret, and redirect URI match your Azure app registration, the sign-in flow will complete successfully.

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
