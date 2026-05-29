import { AppError, Errors } from "@/lib/errors";

describe("AppError", () => {
	it("sets statusCode, message, code, and name", () => {
		const err = new AppError(418, "I'm a teapot", "TEAPOT");
		expect(err.statusCode).toBe(418);
		expect(err.message).toBe("I'm a teapot");
		expect(err.code).toBe("TEAPOT");
		expect(err.name).toBe("AppError");
		expect(err).toBeInstanceOf(Error);
	});

	it("leaves code undefined when omitted", () => {
		const err = new AppError(500, "boom");
		expect(err.code).toBeUndefined();
		expect(err.details).toBeUndefined();
	});
});

describe("Errors factories", () => {
	it("unauthorized defaults to 401 / UNAUTHORIZED", () => {
		const err = Errors.unauthorized();
		expect(err.statusCode).toBe(401);
		expect(err.code).toBe("UNAUTHORIZED");
		expect(err.message).toBe("Unauthorized");
	});

	it("forbidden defaults to 403 / FORBIDDEN", () => {
		const err = Errors.forbidden();
		expect(err.statusCode).toBe(403);
		expect(err.code).toBe("FORBIDDEN");
		expect(err.message).toBe("Forbidden");
	});

	it("notFound defaults to 404 / NOT_FOUND", () => {
		const err = Errors.notFound();
		expect(err.statusCode).toBe(404);
		expect(err.code).toBe("NOT_FOUND");
	});

	it("accepts a custom message override", () => {
		const err = Errors.unauthorized("token expired");
		expect(err.message).toBe("token expired");
		expect(err.statusCode).toBe(401);
	});

	it("badRequest is 400 / BAD_REQUEST", () => {
		const err = Errors.badRequest("missing field");
		expect(err.statusCode).toBe(400);
		expect(err.code).toBe("BAD_REQUEST");
		expect(err.message).toBe("missing field");
	});

	it("policyDenied is 403 / POLICY_DENIED", () => {
		const err = Errors.policyDenied("table blocked");
		expect(err.statusCode).toBe(403);
		expect(err.code).toBe("POLICY_DENIED");
	});

	it("valueValidationFailed attaches details", () => {
		const details = { column: "ssn", reason: "restricted" };
		const err = Errors.valueValidationFailed("bad value", details);
		expect(err.statusCode).toBe(403);
		expect(err.code).toBe("VALUE_VALIDATION_FAILED");
		expect(err.details).toEqual(details);
	});
});
