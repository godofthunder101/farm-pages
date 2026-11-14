/** Trial 003: zero-dependency TypeScript multiplayer backend for Node 22. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';

type Player = { id: string; token: string; name: string; x: number; y: number; lastMove: number };
type Room = { players: Map<string, Player>; listeners: Set<ServerResponse>; touched: number; revision: number };
type Json = Record<string, unknown>;
const rooms = new Map<string, Room>();
const PORT = Number(process.env.PORT || '3000');
const HOST = process.env.HOST || '0.0.0.0';
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'https://godofthunder101.github.io';
const MAX_ROOMS = 100;
const MAX_PLAYERS = 8;
const ROOM_TTL_MS = 30 * 60_000;
const GRID_W = 12;
const GRID_H = 8;

function cors(res: ServerResponse, req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) return false;
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  return true;
}
function json(res: ServerResponse, status: number, data: Json): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function roomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const room = value.toUpperCase().trim();
  return /^[A-Z0-9]{4,8}$/.test(room) ? room : null;
}
function nameOf(value: unknown): string {
  if (typeof value !== 'string') return 'Farmer';
  return value.trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 18) || 'Farmer';
}
function snapshot(code: string, room: Room): Json {
  return { type: 'state', room: code, revision: room.revision, players: [...room.players.values()].map(({ id, name, x, y }) => ({ id, name, x, y })) };
}
function publish(code: string, room: Room): void {
  room.revision++;
  room.touched = Date.now();
  const frame = `event: state\ndata: ${JSON.stringify(snapshot(code, room))}\n\n`;
  for (const stream of room.listeners) {
    try { stream.write(frame); }
    catch { room.listeners.delete(stream); }
  }
}
async function readJson(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2048) throw new Error('Request body too large');
    chunks.push(buffer);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected JSON object');
  return value as Json;
}
function verify(room: Room, data: Json): Player | undefined {
  if (typeof data.id !== 'string' || typeof data.token !== 'string') return;
  const player = room.players.get(data.id);
  return player && player.token === data.token ? player : undefined;
}

const server = createServer(async (req, res) => {
  if (!cors(res, req)) { json(res, 403, { error: 'Origin not allowed' }); return; }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url || '/', 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { status: 'ok', build: 'trial-003', transport: 'sse+http', rooms: rooms.size }); return;
  }
  if (url.pathname !== '/api/join' && url.pathname !== '/api/move' && url.pathname !== '/api/leave' && url.pathname !== '/api/events') {
    json(res, 404, { error: 'Not found' }); return;
  }
  const code = roomCode(url.searchParams.get('room'));
  if (!code) { json(res, 400, { error: 'Room code must be 4–8 letters or digits' }); return; }
  let room = rooms.get(code);
  if (req.method === 'GET' && url.pathname === '/api/events') {
    if (!room) { json(res, 404, { error: 'Room does not exist' }); return; }
    room.touched = Date.now();
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`retry: 3000\n\nevent: state\ndata: ${JSON.stringify(snapshot(code, room))}\n\n`);
    room.listeners.add(res);
    const ping = setInterval(() => { if (!res.writableEnded) res.write(': heartbeat\n\n'); }, 20_000);
    req.on('close', () => { clearInterval(ping); room?.listeners.delete(res); });
    return;
  }
  if (req.method !== 'POST') { json(res, 405, { error: 'POST required' }); return; }
  let body: Json;
  try { body = await readJson(req); }
  catch { json(res, 400, { error: 'Invalid JSON or oversized body' }); return; }
  if (url.pathname === '/api/join') {
    if (!room) {
      if (rooms.size >= MAX_ROOMS) { json(res, 503, { error: 'Room capacity reached' }); return; }
      room = { players: new Map(), listeners: new Set(), touched: Date.now(), revision: 0 };
      rooms.set(code, room);
    }
    let player = verify(room, body);
    if (!player) {
      if (room.players.size >= MAX_PLAYERS) { json(res, 409, { error: 'Room full (8 players maximum)' }); return; }
      player = { id: randomUUID(), token: randomUUID(), name: nameOf(body.name), x: Math.floor(Math.random() * GRID_W), y: Math.floor(Math.random() * GRID_H), lastMove: 0 };
      room.players.set(player.id, player);
    } else { player.name = nameOf(body.name); }
    publish(code, room);
    json(res, 200, { id: player.id, token: player.token, room: code, state: snapshot(code, room) });
    return;
  }
  if (!room) { json(res, 404, { error: 'Room does not exist' }); return; }
  const player = verify(room, body);
  if (!player) { json(res, 403, { error: 'Unknown player credentials' }); return; }
  if (url.pathname === '/api/leave') {
    room.players.delete(player.id);
    publish(code, room);
    json(res, 200, { ok: true });
    return;
  }
  if (!Number.isInteger(body.x) || !Number.isInteger(body.y) || (body.x as number) < 0 || (body.x as number) >= GRID_W || (body.y as number) < 0 || (body.y as number) >= GRID_H) {
    json(res, 400, { error: 'Move coordinates out of bounds' }); return;
  }
  if (Date.now() - player.lastMove < 50) { json(res, 429, { error: 'Slow down' }); return; }
  player.lastMove = Date.now();
  player.x = body.x as number; player.y = body.y as number;
  publish(code, room);
  json(res, 200, { ok: true, revision: room.revision });
});
const cleaning = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.listeners.size === 0 && now - room.touched > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60_000);
cleaning.unref();
server.listen(PORT, HOST, () => console.log(`FARM_TRIAL_BACKEND=READY host=${HOST} port=${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => server.close(() => process.exit(0)));
