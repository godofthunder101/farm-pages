const KEY = 'farm-test.log.v1';
const LIMIT = 120;
const MAX_DETAIL = 600;
let memory = [];
let loaded = false;
function validEntry(value) {
    if (!value || typeof value !== 'object')
        return false;
    const item = value;
    return typeof item.at === 'string' && (item.level === 'INFO' || item.level === 'WARN' || item.level === 'ERROR')
        && typeof item.event === 'string' && (item.detail === undefined || typeof item.detail === 'string');
}
function load() {
    if (loaded)
        return;
    loaded = true;
    try {
        const value = JSON.parse(localStorage.getItem(KEY) || '[]');
        memory = Array.isArray(value) ? value.filter(validEntry).slice(-LIMIT) : [];
    }
    catch {
        memory = [];
    }
}
function persist() {
    try {
        localStorage.setItem(KEY, JSON.stringify(memory));
    }
    catch { /* Private mode or full storage: keep current-page in-memory history. */ }
}
export function readLogs() { load(); return memory.map(entry => ({ ...entry })); }
export function clearLogs() { load(); memory = []; persist(); }
export function logEvent(level, event, detail) {
    load();
    const item = { at: new Date().toISOString(), level, event: String(event).slice(0, 100) };
    if (detail !== undefined) {
        let value;
        try {
            value = typeof detail === 'string' ? detail : JSON.stringify(detail) ?? String(detail);
        }
        catch {
            value = String(detail);
        }
        item.detail = value.slice(0, MAX_DETAIL);
    }
    memory.push(item);
    if (memory.length > LIMIT)
        memory = memory.slice(-LIMIT);
    persist();
}
let handlersInstalled = false;
export function captureErrors() {
    if (handlersInstalled)
        return;
    handlersInstalled = true;
    window.addEventListener('error', event => {
        logEvent('ERROR', 'javascript.error', `${event.message || 'Unknown error'} @ ${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`);
    });
    window.addEventListener('unhandledrejection', event => {
        const reason = event.reason;
        logEvent('ERROR', 'javascript.unhandledrejection', reason instanceof Error ? `${reason.name}: ${reason.message}\n${reason.stack || ''}` : String(reason));
    });
}
export function plainText(entries = readLogs()) {
    return ['Farm Test diagnostics (browser-local; share manually)', ...entries.map(e => `[${e.at}] ${e.level.padEnd(5)} ${e.event}${e.detail ? ` — ${e.detail}` : ''}`)].join('\n');
}
