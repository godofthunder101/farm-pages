function tri(b, a, c, d, n, rgb, kind) {
    for (const v of [a, c, d])
        b.buf.push(...v, ...n, ...rgb, kind);
}
function quad(b, a, c, d, e, n, rgb, kind) {
    tri(b, a, c, d, n, rgb, kind);
    tri(b, a, d, e, n, rgb, kind);
    b.faces++;
}
function box(b, x, y, z, w, h, depth, rgb, kind = 3) {
    const l = x - w / 2, r = x + w / 2, n = z - depth / 2, f = z + depth / 2, t = y + h;
    quad(b, [l, y, n], [r, y, n], [r, t, n], [l, t, n], [0, 0, -1], rgb, kind);
    quad(b, [r, y, f], [l, y, f], [l, t, f], [r, t, f], [0, 0, 1], rgb, kind);
    quad(b, [l, y, f], [l, y, n], [l, t, n], [l, t, f], [-1, 0, 0], rgb, kind);
    quad(b, [r, y, n], [r, y, f], [r, t, f], [r, t, n], [1, 0, 0], rgb, kind);
    quad(b, [l, t, n], [r, t, n], [r, t, f], [l, t, f], [0, 1, 0], rgb, kind);
}
const cropGreen = [0.31, 0.74, 0.29], dirt = [0.39, 0.27, 0.18];
const forest = [0.24, 0.49, 0.28], stone = [0.28, 0.29, 0.38];
const size = 2.38, step = 2.64;
export function buildFarmMesh(model) {
    const f = model.farm, b = { buf: [], faces: 0 };
    if (model.mode !== "farm")
        return { vertices: new Float32Array(0), triangles: 0,
            faces: 0, owned: 0, unowned: 0, readyPlots: 0, harvestedPlots: 0, entrances: 0,
            gold: f.gold, revision: model.revision };
    let owned = 0, unowned = 0, readyPlots = 0, harvestedPlots = 0, entrances = 0;
    for (const parcel of f.parcels) {
        const x = parcel.x * step, z = -parcel.y * step;
        const colour = parcel.owned ?
            [0.26 + (parcel.x % 2) * 0.035, 0.50, 0.29] :
            [0.26, 0.31, 0.32];
        box(b, x, -0.16, z, size, 0.2, size, parcel.owned ? colour : [0.23, 0.25, 0.28], 3);
        box(b, x, 0.04, z, size, 0.10, size, colour, 3);
        if (parcel.owned)
            owned++;
        else
            unowned++;
        // Edge boundary stones communicate parcel footprint without inventing a fence mechanic.
        for (const side of [-1, 1]) {
            for (const edge of [-0.93, 0, 0.93]) {
                box(b, x + edge, 0.15, z + side * 1.09, 0.28, 0.14, 0.15, parcel.owned ? [0.47, 0.48, 0.43] : [0.32, 0.34, 0.35]);
            }
        }
        for (const plot of f.plots.filter(p => p.parcelId === parcel.id)) {
            const ready = plot.cropStatus === "ready";
            if (ready)
                readyPlots++;
            else
                harvestedPlots++;
            box(b, x - 0.35, 0.16, z - 0.12, 1.16, 0.12, 1.08, dirt);
            // Every stalk is a fixed placeholder showing the JSON plot's ready/harvested state.
            for (let r = 0; r < 3; r++)
                for (let c = 0; c < 3; c++) {
                    const cx = x - 0.76 + c * .39, cz = z - 0.51 + r * .40;
                    box(b, cx, 0.28, cz, 0.11, ready ? .42 : .07, 0.11, ready ? cropGreen : [0.57, 0.44, 0.29]);
                    if (ready)
                        box(b, cx, 0.64, cz, 0.25, 0.13, 0.25, [0.37, 0.82, 0.35]);
                }
        }
        for (const feature of parcel.features) {
            if (feature.kind !== "dungeon-entrance")
                continue;
            entrances++;
            // Purple stone arch, only exists after authorized land purchase exposes feature.
            box(b, x - 0.58, 0.16, z - 0.27, 0.28, 1.07, 0.42, stone);
            box(b, x + 0.58, 0.16, z - 0.27, 0.28, 1.07, 0.42, stone);
            box(b, x, 1.10, z - 0.27, 1.44, 0.31, 0.42, stone);
            box(b, x, 0.18, z - 0.25, 0.92, 0.86, 0.15, [0.23, 0.12, 0.36]);
            box(b, x, 0.18, z + 0.38, 0.82, 0.12, 0.35, [0.70, 0.67, 0.53]);
        }
        if (parcel.owned && parcel.id === "parcel-origin") {
            // Small decorative market stall on the origin parcel (not a new facility mechanic).
            box(b, x + 0.68, 0.18, z + 0.64, 0.48, 0.36, 0.40, [0.56, 0.35, 0.17]);
            box(b, x + 0.68, 0.54, z + 0.64, 0.72, 0.10, 0.55, [0.84, 0.57, 0.30]);
            // A tiny tree communicates the neutral-biome test styling.
            box(b, x - 0.9, 0.18, z + 0.60, 0.13, 0.44, 0.13, [0.37, 0.25, 0.17]);
            box(b, x - 0.9, 0.52, z + 0.60, 0.48, 0.38, 0.48, forest);
        }
    }
    const vertices = new Float32Array(b.buf);
    return { vertices, triangles: vertices.length / 30, faces: b.faces, owned, unowned,
        readyPlots, harvestedPlots, entrances, gold: f.gold, revision: model.revision };
}
const normalize = (v) => {
    const d = Math.hypot(...v);
    if (d < 1e-7)
        throw Error("INVALID_VIEW_DIRECTION");
    return [v[0] / d, v[1] / d, v[2] / d];
};
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const FARM_EYE = [10.8, 11.5, 14.0];
export const FARM_TARGET = [3.6, 0, 0];
export function farmViewMatrix() {
    const forward = normalize(subtract(FARM_TARGET, FARM_EYE));
    const side = normalize(cross(forward, [0, 1, 0]));
    const up = cross(side, forward);
    // OpenGL column-major lookAt.
    return new Float32Array([
        side[0], up[0], -forward[0], 0,
        side[1], up[1], -forward[1], 0,
        side[2], up[2], -forward[2], 0,
        -dot(side, FARM_EYE), -dot(up, FARM_EYE), dot(forward, FARM_EYE), 1
    ]);
}
export function farmOrtho(aspect) {
    if (!Number.isFinite(aspect) || aspect <= 0)
        throw Error("INVALID_FARM_ASPECT");
    const halfHeight = 3.7;
    const halfWidth = Math.max(5.7, halfHeight * aspect);
    const left = -halfWidth, right = halfWidth, bottom = -halfHeight, top = halfHeight, near = 0.1, far = 70;
    return new Float32Array([
        2 / (right - left), 0, 0, 0,
        0, 2 / (top - bottom), 0, 0,
        0, 0, -2 / (far - near), 0,
        -(right + left) / (right - left), -(top + bottom) / (top - bottom),
        -(far + near) / (far - near), 1
    ]);
}
