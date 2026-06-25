import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import glsl from "vite-plugin-glsl";

function minifyGLSL(src: string): string {
    return (
        src
            // Strip // comments
            .replace(/\/\/.*$/gm, "")
            // Strip /* */ comments
            .replace(/\/\*[\s\S]*?\*\//g, "")
            // Collapse all whitespace to single space
            .replace(/\s+/g, " ")
            // Remove spaces around structural punctuation
            .replace(/\s*([{}();,])\s*/g, "$1")
            .trim()
    );
}

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        babel({ presets: [reactCompilerPreset()] }),
        glsl({
            // @ts-expect-error types are stale — minify accepts a callback at runtime
            minify: minifyGLSL,
        }),
    ],
});
