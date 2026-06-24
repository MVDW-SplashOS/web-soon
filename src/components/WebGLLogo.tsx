import { useEffect, useRef } from "react";
import { hexToRgb } from "../utils/convert";
import { fetchShader, createProgram } from "../utils/shader";

interface Props {
    logoW?: number;
    logoH?: number;
    colors?: string[];
    speed?: number;
    className?: string;
    onReady?: () => void;
}

export function WebGLLogo({
    logoW = 480,
    logoH = 460,
    colors = ["#ffffff", "#a3d4fd", "#0e79f4", "#2492fc"],
    speed = 0.7,
    className = "",
    onReady,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;

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

            // Fetch shaders from /public/shaders/
            const [vertSrc, fragSrc] = await Promise.all([
                fetchShader("/shaders/logo.vert"),
                fetchShader("/shaders/logo.frag"),
            ]);
            if (aborted) return;

            const program = createProgram(gl, vertSrc, fragSrc);

            // ── Load SVG and create mask texture ──
            const svgImage = new Image();
            svgImage.src = "/logo_mask.svg";
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
            let firstFrame = true;

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

                if (firstFrame) {
                    firstFrame = false;
                    onReadyRef.current?.();
                }

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
        init().catch(console.error);

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
