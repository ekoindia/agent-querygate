import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./drizzle/migrations",
	dialect: "mysql",
	dbCredentials: {
		host: process.env.ADMIN_DB_HOST ?? "localhost",
		port: Number(process.env.ADMIN_DB_PORT ?? 3306),
		user: process.env.ADMIN_DB_USER ?? "root",
		password: process.env.ADMIN_DB_PASSWORD ?? "",
		database: process.env.ADMIN_DB_NAME ?? "querygate_admin",
	},
});
