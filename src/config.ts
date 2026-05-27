import { z } from "zod";

const configSchema = z.object({
	adminDb: z.object({
		host: z.string().default("localhost"),
		port: z.coerce.number().default(3306),
		name: z.string().default("querygate_admin"),
		user: z.string().default("root"),
		password: z.string().default(""),
	}),
	jwtSecret: z.string().min(16),
	encryptionKey: z.string().min(32),
	port: z.coerce.number().default(3000),
	nodeEnv: z.enum(["development", "production", "test"]).default("development"),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Loads and validates configuration from environment variables.
 * Throws a ZodError if required values are missing or invalid.
 */
export function loadConfig(): Config {
	return configSchema.parse({
		adminDb: {
			host: process.env.ADMIN_DB_HOST,
			port: process.env.ADMIN_DB_PORT,
			name: process.env.ADMIN_DB_NAME,
			user: process.env.ADMIN_DB_USER,
			password: process.env.ADMIN_DB_PASSWORD,
		},
		jwtSecret: process.env.JWT_SECRET,
		encryptionKey: process.env.ENCRYPTION_KEY,
		port: process.env.PORT,
		nodeEnv: process.env.NODE_ENV,
	});
}
