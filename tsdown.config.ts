import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    create: 'src/create.ts',
    index: 'src/index.ts',
  },
  exports: true,
})
