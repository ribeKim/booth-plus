import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE_PATH || (command === "serve" ? "/" : "/admin/"),
  plugins: [react()],
  server: { port: 5173 },
}));
