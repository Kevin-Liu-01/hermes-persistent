import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service role key.
 * All dashboard API routes use this -- RLS is bypassed because
 * we scope every query by `user_id` from the Clerk session.
 *
 * Lazily instantiated and reused across requests in the same
 * process (Vercel function instance).
 */
export function supabaseAdmin(): SupabaseClient {
	if (_admin) return _admin;

	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key =
		process.env.SUPABASE_SERVICE_ROLE_KEY ??
		process.env.SUPABASE_SECRET_KEY;

	if (!url || !key) {
		throw new Error(
			"Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY. " +
				"Add them to .env.local (see .env.local.example).",
		);
	}

	_admin = createClient(url, key, {
		auth: { persistSession: false, autoRefreshToken: false },
	});
	return _admin;
}
