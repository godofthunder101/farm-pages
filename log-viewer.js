import { captureErrors, clearLogs, logEvent, plainText, readLogs } from './diagnostics.js';
const get = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const report = query.get('report');
let shared = null;
if (report !== null) {
    try {
        const unpacked = JSON.parse(report);
        if (!Array.isArray(unpacked) || unpacked.length > 20 || !unpacked.every(e => e && typeof e === 'object' && typeof e.at === 'string' && typeof e.event === 'string' &&
            ['INFO', 'WARN', 'ERROR'].includes(e.level) && (e.detail === undefined || typeof e.detail === 'string')))
            throw Error('Invalid report data');
        shared = unpacked;
        get('report-note').textContent = 'Shared snapshot from a URL. Not your current browser logs.';
    }
    catch {
        get('report-note').textContent = 'Invalid shared report link. Showing browser-local logs instead.';
    }
}
if (shared === null) {
    captureErrors();
    logEvent('INFO', 'logviewer.open', 'Browser-local diagnostics opened');
}
function selected() { return shared ?? readLogs(); }
function render() {
    const entries = selected();
    get('count').textContent = `${entries.length} entries`;
    get('log-text').textContent = plainText(entries);
    get('clear-logs').disabled = shared !== null || entries.length === 0;
    get('test-entry').disabled = shared !== null;
}
get('refresh').addEventListener('click', render);
get('copy-logs').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(plainText(selected()));
        get('result').textContent = 'Log text copied. Paste it into ChatGPT.';
    }
    catch {
        get('result').textContent = 'Copy failed. Long-press the log text below to select it.';
    }
});
get('share').addEventListener('click', async () => {
    // Bounded snapshot, embedded in the URL itself. Nothing is uploaded to a server.
    const entries = selected().slice(-12).map(e => ({ at: e.at, level: e.level, event: e.event, ...(e.detail ? { detail: e.detail.slice(0, 140) } : {}) }));
    const url = new URL('./log.html', location.href);
    url.searchParams.set('report', JSON.stringify(entries));
    try {
        await navigator.clipboard.writeText(url.href);
        get('result').textContent = 'Snapshot URL copied. Paste it into ChatGPT to share these entries.';
    }
    catch {
        get('result').textContent = `Copy failed. Select this link: ${url.href}`;
    }
});
get('download').addEventListener('click', () => {
    const blob = new Blob([plainText(selected())], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'farm-test-log.txt';
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
});
get('clear-logs').addEventListener('click', () => {
    if (shared !== null || !confirm('Erase this browser’s diagnostic history?'))
        return;
    clearLogs();
    logEvent('INFO', 'logviewer.cleared');
    render();
});
get('test-entry').addEventListener('click', () => {
    if (shared !== null)
        return;
    logEvent('WARN', 'diagnostics.test', 'Manual test entry from log viewer');
    render();
});
render();
