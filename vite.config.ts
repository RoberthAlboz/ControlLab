import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), jsxLocPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Bibliotecas em pacotes próprios: o navegador as mantém em cache entre versões do app.
        manualChunks: {
          react: ["react", "react-dom", "wouter"],
          data: ["@trpc/client", "@trpc/react-query", "@tanstack/react-query", "superjson", "zod"],
          motion: ["framer-motion"],
        },
      },
    },
  },
  server: { host: true, allowedHosts: ["localhost", "127.0.0.1"], fs: { strict: true, deny: ["**/.*"] } },
});
