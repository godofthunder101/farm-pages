export const CAMERA_HEIGHT = 0.64;
export const WALL_HEIGHT = 1.7;
const dir = {
    N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0]
};
export function poseFromInspection(state) {
    const p = state.player;
    if (state.mode !== "dungeon" || !state.dungeon || !p.position || !p.facing)
        return null;
    const d = dir[p.facing];
    return {
        eye: [p.position.x + 0.5, CAMERA_HEIGHT, p.position.y + 0.5],
        direction: [d[0], 0, d[1]], right: [d[1] === 0 ? 0 : -d[1], 0, d[0]],
        facing: p.facing, tile: { x: p.position.x, y: p.position.y }
    };
}
export function perspective(fovDegrees, aspect, near, far) {
    if (!(fovDegrees > 20 && fovDegrees < 130 && aspect > 0 && near > 0 && far > near))
        throw Error("INVALID_PROJECTION");
    const f = 1 / Math.tan(fovDegrees * Math.PI / 360);
    const d = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * d, -1,
        0, 0, 2 * far * near * d, 0
    ]);
}
export function viewMatrix(pose) {
    const e = pose.eye, r = pose.right, d = pose.direction, b = [-d[0], -d[1], -d[2]];
    // Column-major matrix (same convention as WebGL uniforms).
    return new Float32Array([
        r[0], 0, b[0], 0,
        r[1], 1, b[1], 0,
        r[2], 0, b[2], 0,
        -(r[0] * e[0] + r[1] * e[1] + r[2] * e[2]),
        -e[1],
        -(b[0] * e[0] + b[1] * e[1] + b[2] * e[2]),
        1
    ]);
}
const STONE = [0.49, 0.60, 0.65];
const GROUND = [0.35, 0.40, 0.41];
const CEILING = [0.28, 0.35, 0.40];
const CHEST = [0.49, 0.28, 0.10];
const GOLD = [0.93, 0.70, 0.24];
const DEAD = [0.42, 0.45, 0.50];
const ENEMY = [0.84, 0.16, 0.23];
function triangle(b, a, c, d, n, color, material) {
    const push = (v) => {
        b.buf.push(v[0], v[1], v[2], n[0], n[1], n[2], color[0], color[1], color[2], material);
    };
    push(a);
    push(c);
    push(d);
}
function quad(b, a, c, d, e, n, color, material) {
    triangle(b, a, c, d, n, color, material);
    triangle(b, a, d, e, n, color, material);
    b.faces++;
}
function cube(b, x, y, z, w, h, depth, color, material) {
    const lo = x - w / 2, hi = x + w / 2, near = z - depth / 2, far = z + depth / 2, top = y + h;
    quad(b, [lo, y, near], [hi, y, near], [hi, top, near], [lo, top, near], [0, 0, -1], color, material);
    quad(b, [hi, y, far], [lo, y, far], [lo, top, far], [hi, top, far], [0, 0, 1], color, material);
    quad(b, [lo, y, far], [lo, y, near], [lo, top, near], [lo, top, far], [-1, 0, 0], color, material);
    quad(b, [hi, y, near], [hi, y, far], [hi, top, far], [hi, top, near], [1, 0, 0], color, material);
    quad(b, [lo, top, near], [hi, top, near], [hi, top, far], [lo, top, far], [0, 1, 0], color, material);
}
function crystal(b, x, y, z, r, color) {
    const top = [x, y + r * 2.7, z], low = [x, y, z];
    const corners = [[x - r, y + r, z], [x, y + r, z + r], [x + r, y + r, z], [x, y + r, z - r]];
    for (let i = 0; i < 4; i++) {
        const a = corners[i], c = corners[(i + 1) % 4];
        triangle(b, top, a, c, [0, 1, 0], color, 3);
        b.faces++;
        triangle(b, low, c, a, [0, -1, 0], color, 3);
        b.faces++;
    }
}
function sameTile(a, b) {
    return a.x === b.x && a.y === b.y;
}
export function buildScene(state) {
    const b = { buf: [], faces: 0, walkable: 0, walls: 0 };
    const pose = poseFromInspection(state), d = state.dungeon;
    if (!d || !pose)
        return {
            mode: "farm", revision: state.revision, pose: null,
            mesh: { vertices: new Float32Array(0), stride: 10, triangles: 0, faces: 0,
                stats: { walkable: 0, walls: 0, chest: "none", enemy: "none" } }
        };
    const floor = new Set(d.walkable.map(p => p.x + "," + p.y));
    const isFloor = (x, y) => floor.has(x + "," + y);
    for (const tile of d.walkable) {
        const x = tile.x, z = tile.y;
        const tint = 1 + ((x * 13 + z * 7) % 5 - 2) * 0.025;
        const colour = (c) => [c[0] * tint, c[1] * tint, c[2] * tint];
        // Ground / ceiling lie on separate Y planes; depth test occludes actors.
        quad(b, [x, 0, z + 1], [x + 1, 0, z + 1], [x + 1, 0, z], [x, 0, z], [0, 1, 0], colour(GROUND), 0);
        quad(b, [x, WALL_HEIGHT, z], [x + 1, WALL_HEIGHT, z], [x + 1, WALL_HEIGHT, z + 1], [x, WALL_HEIGHT, z + 1], [0, -1, 0], colour(CEILING), 2);
        b.walkable++;
        if (!isFloor(x, z - 1)) {
            quad(b, [x, 0, z], [x + 1, 0, z], [x + 1, WALL_HEIGHT, z], [x, WALL_HEIGHT, z], [0, 0, 1], colour(STONE), 1);
            b.walls++;
        }
        if (!isFloor(x, z + 1)) {
            quad(b, [x + 1, 0, z + 1], [x, 0, z + 1], [x, WALL_HEIGHT, z + 1], [x + 1, WALL_HEIGHT, z + 1], [0, 0, -1], colour(STONE), 1);
            b.walls++;
        }
        if (!isFloor(x - 1, z)) {
            quad(b, [x, 0, z + 1], [x, 0, z], [x, WALL_HEIGHT, z], [x, WALL_HEIGHT, z + 1], [1, 0, 0], colour(STONE), 1);
            b.walls++;
        }
        if (!isFloor(x + 1, z)) {
            quad(b, [x + 1, 0, z], [x + 1, 0, z + 1], [x + 1, WALL_HEIGHT, z + 1], [x + 1, WALL_HEIGHT, z], [-1, 0, 0], colour(STONE), 1);
            b.walls++;
        }
    }
    const chest = d.chest;
    const cx = chest.position.x + 0.5, cz = chest.position.y + 0.5;
    cube(b, cx, 0.02, cz, 0.57, 0.36, 0.4, chest.opened ? [0.32, 0.27, 0.20] : CHEST, 3);
    cube(b, cx, 0.39, cz, 0.57, 0.09, 0.42, chest.opened ? DEAD : CHEST, 3);
    cube(b, cx, 0.08, cz + 0.205, 0.10, 0.33, 0.018, GOLD, 3);
    if (!chest.opened)
        cube(b, cx, 0.23, cz + 0.224, 0.08, 0.13, 0.024, GOLD, 3);
    // The established R09 combat rule engages when the player and enemy occupy
    // the SAME tile. Present the live enemy in front of the camera during engagement
    // without modifying its authoritative grid coordinates.
    const enemy = d.enemy, hero = state.player;
    let ex = enemy.position.x + 0.5, ez = enemy.position.y + 0.5;
    if (d.engaged && enemy.status === "alive" && hero.position && sameTile(hero.position, enemy.position)) {
        ex = pose.eye[0] + pose.direction[0] * 0.50;
        ez = pose.eye[2] + pose.direction[2] * 0.50;
    }
    if (enemy.status === "alive") {
        cube(b, ex, 0.03, ez, 0.42, 0.10, 0.42, [0.20, 0.16, 0.22], 3);
        crystal(b, ex, 0.12, ez, 0.23, ENEMY);
        cube(b, ex - 0.07, 0.45, ez + 0.21, 0.08, 0.07, 0.02, GOLD, 3);
        cube(b, ex + 0.07, 0.45, ez + 0.21, 0.08, 0.07, 0.02, GOLD, 3);
    }
    else {
        cube(b, ex, 0.01, ez, 0.38, 0.05, 0.38, DEAD, 3);
    }
    const vertices = new Float32Array(b.buf);
    return { mode: "dungeon", revision: state.revision, pose,
        mesh: { vertices, stride: 10, triangles: vertices.length / 30, faces: b.faces,
            stats: { walkable: b.walkable, walls: b.walls,
                chest: chest.opened ? "opened" : "closed", enemy: enemy.status } } };
}
