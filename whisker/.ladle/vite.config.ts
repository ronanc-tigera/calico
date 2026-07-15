import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Ladle resolves `@/…` imports inside `src` via vite-tsconfig-paths (driven by
// tsconfig's `include`), but the .ladle/ setup files live outside that include.
// Declare the same aliases explicitly so provider/decorator files and any
// story outside `src` resolve `@/…` the way the rsbuild app does.
// Order matters: the more specific `@/test-utils` prefix must come first.
export default defineConfig({
    // The rsbuild app injects `process.env.APP_*` values at build time via
    // rsbuild's `define` (see rsbuild.config.ts). Ladle's Vite doesn't, so any
    // source that reads `process.env.*` (e.g. src/api/index.ts) throws
    // "process is not defined" in the browser. Shim `process.env` to an empty
    // object so those reads resolve to `undefined` instead of crashing.
    define: {
        'process.env': '{}',
    },
    resolve: {
        alias: {
            '@/test-utils': fileURLToPath(
                new URL('../test-utils', import.meta.url),
            ),
            '@': fileURLToPath(new URL('../src', import.meta.url)),
        },
    },
});
