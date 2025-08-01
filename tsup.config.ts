import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  target: 'es2020',
  external: [],
  noExternal: ['ulid'],
  platform: 'neutral',
  splitting: false,
  keepNames: true,
  globalName: 'GlobalLeaderboards',
})