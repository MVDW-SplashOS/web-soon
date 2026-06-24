import { useEffect, useRef } from "react";

const hexToRgb = (hex: string): [number, number, number] => {
    const value = hex.replace("#", "");
    return [
        parseInt(value.substring(0, 2), 16) / 255,
        parseInt(value.substring(2, 4), 16) / 255,
        parseInt(value.substring(4, 6), 16) / 255,
    ];
};

// ── WebGL Shaders ─────────────────────────────────────
const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
    v_uv = a_uv;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 v_uv;

uniform sampler2D u_mask;
uniform float u_time;
uniform float u_speed;
uniform vec2 u_resolution;
uniform int u_colorCount;
uniform vec3 u_colors[8];

vec3 colorAtIndex(int idx) {
    for (int i = 0; i < 8; i++) {
        if (i == idx) return u_colors[i];
    }
    return u_colors[0];
}

vec3 gradientColor(float t) {
    if (u_colorCount <= 1) return u_colors[0];
    float scaled = t * float(u_colorCount - 1);
    int idx = int(floor(scaled));
    float frac = fract(scaled);
    int nextIdx = idx + 1;
    if (nextIdx >= u_colorCount) nextIdx = u_colorCount - 1;
    return mix(colorAtIndex(idx), colorAtIndex(nextIdx), frac);
}

// ── 3D Noise — time as third dimension for stationary animation ──
float hash31(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(
            mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), u.x),
            mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), u.x),
            u.y
        ),
        mix(
            mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), u.x),
            mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), u.x),
            u.y
        ),
        u.z
    );
}

float fbm3D(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    float frequency = 1.0;
    for (int i = 0; i < 3; i++) {
        value += amplitude * noise3D(p * frequency);
        frequency *= 1.7;
        amplitude *= 0.5;
    }
    return value;
}

// Keep a fast 2D FBM for static flow warp
float fbm2D(vec2 p) {
    return fbm3D(vec3(p, 0.0));
}

