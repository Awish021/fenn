var _a;
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    server: {
        host: "0.0.0.0",
        port: 3000,
        allowedHosts: true,
        proxy: {
            "/api": {
                target: (_a = process.env.VITE_PROXY_TARGET) !== null && _a !== void 0 ? _a : "http://localhost:8000",
                rewrite: function (path) { return path.replace(/^\/api/, ""); },
            },
        },
    },
});
