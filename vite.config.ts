import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
    optimizeDeps: {
        // Pre-bundle everything the client graph reaches so the dev server
        // never discovers a dependency mid-session. Late discovery
        // re-optimizes with a new hash and full-reloads the page, which can
        // leave two React copies in one module graph ("Invalid hook call"
        // crashes in Turnstile/FieldControl during dev and E2E runs).
        include: [
            'react',
            'react-dom',
            'react-hook-form',
            '@hookform/resolvers/zod',
            'better-auth/client',
            'better-auth/client/plugins',
            'class-variance-authority',
            'clsx',
            'tailwind-merge',
            'lucide-react',
            '@ai-sdk/react',
            'react-markdown',
            'zod',
            'tiny-invariant',
            '@base-ui/react/alert-dialog',
            '@base-ui/react/dialog',
            '@base-ui/react/field',
            '@base-ui/react/fieldset',
            '@base-ui/react/input',
            '@base-ui/react/menu',
            '@base-ui/react/merge-props',
            '@base-ui/react/scroll-area',
            '@base-ui/react/select',
            '@base-ui/react/separator',
            '@base-ui/react/toast',
            '@base-ui/react/use-render',
        ],
    },
});
