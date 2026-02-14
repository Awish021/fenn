var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var _a;
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    retries: 0,
    timeout: 45000,
    use: {
        baseURL: (_a = process.env.PLAYWRIGHT_BASE_URL) !== null && _a !== void 0 ? _a : "http://localhost:3000",
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: __assign({}, devices["Desktop Chrome"]),
        },
        {
            name: "mobile-chromium",
            use: __assign({}, devices["Pixel 5"]),
        },
    ],
});
