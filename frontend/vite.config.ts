import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'scripts/',
        'src/firebase.ts',
        '**/*.test.ts',
        '**/*.d.ts'
      ]
    }
  },
  build: {
    chunkSizeWarningLimit: 1000, // Set limit to 1000kB (1MB)
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Put all node_modules (Firebase, Vue, Phosphor) into a 'vendor' chunk
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      },
      external: [
        './src/components/Migrate.vue'
      ]
    }
  }
})
