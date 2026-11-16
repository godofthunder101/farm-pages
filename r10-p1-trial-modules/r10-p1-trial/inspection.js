/** Semantic diagnostics, strictly derived from P1-T01 trial state. */
import { snapshot } from "./session.js";
function xml(s) {
    return s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]));
}
export function renderSvg(s) {
    const m = snapshot(s), farm = m.farm;
    const cells = [...farm.ownedParcels, ...farm.frontier.map(p => ({ ...p,
            key: String(p.x) + "," + String(p.y), biome: "candidate", entranceId: null }))];
    const minx = Math.min(...cells.map(c => c.x)), maxx = Math.max(...cells.map(c => c.x));
    const miny = Math.min(...cells.map(c => c.y)), maxy = Math.max(...cells.map(c => c.y));
    const W = (maxx - minx + 1) * 72 + 20, H = (maxy - miny + 1) * 72 + 54;
    const rects = cells.map(p => {
        const owned = farm.ownedParcels.some(q => q.key === p.key);
        const x = 10 + (p.x - minx) * 72, y = 40 + (p.y - miny) * 72;
        const fill = owned ? (p.biome === "grassland" ? "#79a947" : p.biome === "marshland" ? "#497b75" : "#c2af7a") : "#263e38";
        const label = (p.entranceId ? " ★" : "") + (owned ? "" : " ?");
        return '<g data-key="' + xml(p.key) + '" data-owned="' + owned + '"><rect x="' + x + '" y="' + y +
            '" width="68" height="68" fill="' + fill + '" stroke="#dae6d8" stroke-width="2"/>' +
            '<text x="' + (x + 4) + '" y="' + (y + 20) + '" fill="' + (owned ? "#122c20" : "#e0eee2") +
            '" font-size="11">' + xml(p.key + label) + '</text><title>' + xml(p.biome + " " + p.key + (p.entranceId ? " dungeon entrance" : "")) + '</title></g>';
    }).join("");
    return '<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ' + W + ' ' + H +
        '"><rect width="100%" height="100%" fill="#152923"/><text x="10" y="25" font-size="14" fill="#fff">' +
        xml("P1-T01 LOCAL farm revision " + m.farmRevision + " / world " + m.revision) +
        '</text>' + rects + '</svg>';
}
export function diagnostic(s) {
    const m = snapshot(s);
    return [
        "FARM TEST P1-T01 STAGE A — LOCAL NON-AUTHORITATIVE TRIAL REPORT",
        "Not a durable purchase, persistent save, or browser screen-reader delivery receipt",
        "Revision " + s.revision + " | Farm revision " + s.farmRevision + " | " + s.mode,
        "Seed " + s.seed + " | Generator " + s.generatorVersion,
        "Cap " + s.cap + " | Gold " + s.gold + " | First entrance " + (s.firstEntranceKey ?? "none"),
        "ACTION.HISTORY", JSON.stringify(s.history, null, 2),
        "INSPECT.JSON", JSON.stringify(m, null, 2),
        "INSPECT.SVG", renderSvg(s)
    ].join("\n");
}
