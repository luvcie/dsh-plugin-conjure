import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/client/index.tsx'],
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  tsconfig: 'tsconfig.client.json',
  outDir: '.client-build',
  clean: true,
  sourcemap: true,
  env: { NODE_ENV: 'production' },
  // react must stay external: a bundled copy crashes hooks with a null dispatcher
  external: [/^react(\/|$)/, /^react-dom(\/|$)/],
})
