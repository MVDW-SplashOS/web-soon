export async function fetchShader(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Failed to load shader: ${url} (${res.status})`);
    return res.text();
}

export function createShader(
    gl: WebGLRenderingContext,
    type: number,
    src: string,
) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        const kind = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
        gl.deleteShader(shader);
        throw new Error(`${kind} shader compile error:\n${log}`);
    }

    return shader;
}

export function createProgram(
    gl: WebGLRenderingContext,
    vs: string,
    fs: string,
): WebGLProgram {
    const v = createShader(gl, gl.VERTEX_SHADER, vs);
    const f = createShader(gl, gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);

    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(p);
        gl.deleteProgram(p);
        gl.deleteShader(v);
        gl.deleteShader(f);
        throw new Error(`Program link error:\n${log}`);
    }

    gl.deleteShader(v);
    gl.deleteShader(f);
    return p;
}
