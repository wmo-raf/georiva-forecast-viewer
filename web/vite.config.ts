import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

// The bundle ships inside the plugin and is served by nginx from the static
// volume, so its public base is the collected static path and its output
// lands in the plugin's package (see README). In dev, Vite proxies GeoRiva's
// routes to the local stack under one organisation's host, since every
// route resolves the organisation from the Host header.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const host = env.VITE_GEORIVA_HOST || "127.0.0.1.sslip.io";
  const target = env.VITE_GEORIVA_TARGET || "http://127.0.0.1";
  const proxy = { target, changeOrigin: false, headers: { host } };
  return {
    plugins: [vue()],
    base: "/static/forecast_viewer/",
    build: {
      outDir: "../src/georiva_forecast_viewer/static/forecast_viewer",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: { "/api": proxy, "/titiler": proxy },
    },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
