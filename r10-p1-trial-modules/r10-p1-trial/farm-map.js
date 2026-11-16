export const TRIAL_SEED = "P1T01-StageA-Seed-0001";
export const GENERATOR_VERSION = "p1-t01-local-land/v1";
export const PARCEL_PRICE = 10;
export const INITIAL_CAP = 8;
const MIN = -24, MAX = 24;
export function keyOf(x, y) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < MIN || x > MAX || y < MIN || y > MAX)
        throw Error("INVALID_COORDINATE");
    return String(x) + "," + String(y);
}
export function parseKey(key) {
    if (typeof key !== "string" || !/^(0|-[1-9][0-9]*|[1-9][0-9]*),(0|-[1-9][0-9]*|[1-9][0-9]*)$/.test(key))
        return null;
    const [x, y] = key.split(",").map(Number);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < MIN || x > MAX || y < MIN || y > MAX)
        return null;
    return { x, y };
}
export function distance(x, y) { return Math.abs(x) + Math.abs(y); }
export function isAdjacent(parcels, x, y) {
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= MIN && nx <= MAX && ny >= MIN && ny <= MAX && Object.hasOwn(parcels, keyOf(nx, ny)))
            return true;
    }
    return false;
}
export function frontier(parcels) {
    const result = new Map();
    for (const parcel of Object.values(parcels)) {
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const x = parcel.x + dx, y = parcel.y + dy;
            if (x < MIN || x > MAX || y < MIN || y > MAX)
                continue;
            const key = keyOf(x, y);
            if (!Object.hasOwn(parcels, key))
                result.set(key, { x, y });
        }
    }
    return [...result.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}
function hash(input) {
    let n = 2166136261;
    for (let i = 0; i < input.length; i++) {
        n = Math.imul(n ^ input.charCodeAt(i), 16777619);
    }
    n ^= n >>> 16;
    n = Math.imul(n, 2246822507);
    n ^= n >>> 13;
    return n >>> 0;
}
export function generateParcel(seed, x, y, biome, entrance) {
    if (biome !== "grassland" && biome !== "marshland")
        throw Error("INVALID_BIOME");
    const key = keyOf(x, y), d = distance(x, y), r = hash(GENERATOR_VERSION + "|" + seed + "|" + key + "|" + biome + "|" + d);
    return { key, x, y, biome, entranceId: entrance ? "entrance-one" : null,
        terrain: { height: (r % 3) * 0.12, rocks: 1 + ((r >>> 3) % 3),
            vegetation: biome === "grassland" ? 2 + ((r >>> 7) % 4) : 3 + ((r >>> 7) % 3),
            pools: biome === "marshland" ? 1 + ((r >>> 11) % 2) : 0, variation: (r >>> 17) % 1000 } };
}
export function hubParcel() {
    return { key: "0,0", x: 0, y: 0, biome: "neutral",
        terrain: { height: 0.12, rocks: 1, vegetation: 2, pools: 0, variation: 0 }, entranceId: null };
}
