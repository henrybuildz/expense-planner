import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages cannot send security headers, so production builds embed the Content-Security-Policy as a
// <meta> tag instead (nginx sends the same policy as a real header). This limits what injected script
// could do, which matters because the Supabase login token lives in the browser's storage.
// Not possible via <meta>: frame-ancestors (clickjacking protection) - only a real header can set that.
function contentSecurityPolicy(supabaseUrl) {
  let supabaseOrigin = '';
  try {
    supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : '';
  } catch {
    /* ignore a malformed value: the policy then simply allows no extra origin */
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // React inline style="" attributes
    "img-src 'self' data:",
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`, // only YOUR Supabase project
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

// base './' keeps every asset URL relative, so the build works from any
// static host path (root, sub-folder, nginx container, file share).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: './',
    plugins: [
      react(),
      {
        name: 'csp-meta',
        apply: 'build', // never in `npm run dev`: Vite's dev server needs inline scripts
        transformIndexHtml: (html) =>
          html.replace(
            /<meta charset="UTF-8" \/>/,
            `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(env.VITE_SUPABASE_URL)}" />`
          ),
      },
    ],
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
    // Unit and component tests (npm test). jsdom gives them a browser-like page and a real localStorage.
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.js'],
      include: ['tests/**/*.test.{js,jsx}'],
      // Tests must NEVER reach a real Supabase project, whatever is in .env.local.
      env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{js,jsx}'],
        exclude: ['src/main.jsx'],
        reporter: ['text', 'html'],
      },
    },
  };
});
