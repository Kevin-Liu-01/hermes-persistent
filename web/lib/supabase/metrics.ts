import { supabaseAdmin } from "./client";

export type MetricRow = {
	id: number;
	user_id: string;
	machine_id: string;
	recorded_at: string;
	cpu_percent: number | null;
	memory_used_mib: number | null;
	memory_total_mib: number | null;
	storage_used_gib: number | null;
	storage_total_gib: number | null;
	load_avg_1m: number | null;
	phase: string;
	vcpu: number;
	spec_memory_mib: number;
};

export type TransitionRow = {
	id: number;
	user_id: string;
	machine_id: string;
	occurred_at: string;
	from_phase: string | null;
	to_phase: string;
	reason: string | null;
	machine_name: string | null;
};

export type UsageDailyRow = {
	id: number;
	user_id: string;
	machine_id: string;
	bucket_date: string;
	awake_seconds: number;
	cpu_vcpu_seconds: number;
	memory_gib_seconds: number;
	storage_gib_hours: number;
	sample_count: number;
	vcpu: number;
	spec_memory_mib: number;
	spec_storage_gib: number;
};

export type CostRow = {
	id: number;
	user_id: string;
	machine_id: string;
	bucket_date: string;
	cpu_cost_millicents: number;
	memory_cost_millicents: number;
	storage_cost_millicents: number;
	total_cost_millicents: number;
};

export async function insertMetrics(rows: Omit<MetricRow, "id">[]): Promise<void> {
	if (rows.length === 0) return;
	const sb = supabaseAdmin();
	const { error } = await sb.from("machine_metrics").insert(rows);
	if (error) throw new Error(`insertMetrics: ${error.message}`);
}

export async function insertTransitions(rows: Omit<TransitionRow, "id">[]): Promise<void> {
	if (rows.length === 0) return;
	const sb = supabaseAdmin();
	const { error } = await sb.from("machine_transitions").insert(rows);
	if (error) throw new Error(`insertTransitions: ${error.message}`);
}

export async function upsertDailyUsage(row: Omit<UsageDailyRow, "id">): Promise<void> {
	const sb = supabaseAdmin();

	const { data: existing } = await sb
		.from("machine_usage_daily")
		.select("awake_seconds, cpu_vcpu_seconds, memory_gib_seconds, storage_gib_hours, sample_count")
		.eq("user_id", row.user_id)
		.eq("machine_id", row.machine_id)
		.eq("bucket_date", row.bucket_date)
		.maybeSingle();

	const merged = {
		...row,
		awake_seconds: (existing?.awake_seconds ?? 0) + row.awake_seconds,
		cpu_vcpu_seconds: (existing?.cpu_vcpu_seconds ?? 0) + row.cpu_vcpu_seconds,
		memory_gib_seconds: (existing?.memory_gib_seconds ?? 0) + row.memory_gib_seconds,
		storage_gib_hours: (existing?.storage_gib_hours ?? 0) + row.storage_gib_hours,
		sample_count: (existing?.sample_count ?? 0) + row.sample_count,
	};

	const { error } = await sb
		.from("machine_usage_daily")
		.upsert(merged, { onConflict: "user_id,machine_id,bucket_date" });

	if (error) throw new Error(`upsertDailyUsage: ${error.message}`);
}

export async function upsertCostEstimate(row: Omit<CostRow, "id">): Promise<void> {
	const sb = supabaseAdmin();
	const { error } = await sb
		.from("machine_cost_estimates")
		.upsert(row, { onConflict: "user_id,machine_id,bucket_date" });

	if (error) throw new Error(`upsertCostEstimate: ${error.message}`);
}

export async function getRecentTransitions(
	userId: string,
	opts?: { machineId?: string; limit?: number; offset?: number },
): Promise<{ rows: TransitionRow[]; count: number }> {
	const sb = supabaseAdmin();
	let query = sb
		.from("machine_transitions")
		.select("*", { count: "exact" })
		.eq("user_id", userId)
		.order("occurred_at", { ascending: false })
		.limit(opts?.limit ?? 50);

	if (opts?.machineId) {
		query = query.eq("machine_id", opts.machineId);
	}
	if (opts?.offset) {
		query = query.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);
	}

	const { data, error, count } = await query;
	if (error) throw new Error(`getRecentTransitions: ${error.message}`);
	return { rows: (data ?? []) as TransitionRow[], count: count ?? 0 };
}

export async function getLatestPhasePerMachine(
	userId: string,
): Promise<Map<string, { phase: string; name: string | null; at: string }>> {
	const sb = supabaseAdmin();
	const { data, error } = await sb
		.from("machine_transitions")
		.select("machine_id, to_phase, machine_name, occurred_at")
		.eq("user_id", userId)
		.order("occurred_at", { ascending: false })
		.limit(500);

	if (error) throw new Error(`getLatestPhasePerMachine: ${error.message}`);

	const result = new Map<string, { phase: string; name: string | null; at: string }>();
	for (const row of (data ?? []) as { machine_id: string; to_phase: string; machine_name: string | null; occurred_at: string }[]) {
		if (!result.has(row.machine_id)) {
			result.set(row.machine_id, {
				phase: row.to_phase,
				name: row.machine_name,
				at: row.occurred_at,
			});
		}
	}
	return result;
}

export async function getDailyUsage(
	userId: string,
	days: number,
	machineId?: string,
): Promise<UsageDailyRow[]> {
	const sb = supabaseAdmin();
	const since = new Date();
	since.setDate(since.getDate() - days);
	const sinceStr = since.toISOString().slice(0, 10);

	let query = sb
		.from("machine_usage_daily")
		.select("*")
		.eq("user_id", userId)
		.gte("bucket_date", sinceStr)
		.order("bucket_date", { ascending: true });

	if (machineId) {
		query = query.eq("machine_id", machineId);
	}

	const { data, error } = await query.limit(5000);
	if (error) throw new Error(`getDailyUsage: ${error.message}`);
	return (data ?? []) as UsageDailyRow[];
}

export async function getCostEstimates(
	userId: string,
	days: number,
): Promise<CostRow[]> {
	const sb = supabaseAdmin();
	const since = new Date();
	since.setDate(since.getDate() - days);
	const sinceStr = since.toISOString().slice(0, 10);

	const { data, error } = await sb
		.from("machine_cost_estimates")
		.select("*")
		.eq("user_id", userId)
		.gte("bucket_date", sinceStr)
		.order("bucket_date", { ascending: true });

	if (error) throw new Error(`getCostEstimates: ${error.message}`);
	return (data ?? []) as CostRow[];
}

export async function getRecentMetrics(
	userId: string,
	machineId: string,
	limit = 168,
): Promise<MetricRow[]> {
	const sb = supabaseAdmin();
	const { data, error } = await sb
		.from("machine_metrics")
		.select("*")
		.eq("user_id", userId)
		.eq("machine_id", machineId)
		.order("recorded_at", { ascending: false })
		.limit(limit);

	if (error) throw new Error(`getRecentMetrics: ${error.message}`);
	return (data ?? []) as MetricRow[];
}