void main() {
    vec2 uv = v_uv;
    float time = u_time * u_speed;

    // Static flow warp — gives each blob its organic shape
    vec2 flow = vec2(
        fbm2D(uv * 1.2 + 0.7),
        fbm2D(uv * 1.2 + 1.8)
    );
    vec2 warped = uv + (flow - 0.5) * 0.18;

    // 3D noise — time as Z axis makes noise evolve in place
    float field = fbm3D(vec3(warped * 1.5, time * 0.12));

    // Detail cutter — multiplicative to keep distribution centered
    float detail = fbm3D(vec3(warped * 4.5 + 2.3, time * 0.18));
    float cutter = 1.0 - detail * 0.55;
    field = field * cutter;

    // Stretch distribution so every color band gets equal screen time
    field = (field - 0.2) * 2.0 + 0.5;
    field = clamp(field, 0.0, 1.0);

    // Quantize with anti-aliasing — soft blend at boundaries only
    float levels = max(float(u_colorCount - 1), 1.0);
    float scaled = field * levels;
    float aa = 2.0 / u_resolution.y;  // ~2px anti-alias width

    float hard = floor(scaled + 0.5) / levels;          // crisp color
    float soft = scaled / levels;                        // smooth gradient
    float dist_to_step = abs(fract(scaled + 0.5) - 0.5); // distance from boundary
    float t = smoothstep(0.0, aa, dist_to_step);         // 0 at boundary, 1 in flats
    field = mix(soft, hard, t);

    vec3 color = gradientColor(field);

    // Subtle highlight that also evolves in place
    float highlight = fbm3D(vec3(warped * 2.5, time * 0.15 + 0.5));
    color += highlight * 0.08;

    color = clamp(color, 0.0, 1.0);

    // Sample mask — canvas 2D already anti-aliases the path
    float alpha = texture2D(u_mask, vec2(uv.x, 1.0 - uv.y)).a;
    gl_FragColor = vec4(color * alpha, alpha);
    }
    `;

// ── Helpers ───────────────────────────────────────────
function createShader(gl: WebGLRenderingContext, type: number, src: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
}

function createProgram(
    gl: WebGLRenderingContext,
    vs: string,
    fs: string,
): WebGLProgram | null {
    const v = createShader(gl, gl.VERTEX_SHADER, vs);
    const f = createShader(gl, gl.FRAGMENT_SHADER, fs);
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

// ── Component ─────────────────────────────────────────
interface Props {
    /** Logo viewbox width */
    logoW?: number;
    /** Logo viewbox height */
    logoH?: number;
    /** Colors for the gradient palette */
    colors?: string[];
    /** Animation speed multiplier */
    speed?: number;
    /** CSS class for the canvas wrapper */
    className?: string;
}

export function WebGLLogo({
    logoW = 480,
    logoH = 460,
    colors = ["#87CEEB", "#ADD8E6", "#80DEEA", "#4DD0E1", "#26C6DA"],
    speed = 0.7,
    className = "",
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let aborted = false;

        const init = async () => {
            const dpr = window.devicePixelRatio || 1;
            const W = logoW;
            const H = logoH;

            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width = `${W}px`;
            canvas.style.height = `${H}px`;

            const gl = canvas.getContext("webgl", {
                alpha: true,
                antialias: true,
                premultipliedAlpha: true,
            });
            if (!gl) return;

            const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
            if (!program) return;

            // ── Load SVG and create mask texture ──
            const svgImage = new Image();
            svgImage.src = "/splashos_mask.svg";
            await svgImage.decode();
            if (aborted) return;

            const maskCanvas = document.createElement("canvas");
            maskCanvas.width = Math.round(W * dpr);
            maskCanvas.height = Math.round(H * dpr);
            const mCtx = maskCanvas.getContext("2d")!;
            mCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Draw SVG at full logo size
            mCtx.drawImage(svgImage, 0, 0, W, H);

            // Convert all colored pixels to white mask (preserves alpha)
            mCtx.globalCompositeOperation = "source-in";
            mCtx.fillStyle = "white";
            mCtx.fillRect(0, 0, W, H);

            const maskTexture = gl.createTexture()!;
            gl.bindTexture(gl.TEXTURE_2D, maskTexture);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_WRAP_S,
                gl.CLAMP_TO_EDGE,
            );
            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_WRAP_T,
                gl.CLAMP_TO_EDGE,
            );
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGBA,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                maskCanvas,
            );

            // ── Setup geometry ──
            const buf = gl.createBuffer()!;
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([
                    -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1,
                ]),
                gl.STATIC_DRAW,
            );

            const posLoc = gl.getAttribLocation(program, "a_position");
            const uvLoc = gl.getAttribLocation(program, "a_uv");
            const stride = 4 * 4;
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
            gl.enableVertexAttribArray(uvLoc);
            gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, stride, 8);

            // ── Uniforms ──
            const uTime = gl.getUniformLocation(program, "u_time")!;
            const uSpeed = gl.getUniformLocation(program, "u_speed")!;
            const uRes = gl.getUniformLocation(program, "u_resolution")!;
            const uColorCount = gl.getUniformLocation(program, "u_colorCount")!;
            const uColors = gl.getUniformLocation(program, "u_colors[0]")!;
            const uMask = gl.getUniformLocation(program, "u_mask")!;

            // Build palette uniform (8 slots × 3 floats)
            const paletteData = new Float32Array(24);
            for (let i = 0; i < 8; i++) {
                const c = colors[Math.min(i, colors.length - 1)];
                const [r, g, b] = hexToRgb(c);
                paletteData[i * 3] = r;
                paletteData[i * 3 + 1] = g;
                paletteData[i * 3 + 2] = b;
            }

            gl.useProgram(program);
            gl.uniform1i(uMask, 0);
            gl.uniform2f(uRes, W, H);
            gl.uniform1i(uColorCount, Math.min(colors.length, 8));
            gl.uniform3fv(uColors, paletteData);
            gl.uniform1f(uSpeed, Math.max(speed, 0.1));

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

            // ── Render loop ──
            let start = performance.now();
            let animId = 0;

            const render = (now: number) => {
                const elapsed = (now - start) * 0.001;
                gl.viewport(0, 0, canvas.width, canvas.height);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);

                gl.useProgram(program);
                gl.uniform1f(uTime, elapsed);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, maskTexture);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                animId = requestAnimationFrame(render);
            };

            animId = requestAnimationFrame(render);

            // Store cleanup so the effect teardown can call it
            teardown = () => {
                cancelAnimationFrame(animId);
                gl.deleteTexture(maskTexture);
                gl.deleteBuffer(buf);
                gl.deleteProgram(program);
            };
        };

        let teardown: (() => void) | null = null;
        init().catch(() => {});

        return () => {
            aborted = true;
            teardown?.();
        };
    }, [logoW, logoH, colors, speed]);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            style={{
                display: "block",
                width: "100%",
                height: "auto",
                aspectRatio: `${logoW} / ${logoH}`,
            }}
        />
    );
}
