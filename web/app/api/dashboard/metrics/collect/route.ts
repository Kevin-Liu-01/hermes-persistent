/**
 * POST /api/dashboard/metrics/collect
 *
 * Polls every running machine for resource metrics, stores raw samples
 * in Supabase, detects state transitions, and maintains daily usage
 * rollups + cost estimates.
 *
 * Called by the dashboard's polling loop (~30s interval). Rate-limited
 * to one collection pass per 15s via an in-memory timestamp to absorb
 * double-fires and rapid retries.
 */

import {
	collectAndStore,
	type CollectedSample,
} from "@/lib/metrics/collector";
import { parseResourceSnapshot } from "@/lib/metrics/parser";
import { getProvider, MachineProviderError } from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";
import { getEffectiveUserId } from "@/lib/user-config/identity";
import type { MachineRef, ProviderKind } from "@/lib/user-config/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 15_000;
const EXEC_TIMEOUT_MS = 10_000;

const RESOURCE_CMD = [
	"cat /proc/stat",
	"echo '---DELIM---'",
	"free -b",
	"echo '---DELIM---'",
	"df -B1 /home/machine",
	"echo '---DELIM---'",
	"cat /proc/loadavg",
].join(" && ");

const lastCollectAt = new Map<string, number>();
const lastPhases = new Map<string, Map<string, string>>();

export async function POST(): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const now = Date.now();
	const prev = lastCollectAt.get(userId) ?? 0;
	if (now - prev < MIN_INTERVAL_MS) {
		return Response.json(
			{
				ok: false,
				error: "too_soon",
				message: `Last collection was ${Math.round((now - prev) / 1000)}s ago. Wait at least 15s.`,
			},
			{ status: 429 },
		);
	}
	lastCollectAt.set(userId, now);

	const config = await getUserConfig();
	const running = config.machines.filter((m) => !m.archived);

	if (running.length === 0) {
		return Response.json({ ok: true, collected: 0, transitions: 0 });
	}

	const samples = await Promise.all(
		running.map((m) => probeMachine(m, config.providers)),
	);

	const userPhases = lastPhases.get(userId) ?? new Map<string, string>();
	const result = await collectAndStore(userId, samples, userPhases);

	for (const s of samples) {
		userPhases.set(s.machineId, s.phase);
	}
	lastPhases.set(userId, userPhases);

	return Response.json({
		ok: true,
		collected: result.metricsStored,
		transitions: result.transitions,
	});
}

async function probeMachine(
	machine: MachineRef,
	credentials: import("@/lib/user-config/schema").ProviderCredentials,
): Promise<CollectedSample> {
	const base: Omit<CollectedSample, "phase" | "snapshot"> = {
		machineId: machine.id,
		machineName: machine.name,
		vcpu: machine.spec.vcpu,
		specMemoryMib: machine.spec.memoryMib,
		specStorageGib: machine.spec.storageGib,
	};

	try {
		const provider = getProvider(
			machine.providerKind as ProviderKind,
			credentials,
		);
		const summary = await provider.state(machine.id);

		if (summary.state !== "ready") {
			return { ...base, phase: summary.rawPhase, snapshot: null };
		}

		const exec = await provider.exec(machine.id, RESOURCE_CMD, {
			timeoutMs: EXEC_TIMEOUT_MS,
		});
		const snapshot =
			exec.exitCode === 0 ? parseResourceSnapshot(exec.stdout) : null;

		return { ...base, phase: summary.rawPhase, snapshot };
	} catch (err) {
		const phase =
			err instanceof MachineProviderError ? "provider_error" : "unreachable";
		return { ...base, phase, snapshot: null };
	}
}
