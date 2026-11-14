# Trial 003 — Experimental multiplayer backend

Node.js 22+, TypeScript **with native type stripping**, and no runtime dependencies.

A single Node process owns ephemeral player rooms (maximum 8 players per room, 100 rooms, expired after 30 minutes of inactivity). The protocol uses HTTP POST for joining, moving and leaving, and Server-Sent Events (SSE) for server-to-client state snapshots. The server decides the authoritative grid coordinates, broadcasts changes to each room and rejects invalid moves or unknown credentials.

## Local check

`npm start` starts the backend at `http://localhost:3000` (`PORT` overrides). `GET /health` returns build and status. The repository's `scripts/multiplayer-smoke.mjs` starts a temporary backend and tests two independent clients, state synchronization, invalid moves and leave.

## Hosting (Railway)

Connect Railway to the **private** `godofthunder101/farm-test` repository and select the `backend` subdirectory as the service's **root directory**. Deploy on Node 22+, set the public service domain, and use the issued `https://...` origin in the multiplayer front end. The `backend/railway.json` service config specifies `npm start` and `/health`. If Railway cannot locate it because of the monorepo root, set the service's Config-as-code path to `/backend/railway.json`, or set the start command manually to `npm start` within `/backend`.

You can use any other Node host too. The backend binds to the host-supplied `PORT` and `0.0.0.0`.

## Protocol

- `POST /api/join?room=FARM` JSON `{ "name": "Player" }` returns `{id, token, room, state}`. Supplying `id` and `token` resumes an existing player.
- `GET /api/events?room=FARM` returns SSE messages `event: state` containing `{type, room, revision, players}`.
- `POST /api/move?room=FARM` JSON `{id, token, x, y}` (12×8 grid) changes the authenticated player's position, broadcast to all listeners.
- `POST /api/leave?room=FARM` JSON `{id, token}` removes a player.

`CORS_ORIGIN` defaults to `https://godofthunder101.github.io`. **This is a prototype, not a secure public multiplayer service.** CORS is not authentication. Any Internet visitor could create rooms and see public room state; a room code is not a private password. Don't put personal data or real secrets here. Room state is in RAM, resets on restart, and won't work correctly with more than one backend replica. Anonymous temporary player tokens are used only to protect against accidental position changes by other clients; full authentication/rate limiting is out of scope.

This file's presence does not mean any backend has been deployed or started on a hosting service.
