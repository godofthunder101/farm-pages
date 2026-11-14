import { captureErrors, logEvent } from './diagnostics.js';
/** Trial-only touch surface. No original game mechanics are implemented yet. */
captureErrors();
const SHA = '23fbb35c96a1f70d77d4524ba3cf7f388207d1d3c5490ef4070854a3e8dbcf21';
const el = (id) => document.getElementById(id);
const field = el('field');
const paint = field.getContext('2d');
const planted = new Set();
let unlocked = false;
let taps = 0;
let failed = 0;
const query = new URLSearchParams(location.search);
const seed = query.get('seed')?.slice(0, 64) || 'default';
function state() {
    return JSON.stringify({ build: 'trial-002', seed, unlocked, taps, failed, planted: [...planted].sort((a, b) => a - b), browser: navigator.userAgent }, null, 2);
}
function inspect() { el('state').textContent = state(); }
function draw() {
    for (let y = 0; y < 8; y++)
        for (let x = 0; x < 12; x++) {
            const w = 60, h = 60, id = y * 12 + x;
            paint.fillStyle = (x + y) % 2 ? '#3f673a' : '#4d7845';
            paint.fillRect(x * w + 1, y * h + 1, w - 2, h - 2);
            if (planted.has(id)) {
                paint.fillStyle = '#f0cf79';
                paint.beginPath();
                paint.arc(x * w + 30, y * h + 30, 14, 0, Math.PI * 2);
                paint.fill();
            }
        }
}
async function digest(word) {
    const value = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('farm-pages:v1:' + word.trim().toLowerCase()));
    return [...new Uint8Array(value)].map(b => b.toString(16).padStart(2, '0')).join('');
}
el('word-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = el('word');
    const button = el('unlock');
    button.disabled = true;
    try {
        if (await digest(input.value) === SHA) {
            unlocked = true;
            el('gate').hidden = true;
            input.value = '';
            el('reset').disabled = false;
            el('status').textContent = 'Unlocked — tap the field';
            logEvent('INFO', 'gate.unlocked');
        }
        else {
            failed++;
            el('error').textContent = 'Incorrect word. Try again.';
            logEvent('WARN', 'gate.failed', `attempt ${failed}`);
        }
    }
    catch (error) {
        el('error').textContent = 'Word checking needs HTTPS or localhost.';
        logEvent('ERROR', 'gate.digest.failed', String(error));
    }
    button.disabled = false;
    inspect();
});
field.addEventListener('pointerdown', e => {
    if (!unlocked)
        return;
    const r = field.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) * 12 / r.width), y = Math.floor((e.clientY - r.top) * 8 / r.height);
    if (x < 0 || x >= 12 || y < 0 || y >= 8)
        return;
    planted.add(y * 12 + x);
    taps++;
    draw();
    inspect();
    logEvent('INFO', 'field.plant', `x=${x}, y=${y}, planted=${planted.size}`);
    el('status').textContent = `Unlocked — ${planted.size} planted squares`;
});
el('reset').addEventListener('click', () => {
    if (!unlocked)
        return;
    planted.clear();
    taps = 0;
    draw();
    inspect();
    el('status').textContent = 'Field reset';
    logEvent('INFO', 'field.reset');
});
el('copy').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(state());
        el('copy').textContent = 'Copied';
    }
    catch {
        el('copy').textContent = 'Select JSON below to copy';
    }
});
el('debug').hidden = query.get('debug') !== '1';
draw();
inspect();
logEvent('INFO', 'app.started', `build=trial-002, seed=${seed}`);
