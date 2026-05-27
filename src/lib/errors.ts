/**
 * Application-level error with HTTP status code and machine-readable code.
 */
export class AppError extends Error {
	constructor(
		public statusCode: number,
		message: string,
		public code?: string,
	) {
		super(message);
		this.name = "AppError";
	}
}

/** Factory functions for common application errors. */
export const Errors = {
	unauthorized: (msg = "Unauthorized") => new AppError(401, msg, "UNAUTHORIZED"),
	forbidden: (msg = "Forbidden") => new AppError(403, msg, "FORBIDDEN"),
	notFound: (msg = "Not found") => new AppError(404, msg, "NOT_FOUND"),
	badRequest: (msg: string) => new AppError(400, msg, "BAD_REQUEST"),
	policyDenied: (msg: string) => new AppError(403, msg, "POLICY_DENIED"),
} as const;
