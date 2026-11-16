const STEP = 2.45;
const COLORS = {
    grass: [0.34, 0.57, 0.26],
    marsh: [0.24, 0.40, 0.40],
    hub: [0.65, 0.55, 0.34],
    soil: [0.35, 0.31, 0.24],
    grassLight: [0.47, 0.72, 0.34],
    rock: [0.51, 0.52, 0.53],
    reeds: [0.65, 0.69, 0.30],
    pool: [0.21, 0.50, 0.61],
    arch: [0.64, 0.31, 0.77],
    selected: [0.91, 0.79, 0.34]
};
function triangle(b, a, c, d, rgb) {
    for (const p of [a, c, d])
        b.push(...p, ...rgb);
}
function quad(b, a, c, d, e, rgb) {
    triangle(b, a, c, d, rgb);
    triangle(b, a, d, e, rgb);
}
function box(b, cx, y, cz, w, h, depth, rgb) {
    const l = cx - w / 2, r = cx + w / 2, n = cz - depth / 2, f = cz + depth / 2, t = y + h;
    quad(b, [l, y, n], [r, y, n], [r, t, n], [l, t, n], rgb);
    quad(b, [r, y, f], [l, y, f], [l, t, f], [r, t, f], rgb);
    quad(b, [l, y, f], [l, y, n], [l, t, n], [l, t, f], rgb);
    quad(b, [r, y, n], [r, y, f], [r, t, f], [r, t, n], rgb);
    quad(b, [l, t, n], [r, t, n], [r, t, f], [l, t, f], rgb);
    quad(b, [r, y, n], [l, y, n], [l, y, f], [r, y, f], rgb);
}
export function buildFarmMesh(s, selectedKey = null) {
    const b = [];
    const parcels = Object.values(s.parcels).sort((a, c) => a.x + a.y - c.x - c.y || a.x - c.x);
    for (const p of parcels) {
        const x = p.x * STEP, z = p.y * STEP, h = .2 + p.terrain.height;
        const main = p.biome === "grassland" ? COLORS.grass : p.biome === "marshland" ? COLORS.marsh : COLORS.hub;
        box(b, x, h - .24, z, 2.3, .24, 2.3, main);
        if (p.biome === "neutral") {
            box(b, x, h, z, .55, .28, .65, COLORS.soil);
            if (s.cropReady) {
                for (let n = 0; n < 3; n++)
                    box(b, x - .65 + n * .22, h, z + .5, .10, .28, .10, COLORS.grassLight);
            }
        }
        else {
            for (let i = 0; i < p.terrain.rocks; i++) {
                const ox = ((p.terrain.variation + i * 31) % 13 - 6) * .125;
                const oz = ((p.terrain.variation + i * 17) % 11 - 5) * .13;
                box(b, x + ox, h, z + oz, .15, .11, .14, COLORS.rock);
            }
            for (let i = 0; i < p.terrain.vegetation; i++) {
                const ox = (((p.terrain.variation >> 2) + i * 13) % 15 - 7) * .12;
                const oz = (((p.terrain.variation >> 3) + i * 19) % 13 - 6) * .12;
                box(b, x + ox, h, z + oz, .07, .12 + i % 3 * .06, .08, p.biome === "grassland" ? COLORS.grassLight : COLORS.reeds);
            }
            for (let i = 0; i < p.terrain.pools; i++) {
                const ox = i === 0 ? .5 : -.5, oz = i === 0 ? -.4 : .4;
                box(b, x + ox, h + .012, z + oz, .58, .015, .42, COLORS.pool);
            }
        }
        if (p.entranceId) {
            // Simple on-parcel arch, never a preview or procedurally generated dungeon.
            box(b, x - .36, h, z, .16, .82, .23, COLORS.arch);
            box(b, x + .36, h, z, .16, .82, .23, COLORS.arch);
            box(b, x, h + .70, z, .87, .17, .25, COLORS.arch);
        }
        if (p.key === selectedKey) {
            const y = h + .035;
            box(b, x, y, z - 1.10, 2.27, .04, .05, COLORS.selected);
            box(b, x, y, z + 1.10, 2.27, .04, .05, COLORS.selected);
            box(b, x - 1.1, y, z, .05, .04, 2.2, COLORS.selected);
            box(b, x + 1.1, y, z, .05, .04, 2.2, COLORS.selected);
        }
    }
    return new Float32Array(b);
}
export function unitSize(width, height, zoom) {
    return Math.min(width, height) * .118 * zoom;
}
export function iso(x, y, height = 0) {
    return [(x - y) * .72, (x + y) * .39 - height * .9];
}
export function projectParcel(x, y, cam, width, height) {
    const [a, b] = iso(x * STEP, y * STEP, .3);
    const unit = unitSize(width, height, cam.zoom);
    return [width / 2 + (a - cam.focusX) * unit, height / 2 + (b - cam.focusY) * unit];
}
export function hitParcel(px, py, cam, width, height) {
    const u = unitSize(width, height, cam.zoom);
    const a = (px - width / 2) / u + cam.focusX;
    const b = (py - height / 2) / u + cam.focusY + .27;
    const x = (a / .72 + b / .39) / 2 / STEP;
    const y = (b / .39 - a / .72) / 2 / STEP;
    return { x: Math.round(x), y: Math.round(y) };
}
export function fitOwned(s, width, height, usableHeight = height) {
    const ps = Object.values(s.parcels);
    const points = ps.map(p => iso(p.x * STEP, p.y * STEP, .3));
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const minX = Math.min(...xs) - 1.5, maxX = Math.max(...xs) + 1.5;
    const minY = Math.min(...ys) - 1.5, maxY = Math.max(...ys) + 1.5;
    const focusX = (minX + maxX) / 2, focusY = (minY + maxY) / 2;
    const base = Math.min(width, height) * .118;
    const zoom = Math.min(2.5, Math.max(.18, Math.min((width - 70) / (Math.max(.1, maxX - minX) * base), (usableHeight - 56) / (Math.max(.1, maxY - minY) * base))));
    return { focusX, focusY, zoom };
}
const VERTEX = String.raw `attribute vec3 aPos; attribute vec3 aColor;
uniform vec2 uScreen; uniform vec2 uFocus; uniform float uUnit;
varying vec3 vColor;
void main(){
 float xx=(aPos.x-aPos.z)*0.72;
 float yy=(aPos.x+aPos.z)*0.39-aPos.y*0.90;
 vec2 screen=(vec2(xx,yy)-uFocus)*uUnit;
 float depth=clamp(-(aPos.x+aPos.z)*0.015-aPos.y*0.004,-0.90,0.90);
 gl_Position=vec4(screen.x/(uScreen.x*0.5),-screen.y/(uScreen.y*0.5),depth,1.0);
 vColor=aColor;
}`;
const FRAGMENT = String.raw `precision mediump float; varying vec3 vColor;
void main(){ gl_FragColor=vec4(pow(min(vColor*1.12+vec3(.05),vec3(1.0)),vec3(.88)),1.0); }`;
function shader(gl, kind, source) {
    const s = gl.createShader(kind);
    if (!s)
        throw Error("P1_SHADER_ALLOC");
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw Error("P1_SHADER_COMPILE " + gl.getShaderInfoLog(s));
    return s;
}
export class FarmRenderer {
    canvas;
    gl;
    program;
    buffer;
    pos;
    color;
    screen;
    focus;
    unit;
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext("webgl", { alpha: false, antialias: true, preserveDrawingBuffer: true });
        if (!gl)
            throw Error("P1_WEBGL_UNAVAILABLE");
        this.gl = gl;
        const v = shader(gl, gl.VERTEX_SHADER, VERTEX), f = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
        const pr = gl.createProgram();
        if (!pr)
            throw Error("P1_PROGRAM_ALLOC");
        gl.attachShader(pr, v);
        gl.attachShader(pr, f);
        gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS))
            throw Error("P1_PROGRAM_LINK " + gl.getProgramInfoLog(pr));
        this.program = pr;
        const b = gl.createBuffer();
        if (!b)
            throw Error("P1_BUFFER_ALLOC");
        this.buffer = b;
        this.pos = gl.getAttribLocation(pr, "aPos");
        this.color = gl.getAttribLocation(pr, "aColor");
        this.screen = gl.getUniformLocation(pr, "uScreen");
        this.focus = gl.getUniformLocation(pr, "uFocus");
        this.unit = gl.getUniformLocation(pr, "uUnit");
    }
    draw(s, cam, selectedKey = null) {
        const gl = this.gl, v = buildFarmMesh(s, selectedKey);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.program);
        gl.clearColor(.08, .19, .16, 1);
        gl.clearDepth(1);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.BLEND);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.pos);
        gl.enableVertexAttribArray(this.color);
        gl.vertexAttribPointer(this.pos, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(this.color, 3, gl.FLOAT, false, 24, 12);
        gl.uniform2f(this.screen, this.canvas.width, this.canvas.height);
        gl.uniform2f(this.focus, cam.focusX, cam.focusY);
        gl.uniform1f(this.unit, unitSize(this.canvas.width, this.canvas.height, cam.zoom));
        gl.drawArrays(gl.TRIANGLES, 0, v.length / 6);
        return { triangles: v.length / 18, owned: Object.keys(s.parcels).length,
            entrances: Object.values(s.parcels).filter(x => x.entranceId).length,
            glError: gl.getError(), revision: s.revision };
    }
}
export function createFarmRenderer(canvas) { return new FarmRenderer(canvas); }
