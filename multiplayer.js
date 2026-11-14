import { captureErrors, logEvent } from './diagnostics.js';
const SHA = '23fbb35c96a1f70d77d4524ba3cf7f388207d1d3c5490ef4070854a3e8dbcf21';
const el = (id) => document.getElementById(id);
const board = el('mp-field');
const ctx = board.getContext('2d');
const serverInput = el('server-url');
const roomInput = el('room-code');
const nameInput = el('player-name');
const stateBox = el('mp-state');
const status = el('mp-status');
const gate = el('mp-gate');
let current = null;
let eventSource = null;
let roomState = null;
let working = false;
let canPlay = false;
serverInput.value = localStorage.getItem('farm-trial.backend-url') || new URLSearchParams(location.search).get('server') || '';
roomInput.value = (new URLSearchParams(location.search).get('room') || 'FARM').slice(0, 8).toUpperCase();
nameInput.value = localStorage.getItem('farm-trial.player-name') || 'Farmer';
captureErrors();
logEvent('INFO', 'multiplayer.open', 'build=trial-003');
function setStatus(message) { status.textContent = message; }
function refreshInspect() {
    stateBox.textContent = JSON.stringify({ build: 'trial-003', connected: Boolean(current), server: current?.backend ?? null, room: current?.room ?? null, me: current?.session.id ?? null, state: roomState }, null, 2);
}
function color(id) {
    let hash = 0;
    for (const char of id)
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return `hsl(${hash % 360} 75% 70%)`;
}
function draw() {
    ctx.clearRect(0, 0, board.width, board.height);
    for (let y = 0; y < 8; y++)
        for (let x = 0; x < 12; x++) {
            ctx.fillStyle = (x + y) % 2 ? '#3f673a' : '#4d7845';
            ctx.fillRect(x * 60 + 1, y * 60 + 1, 58, 58);
        }
    for (const p of roomState?.players || []) {
        const cx = p.x * 60 + 30, cy = p.y * 60 + 30;
        ctx.beginPath();
        ctx.arc(cx, cy, 19, 0, Math.PI * 2);
        ctx.fillStyle = color(p.id);
        ctx.fill();
        ctx.lineWidth = p.id === current?.session.id ? 5 : 2;
        ctx.strokeStyle = p.id === current?.session.id ? '#fff' : '#253326';
        ctx.stroke();
        ctx.fillStyle = '#102012';
        ctx.font = 'bold 14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(p.name.slice(0, 8), cx, cy + 5, 54);
    }
    el('mp-players').textContent = `Players: ${roomState?.players.map(p => `${p.name}${p.id === current?.session.id ? ' (you)' : ''}`).join(', ') || 'none'}`;
}
function acceptState(raw) {
    if (!raw || typeof raw !== 'object')
        return;
    const value = raw;
    if (value.type !== 'state' || !Array.isArray(value.players) || typeof value.revision !== 'number')
        return;
    roomState = value;
    draw();
    refreshInspect();
    logEvent('INFO', 'multiplayer.sync', `revision=${roomState.revision}, players=${roomState.players.length}`);
    setStatus(`Connected to ${roomState.room} · ${roomState.players.length} players`);
}
async function digest(word) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('farm-pages:v1:' + word.trim().toLowerCase()));
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
el('mp-word-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = el('mp-word');
    const button = el('mp-unlock');
    button.disabled = true;
    try {
        if (await digest(input.value) === SHA) {
            canPlay = true;
            input.value = '';
            gate.hidden = true;
            logEvent('INFO', 'multiplayer.gate.unlocked');
        }
        else {
            el('mp-gate-error').textContent = 'Incorrect word';
            logEvent('WARN', 'multiplayer.gate.failed');
        }
    }
    catch (e) {
        el('mp-gate-error').textContent = 'Unlock requires HTTPS';
        logEvent('ERROR', 'multiplayer.gate.error', String(e));
    }
    button.disabled = false;
});
function validateServer(input) {
    const value = new URL(input.trim());
    if (!['https:', 'http:'].includes(value.protocol) || (value.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(value.hostname)))
        throw Error('Use an HTTPS server URL');
    if (value.username || value.password || value.search || value.hash)
        throw Error('Enter the server origin only, with no login or parameters');
    return value.origin;
}
async function request(backend, action, room, body) {
    const response = await fetch(`${backend}/api/${action}?room=${encodeURIComponent(room)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok)
        throw Error(String(result.error || `HTTP ${response.status}`));
    return result;
}
function shutdownStream() { if (eventSource) {
    eventSource.close();
    eventSource = null;
} }
function sessionKey(backend, room) { return `farm-trial.session:${backend}:${room}`; }
el('mp-connect').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!canPlay || working)
        return;
    working = true;
    el('mp-join').disabled = true;
    setStatus('Connecting…');
    try {
        const backend = validateServer(serverInput.value);
        const room = roomInput.value.trim().toUpperCase();
        if (!/^[A-Z0-9]{4,8}$/.test(room))
            throw Error('Room must be 4–8 letters or numbers');
        const name = nameInput.value.trim().slice(0, 18) || 'Farmer';
        if (current)
            throw Error('Leave the current room first');
        const saved = sessionStorage.getItem(sessionKey(backend, room));
        let previous = null;
        try {
            if (saved)
                previous = JSON.parse(saved);
        }
        catch { /* join as new player */ }
        const response = await request(backend, 'join', room, { name, ...(previous ? previous : {}) });
        const session = { id: String(response.id), token: String(response.token) };
        current = { backend, room, session };
        sessionStorage.setItem(sessionKey(backend, room), JSON.stringify(session));
        localStorage.setItem('farm-trial.backend-url', backend);
        localStorage.setItem('farm-trial.player-name', name);
        acceptState(response.state);
        eventSource = new EventSource(`${backend}/api/events?room=${room}`);
        eventSource.addEventListener('state', event => {
            try {
                acceptState(JSON.parse(event.data));
            }
            catch (error) {
                logEvent('ERROR', 'multiplayer.invalid-state', String(error));
            }
        });
        eventSource.addEventListener('error', () => { setStatus('Connection interrupted; retrying…'); logEvent('WARN', 'multiplayer.stream.error'); });
        el('mp-leave').disabled = false;
        logEvent('INFO', 'multiplayer.join', `room=${room}, player=${session.id}`);
    }
    catch (error) {
        setStatus(`Cannot join: ${String(error instanceof Error ? error.message : error)}`);
        logEvent('ERROR', 'multiplayer.join.failed', String(error));
    }
    finally {
        working = false;
        el('mp-join').disabled = Boolean(current);
        refreshInspect();
    }
});
board.addEventListener('pointerdown', async (event) => {
    if (!canPlay || !current || working)
        return;
    const bounds = board.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left) * 12 / bounds.width);
    const y = Math.floor((event.clientY - bounds.top) * 8 / bounds.height);
    if (x < 0 || x > 11 || y < 0 || y > 7)
        return;
    const room = current;
    working = true;
    try {
        await request(room.backend, 'move', room.room, { ...room.session, x, y });
        logEvent('INFO', 'multiplayer.move', `x=${x}, y=${y}`);
    }
    catch (error) {
        setStatus(`Move rejected: ${String(error)}`);
        logEvent('WARN', 'multiplayer.move.failed', String(error));
    }
    finally {
        working = false;
    }
});
el('mp-leave').addEventListener('click', async () => {
    if (!current || working)
        return;
    working = true;
    const old = current;
    shutdownStream();
    try {
        await request(old.backend, 'leave', old.room, old.session);
    }
    catch (error) {
        logEvent('WARN', 'multiplayer.leave.failed', String(error));
    }
    sessionStorage.removeItem(sessionKey(old.backend, old.room));
    current = null;
    roomState = null;
    working = false;
    el('mp-join').disabled = false;
    el('mp-leave').disabled = true;
    setStatus('Left room');
    logEvent('INFO', 'multiplayer.leave', `room=${old.room}`);
    draw();
    refreshInspect();
});
el('mp-copy-state').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(stateBox.textContent || '');
        el('mp-copy-state').textContent = 'Copied';
    }
    catch {
        el('mp-copy-state').textContent = 'Select JSON to copy';
    }
});
draw();
refreshInspect();
