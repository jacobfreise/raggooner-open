import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
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
      }
    }
  }
})
