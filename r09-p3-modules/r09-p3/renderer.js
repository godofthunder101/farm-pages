import { buildScene, perspective, viewMatrix } from "./scene.js";
const VERTEX_SHADER = [
    "attribute vec3 aPosition;",
    "attribute vec3 aNormal;",
    "attribute vec3 aColor;",
    "attribute float aMaterial;",
    "uniform mat4 uProjection;",
    "uniform mat4 uView;",
    "varying vec3 vWorld;",
    "varying vec3 vNormal;",
    "varying vec3 vColor;",
    "varying float vMaterial;",
    "void main(){",
    " vWorld=aPosition;",
    " vNormal=aNormal;",
    " vColor=aColor;",
    " vMaterial=aMaterial;",
    " gl_Position=uProjection*uView*vec4(aPosition,1.0);",
    "}"
].join("\n");
const FRAGMENT_SHADER = [
    "precision mediump float;",
    "varying vec3 vWorld;",
    "varying vec3 vNormal;",
    "varying vec3 vColor;",
    "varying float vMaterial;",
    "uniform vec3 uEye;",
    "void main(){",
    " vec3 base=vColor;",
    " if(vMaterial>0.5 && vMaterial<1.5){",
    "  float brickRow=floor(vWorld.y*3.5);",
    "  float seamX=fract((vWorld.x+vWorld.z)*2.8+mod(brickRow,2.0)*0.5);",
    "  float seamY=fract(vWorld.y*3.5);",
    "  float mortar=step(0.047,seamX)*step(0.055,seamY);",
    "  base*=mix(0.64,1.08,mortar);",
    " }else if(vMaterial<0.5){",
    "  vec2 tile=fract(vWorld.xz*2.0);",
    "  float grout=step(0.035,tile.x)*step(0.035,tile.y);",
    "  base*=mix(0.58,1.07,grout);",
    " }else if(vMaterial>1.5 && vMaterial<2.5){",
    "  base*=0.84+0.12*sin(vWorld.x*9.0+vWorld.z*8.0);",
    " }",
    " vec3 n=normalize(vNormal);",
    " float diffuse=max(0.0,dot(n,normalize(vec3(-0.46,0.88,0.40))));",
    " float dist=distance(vWorld,uEye);",
    " float lantern=1.0/(1.0+0.045*dist*dist);",
    " float brightness=0.34+0.50*diffuse+0.34*lantern;",
    " if(vMaterial>2.5)brightness+=0.22;",
    " base*=brightness;",
    " float fog=smoothstep(4.0,12.0,dist);",
    " base=mix(base,vec3(0.060,0.080,0.11),fog*0.94);",
    " gl_FragColor=vec4(base,1.0);",
    "}"
].join("\n");
function shader(gl, kind, source) {
    const result = gl.createShader(kind);
    if (!result)
        throw new Error("WEBGL_SHADER_ALLOC_FAILED");
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
        const reason = gl.getShaderInfoLog(result) ?? "unknown";
        gl.deleteShader(result);
        throw new Error("WEBGL_SHADER_COMPILE_FAILED: " + reason);
    }
    return result;
}
function program(gl) {
    const vs = shader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const result = gl.createProgram();
    if (!result) {
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        throw new Error("WEBGL_PROGRAM_ALLOC_FAILED");
    }
    gl.attachShader(result, vs);
    gl.attachShader(result, fs);
    gl.linkProgram(result);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) {
        const reason = gl.getProgramInfoLog(result) ?? "unknown";
        gl.deleteProgram(result);
        throw new Error("WEBGL_PROGRAM_LINK_FAILED: " + reason);
    }
    return result;
}
export class DungeonWebGL {
    gl;
    canvas;
    shaderProgram;
    buffer;
    attrs;
    uniforms;
    lost = false;
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext("webgl", { alpha: false, antialias: true, depth: true,
            stencil: false, preserveDrawingBuffer: false });
        if (!gl)
            throw new Error("WEBGL_UNAVAILABLE — Use the accepted R09-P2 schematic fallback.");
        this.gl = gl;
        const shaderProgram = program(gl);
        this.shaderProgram = shaderProgram;
        const buffer = gl.createBuffer();
        if (!buffer) {
            gl.deleteProgram(shaderProgram);
            throw new Error("WEBGL_BUFFER_ALLOC_FAILED");
        }
        this.buffer = buffer;
        const location = (name) => {
            const l = gl.getUniformLocation(shaderProgram, name);
            if (l === null)
                throw new Error("WEBGL_UNIFORM_MISSING: " + name);
            return l;
        };
        this.attrs = {
            position: gl.getAttribLocation(shaderProgram, "aPosition"),
            normal: gl.getAttribLocation(shaderProgram, "aNormal"),
            color: gl.getAttribLocation(shaderProgram, "aColor"),
            material: gl.getAttribLocation(shaderProgram, "aMaterial")
        };
        if (Object.values(this.attrs).some(v => v < 0))
            throw new Error("WEBGL_ATTRIBUTE_MISSING");
        this.uniforms = { projection: location("uProjection"), view: location("uView"), eye: location("uEye") };
        canvas.addEventListener("webglcontextlost", event => {
            event.preventDefault();
            this.lost = true;
        });
        canvas.addEventListener("webglcontextrestored", () => { this.lost = false; });
    }
    render(state) {
        const gl = this.gl, scene = buildScene(state);
        const cssWidth = Math.max(1, Math.floor(this.canvas.clientWidth || this.canvas.width || 480));
        const cssHeight = Math.max(1, Math.floor(this.canvas.clientHeight || cssWidth * 0.67));
        const dpi = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const width = Math.min(1800, Math.round(cssWidth * dpi));
        const height = Math.min(1100, Math.round(cssHeight * dpi));
        if (this.canvas.width !== width)
            this.canvas.width = width;
        if (this.canvas.height !== height)
            this.canvas.height = height;
        if (this.lost)
            throw new Error("WEBGL_CONTEXT_LOST");
        gl.viewport(0, 0, width, height);
        gl.clearColor(0.06, 0.08, 0.12, 1);
        gl.clearDepth(1);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.disable(gl.CULL_FACE);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (scene.pose && scene.mesh.vertices.length) {
            const p = scene.pose, mesh = scene.mesh;
            gl.useProgram(this.shaderProgram);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
            gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.DYNAMIC_DRAW);
            const stride = 10 * Float32Array.BYTES_PER_ELEMENT;
            const attr = (slot, size, offset) => {
                gl.enableVertexAttribArray(slot);
                gl.vertexAttribPointer(slot, size, gl.FLOAT, false, stride, offset * 4);
            };
            attr(this.attrs.position, 3, 0);
            attr(this.attrs.normal, 3, 3);
            attr(this.attrs.color, 3, 6);
            attr(this.attrs.material, 1, 9);
            gl.uniformMatrix4fv(this.uniforms.projection, false, perspective(73, width / height, 0.055, 22));
            gl.uniformMatrix4fv(this.uniforms.view, false, viewMatrix(p));
            gl.uniform3f(this.uniforms.eye, p.eye[0], p.eye[1], p.eye[2]);
            gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / mesh.stride);
        }
        const err = gl.getError();
        if (err !== gl.NO_ERROR)
            throw new Error("WEBGL_RUNTIME_ERROR: " + err);
        return { revision: state.revision, mode: state.mode, triangles: scene.mesh.triangles,
            walls: scene.mesh.stats.walls, chest: scene.mesh.stats.chest,
            enemy: scene.mesh.stats.enemy, facing: scene.pose?.facing ?? null, glError: err,
            viewport: [width, height] };
    }
    dispose() {
        this.gl.deleteBuffer(this.buffer);
        this.gl.deleteProgram(this.shaderProgram);
    }
}
export function createRenderer(canvas) {
    return new DungeonWebGL(canvas);
}
export const SHADERS = Object.freeze({ vertex: VERTEX_SHADER, fragment: FRAGMENT_SHADER });
