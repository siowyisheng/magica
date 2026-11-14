/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset paths relative so the built app loads from file://
// inside Electron/Tauri when we package for Windows.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
});
