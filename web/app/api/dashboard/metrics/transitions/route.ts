import { type NextRequest } from "next/server";

import { getEffectiveUserId } from "@/lib/user-config/identity";
import { supabaseAdmin } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
	const userId = await getEffectiveUserId();
	if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });

	const sp = request.nextUrl.searchParams;
	const machineId = sp.get("machine_id");
	const limit = Math.min(
		MAX_LIMIT,
		Math.max(1, Number(sp.get("limit") ?? DEFAULT_LIMIT)),
	);
	const offset = Math.max(0, Number(sp.get("offset") ?? 0));

	const sb = supabaseAdmin();

	let query = sb
		.from("machine_transitions")
		.select("*", { count: "exact" })
		.eq("user_id", userId)
		.order("occurred_at", { ascending: false })
		.range(offset, offset + limit - 1);

	if (machineId) {
		query = query.eq("machine_id", machineId);
	}

	const { data, error, count } = await query;

	if (error) {
		return Response.json({ ok: false, error: error.message }, { status: 502 });
	}

	return Response.json({
		ok: true,
		transitions: data ?? [],
		total: count ?? 0,
	});
}
