import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the GitHub repo name for project-site Pages hosting.
export default defineConfig({
  base: '/strength-training/',
  plugins: [react()],
})
