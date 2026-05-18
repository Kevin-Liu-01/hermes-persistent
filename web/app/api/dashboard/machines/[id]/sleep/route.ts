/**
 * POST /api/dashboard/machines/[id]/sleep
 *
 * Per-machine sleep -- works for any machine in the user's fleet,
 * not just the currently active one. Mirrors the wake-route pattern
 * so fleet UIs can put non-active machines to sleep without first
 * switching active.
 *
 * Idempotent: the provider returns the current summary unchanged
 * if the machine isn't running. On Dedalus the explicit /sleep call
 * is HMAC-gated and may 401; the provider swallows that case and
 * relies on `autosleep_seconds` so the button reads as "sleep
 * sooner" rather than "sleep at all".
 */

import { getEffectiveUserId } from "@/lib/user-config/identity";

import { MachineProviderError, getProvider } from "@/lib/providers";
import { getUserConfig } from "@/lib/user-config/clerk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
	const userId = await getEffectiveUserId();
	if (!userId) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}
	const { id } = await ctx.params;

	const config = await getUserConfig();
	const machine = config.machines.find((m) => m.id === id);
	if (!machine) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}

	try {
		const provider = getProvider(machine.providerKind, config.providers);
		const summary = await provider.sleep(machine.id);
		return Response.json(
			{ ok: true, summary },
			{ headers: { "Cache-Control": "no-store" } },
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : "sleep failed";
		const kind = err instanceof MachineProviderError ? err.kind : "fatal";
		const status = kind === "transient" ? 502 : kind === "rate_limited" ? 429 : 400;
		return Response.json(
			{ ok: false, error: "sleep_failed", message },
			{ status },
		);
	}
}
