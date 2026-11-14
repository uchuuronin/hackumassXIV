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
}
