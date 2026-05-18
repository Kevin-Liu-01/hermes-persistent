import { auth } from "@clerk/nextjs/server";

/**
 * Auth identity resolver for the dashboard.
 *
 * Production: every request comes from a Clerk-authenticated user.
 * `getEffectiveUserId()` returns the Clerk `userId`.
 *
 * Local development: when `ALLOW_DEV_AUTH=1` and `NODE_ENV=development`,
 * unauthenticated requests resolve to a stable `DEV_USER_ID`. The
 * file-backed dev store (`./dev-store.ts`) treats that id as a single
 * local user, so the dashboard, chat, machine lifecycle, and config
 * mutations all work end-to-end without anyone signing in.
 *
 * The bypass is opt-in to prevent accidentally shipping it: `NODE_ENV
 * !== 'development'` or missing `ALLOW_DEV_AUTH` and the helper falls
 * straight through to the Clerk path with no fallback.
 */

export const DEV_USER_ID = "dev-user";

/**
 * True when the local dev auth bypass is opt-in via env. Both the
 * `NODE_ENV=development` AND `ALLOW_DEV_AUTH=1` checks must pass --
 * we never want this active on a Vercel preview/production deploy.
 */
export function isDevBypassEnabled(): boolean {
	return (
		process.env.NODE_ENV === "development" &&
		process.env.ALLOW_DEV_AUTH === "1"
	);
}

/**
 * Resolve the effective user id for the current request.
 *
 * - Returns the Clerk `userId` when the user is signed in.
 * - Returns `DEV_USER_ID` when dev bypass is enabled and no one is
 *   signed in.
 * - Returns `null` otherwise; callers should respond with 401.
 *
 * Never throws -- callers rely on `null` to mean "unauthenticated"
 * and return 401 themselves. Throwing here would crash the entire
 * route handler, producing a Vercel 502 instead of a clean 401.
 */
export async function getEffectiveUserId(): Promise<string | null> {
	try {
		const { userId } = await auth();
		if (userId) return userId;
	} catch {
		// auth() can throw when Clerk middleware never ran (env unset)
		// or on transient Clerk SDK errors. Return null so the route
		// handler responds 401 instead of crashing with a 502.
	}
	return isDevBypassEnabled() ? DEV_USER_ID : null;
}

/**
 * True iff the given user id is the local dev fallback identity.
 * Used by the user-config layer to route reads/writes to the
 * file-backed dev store instead of the Clerk metadata store.
 */
export function isDevUserId(userId: string | null | undefined): boolean {
	return userId === DEV_USER_ID;
}
