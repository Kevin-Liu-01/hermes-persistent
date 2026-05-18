/**
 * Metrics collector -- stores raw samples, detects state transitions,
 * maintains daily usage rollups, and upserts cost estimates.
 *
 * The API route does the parallel exec calls; this module receives
 * pre-collected data and handles all Supabase writes in batch.
 */

import { supabaseAdmin } from "@/lib/supabase/client";
import { estimateCost } from "./cost";
import type { ResourceSnapshot } from "./parser";

const POLL_INTERVAL_SECONDS = 30;

export type CollectedSample = {
	machineId: string;
	machineName: string;
	phase: string;
	vcpu: number;
	specMemoryMib: number;
	specStorageGib: number;
	snapshot: ResourceSnapshot | null;
};

export async function collectAndStore(
	userId: string,
	samples: CollectedSample[],
	lastPhases: Map<string, string>,
): Promise<{ transitions: number; metricsStored: number }> {
	const db = supabaseAdmin();
	const now = new Date().toISOString();
	const today = now.slice(0, 10);

	const withSnapshots = samples.filter((s) => s.snapshot);
	let metricsStored = 0;
	let transitions = 0;

	if (withSnapshots.length > 0) {
		const rows = withSnapshots.map((s) => ({
			user_id: userId,
			machine_id: s.machineId,
			recorded_at: now,
			cpu_percent: s.snapshot!.cpuPercent,
			memory_used_mib: s.snapshot!.memoryUsedMib,
			memory_total_mib: s.snapshot!.memoryTotalMib,
			storage_used_gib: s.snapshot!.storageUsedGib,
			storage_total_gib: s.snapshot!.storageTotalGib,
			load_avg_1m: s.snapshot!.loadAvg1m,
			phase: s.phase,
			vcpu: s.vcpu,
			spec_memory_mib: s.specMemoryMib,
		}));
		const { error } = await db.from("machine_metrics").insert(rows);
		if (!error) metricsStored = rows.length;
	}

	const transitionRows: Array<{
		user_id: string;
		machine_id: string;
		occurred_at: string;
		from_phase: string | null;
		to_phase: string;
		machine_name: string;
	}> = [];

	for (const s of samples) {
		const prev = lastPhases.get(s.machineId);
		if (prev !== undefined && prev !== s.phase) {
			transitionRows.push({
				user_id: userId,
				machine_id: s.machineId,
				occurred_at: now,
				from_phase: prev,
				to_phase: s.phase,
				machine_name: s.machineName,
			});
		}
	}

	if (transitionRows.length > 0) {
		const { error } = await db
			.from("machine_transitions")
			.insert(transitionRows);
		if (!error) transitions = transitionRows.length;
	}

	const runningSamples = samples.filter(
		(s) => s.snapshot && s.phase === "ready",
	);

	await Promise.all(
		runningSamples.map((s) => upsertDailyUsage(db, userId, s, today)),
	);

	await Promise.all(
		runningSamples.map((s) => upsertCostEstimate(db, userId, s, today)),
	);

	return { transitions, metricsStored };
}

async function upsertDailyUsage(
	db: ReturnType<typeof supabaseAdmin>,
	userId: string,
	sample: CollectedSample,
	bucketDate: string,
): Promise<void> {
	const { data: existing } = await db
		.from("machine_usage_daily")
		.select("*")
		.eq("user_id", userId)
		.eq("machine_id", sample.machineId)
		.eq("bucket_date", bucketDate)
		.maybeSingle();

	const memoryGib = sample.specMemoryMib / 1024;
	const addAwake = POLL_INTERVAL_SECONDS;
	const addCpuSeconds = sample.vcpu * POLL_INTERVAL_SECONDS;
	const addMemoryGibSeconds = memoryGib * POLL_INTERVAL_SECONDS;
	const addStorageGibHours =
		(sample.specStorageGib * POLL_INTERVAL_SECONDS) / 3600;

	const row = {
		user_id: userId,
		machine_id: sample.machineId,
		bucket_date: bucketDate,
		awake_seconds: (existing?.awake_seconds ?? 0) + addAwake,
		cpu_vcpu_seconds: Number(existing?.cpu_vcpu_seconds ?? 0) + addCpuSeconds,
		memory_gib_seconds:
			Number(existing?.memory_gib_seconds ?? 0) + addMemoryGibSeconds,
		storage_gib_hours:
			Number(existing?.storage_gib_hours ?? 0) + addStorageGibHours,
		sample_count: (existing?.sample_count ?? 0) + 1,
		vcpu: sample.vcpu,
		spec_memory_mib: sample.specMemoryMib,
		spec_storage_gib: sample.specStorageGib,
	};

	await db
		.from("machine_usage_daily")
		.upsert(row, { onConflict: "user_id,machine_id,bucket_date" });
}

async function upsertCostEstimate(
	db: ReturnType<typeof supabaseAdmin>,
	userId: string,
	sample: CollectedSample,
	bucketDate: string,
): Promise<void> {
	const { data: usage } = await db
		.from("machine_usage_daily")
		.select("awake_seconds")
		.eq("user_id", userId)
		.eq("machine_id", sample.machineId)
		.eq("bucket_date", bucketDate)
		.maybeSingle();

	const awakeSeconds = usage?.awake_seconds ?? POLL_INTERVAL_SECONDS;
	const cost = estimateCost(
		{
			vcpu: sample.vcpu,
			memoryMib: sample.specMemoryMib,
			storageGib: sample.specStorageGib,
		},
		awakeSeconds,
	);

	await db.from("machine_cost_estimates").upsert(
		{
			user_id: userId,
			machine_id: sample.machineId,
			bucket_date: bucketDate,
			cpu_cost_millicents: Math.round(cost.cpuMillicents),
			memory_cost_millicents: Math.round(cost.memoryMillicents),
			storage_cost_millicents: Math.round(cost.storageMillicents),
			total_cost_millicents: Math.round(cost.totalMillicents),
		},
		{ onConflict: "user_id,machine_id,bucket_date" },
	);
}
