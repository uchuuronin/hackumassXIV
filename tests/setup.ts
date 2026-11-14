// Bundles the page map into one file the tests can inject into any page.
import { build } from 'esbuild';

export default async function setup() {
  await build({
    entryPoints: ['tests/inject.ts'],
    bundle: true,
    format: 'iife',
    alias: { '@': './src' },
    outfile: 'tests/.tmp/pagemap.js',
    logLevel: 'warning',
  });
  // The panel pieces, with React, for the tests that mount them.
  await build({
    entryPoints: ['tests/inject-panel.tsx'],
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    alias: { '@': './src' },
    define: { 'process.env.NODE_ENV': '"production"' },
    outfile: 'sites/.tmp-panel.js',
    logLevel: 'warning',
  });
}
