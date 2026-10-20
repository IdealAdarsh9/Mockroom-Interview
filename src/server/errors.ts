export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const badRequest = (msg: string, code = "bad_request", details?: unknown) => new AppError(400, code, msg, details);
export const unauthorized = (msg = "Sign in to continue.") => new AppError(401, "unauthorized", msg);
export const forbidden = (msg = "You do not have access to this resource.") => new AppError(403, "forbidden", msg);
// Ownership failures deliberately look identical to "does not exist" so IDs cannot be probed.
export const notFound = (msg = "Not found.") => new AppError(404, "not_found", msg);
export const conflict = (msg: string, code = "conflict") => new AppError(409, code, msg);
export const tooMany = (retryAfterSec: number) =>
  new AppError(429, "rate_limited", `Too many requests. Try again in ${retryAfterSec}s.`, { retryAfterSec });
