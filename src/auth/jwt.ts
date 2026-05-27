import jwt, { type SignOptions } from "jsonwebtoken";
import type { UserRole } from "@/lib/types";

/** Payload embedded in JWTs issued by this service. */
export interface JwtPayload {
	userId: string;
	email: string;
	role: UserRole;
}

/**
 * Signs a JWT containing the given payload.
 * @param payload - The user identity claims to embed.
 * @param secret - The signing secret.
 * @param expiresIn - Token lifetime (default "24h").
 * @returns The signed JWT string.
 */
export function signJwt(
	payload: JwtPayload,
	secret: string,
	expiresIn: string = "24h",
): string {
	const options: SignOptions = { expiresIn: expiresIn as SignOptions["expiresIn"] };
	return jwt.sign(payload, secret, options);
}

/**
 * Verifies a JWT and returns the decoded payload.
 * @param token - The JWT string to verify.
 * @param secret - The signing secret used when the token was created.
 * @returns The decoded JwtPayload.
 * @throws If the token is invalid or expired.
 */
export function verifyJwt(token: string, secret: string): JwtPayload {
	const decoded = jwt.verify(token, secret) as jwt.JwtPayload & JwtPayload;
	return {
		userId: decoded.userId,
		email: decoded.email,
		role: decoded.role,
	};
}
