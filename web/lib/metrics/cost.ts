/**
 * Cost estimation for Dedalus machine usage.
 *
 * Rates are expressed in millicents (1/1000 of a cent) to avoid
 * floating-point rounding in running totals. Final display uses
 * `formatMillicents` to convert to dollars.
 */

const CPU_RATE_MILLICENTS_PER_VCPU_SECOND = 0.0046;
const MEMORY_RATE_MILLICENTS_PER_GIB_SECOND = 0.0023;
const STORAGE_RATE_MILLICENTS_PER_GIB_HOUR = 0.015;

export type CostEstimate = {
	cpuMillicents: number;
	memoryMillicents: number;
	storageMillicents: number;
	totalMillicents: number;
};

export function estimateCost(
	spec: { vcpu: number; memoryMib: number; storageGib: number },
	awakeSeconds: number,
): CostEstimate {
	const cpuMillicents =
		spec.vcpu * awakeSeconds * CPU_RATE_MILLICENTS_PER_VCPU_SECOND;
	const memoryGib = spec.memoryMib / 1024;
	const memoryMillicents =
		memoryGib * awakeSeconds * MEMORY_RATE_MILLICENTS_PER_GIB_SECOND;
	const awakeHours = awakeSeconds / 3600;
	const storageMillicents =
		spec.storageGib * awakeHours * STORAGE_RATE_MILLICENTS_PER_GIB_HOUR;
	const totalMillicents = cpuMillicents + memoryMillicents + storageMillicents;

	return { cpuMillicents, memoryMillicents, storageMillicents, totalMillicents };
}

export function formatMillicents(millicents: number): string {
	const dollars = millicents / 100_000;
	return `$${dollars.toFixed(2)}`;
}
