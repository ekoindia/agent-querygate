import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["tests/**/*.test.ts"],
		setupFiles: ["tests/setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov", "json-summary"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/db/migrate.ts"],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
