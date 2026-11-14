import { SHADERS } from "../r09-p3/renderer.js";
import { buildFarmMesh, farmOrtho, farmViewMatrix, FARM_EYE } from "./farm-scene.js";
function compile(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader)
        throw Error("FARM_WEBGL_SHADER_ALLOC");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const err = gl.getShaderInfoLog(shader) ?? "unknown";
        gl.deleteShader(shader);
        throw Error("FARM_WEBGL_SHADER_COMPILE: " + err);
    }
    return shader;
}
function createProgram(gl) {
    const v = compile(gl, gl.VERTEX_SHADER, SHADERS.vertex);
    const f = compile(gl, gl.FRAGMENT_SHADER, SHADERS.fragment);
    const prog = gl.createProgram();
    if (!prog)
        throw Error("FARM_WEBGL_PROGRAM_ALLOC");
    gl.attachShader(prog, v);
    gl.attachShader(prog, f);
    gl.linkProgram(prog);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        const reason = gl.getProgramInfoLog(prog) ?? "unknown";
        gl.deleteProgram(prog);
        throw Error("FARM_WEBGL_LINK: " + reason);
    }
    return prog;
}
export class FarmWebGL {
    canvas;
    gl;
    program;
    buffer;
    attribute;
    uniform;
    lost = false;
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext("webgl", { alpha: false, antialias: true, depth: true,
            stencil: false, preserveDrawingBuffer: false });
        if (!gl)
            throw Error("FARM_WEBGL_UNAVAILABLE");
        this.gl = gl;
        this.program = createProgram(gl);
        const buffer = gl.createBuffer();
        if (!buffer)
            throw Error("FARM_WEBGL_BUFFER_ALLOC");
        this.buffer = buffer;
        const attr = (name) => {
            const i = gl.getAttribLocation(this.program, name);
            if (i < 0)
                throw Error("FARM_WEBGL_ATTRIBUTE_MISSING: " + name);
            return i;
        };
        const uni = (name) => {
            const u = gl.getUniformLocation(this.program, name);
            if (u === null)
                throw Error("FARM_WEBGL_UNIFORM_MISSING: " + name);
            return u;
        };
        this.attribute = { position: attr("aPosition"), normal: attr("aNormal"),
            color: attr("aColor"), material: attr("aMaterial") };
        this.uniform = { projection: uni("uProjection"), view: uni("uView"), eye: uni("uEye") };
        canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); this.lost = true; });
        canvas.addEventListener("webglcontextrestored", () => { this.lost = false; });
    }
    render(state) {
        if (state.mode !== "farm")
            throw Error("FARM_VIEW_REQUIRES_FARM_MODE");
        const gl = this.gl;
        if (this.lost)
            throw Error("FARM_WEBGL_CONTEXT_LOST");
        const cssW = Math.max(1, Math.floor(this.canvas.clientWidth || this.canvas.width || 480));
        const cssH = Math.max(1, Math.floor(this.canvas.clientHeight || this.canvas.height || 300));
        const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const width = Math.min(1800, Math.round(cssW * scale));
        const height = Math.min(1100, Math.round(cssH * scale));
        if (this.canvas.width !== width)
            this.canvas.width = width;
        if (this.canvas.height !== height)
            this.canvas.height = height;
        const mesh = buildFarmMesh(state);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0.10, 0.15, 0.19, 1);
        gl.clearDepth(1);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.DYNAMIC_DRAW);
        const stride = 10 * 4;
        const vertex = (slot, count, offset) => {
            gl.enableVertexAttribArray(slot);
            gl.vertexAttribPointer(slot, count, gl.FLOAT, false, stride, offset * 4);
        };
        vertex(this.attribute.position, 3, 0);
        vertex(this.attribute.normal, 3, 3);
        vertex(this.attribute.color, 3, 6);
        vertex(this.attribute.material, 1, 9);
        gl.uniformMatrix4fv(this.uniform.projection, false, farmOrtho(width / height));
        gl.uniformMatrix4fv(this.uniform.view, false, farmViewMatrix());
        gl.uniform3f(this.uniform.eye, ...FARM_EYE);
        gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 10);
        const err = gl.getError();
        if (err !== gl.NO_ERROR)
            throw Error("FARM_WEBGL_ERROR: " + err);
        return { renderer: "farm-webgl1", revision: state.revision, triangles: mesh.triangles,
            faces: mesh.faces, owned: mesh.owned, unowned: mesh.unowned,
            readyPlots: mesh.readyPlots, harvestedPlots: mesh.harvestedPlots,
            entrances: mesh.entrances, gold: mesh.gold, glError: err, viewport: [width, height] };
    }
    dispose() {
        this.gl.deleteBuffer(this.buffer);
        this.gl.deleteProgram(this.program);
    }
}
export function createFarmRenderer(canvas) {
    return new FarmWebGL(canvas);
}
