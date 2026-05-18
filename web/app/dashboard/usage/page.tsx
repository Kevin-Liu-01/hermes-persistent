"use client";

import { useEffect, useMemo, useState } from "react";

import { DashboardPageBody } from "@/components/dashboard/DashboardPageBody";
import {
	DashboardBarChart,
	formatDayShort,
} from "@/components/dashboard/DashboardBarChart";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import {
	TimeRangeSelector,
	RANGE_OPTIONS_USAGE,
} from "@/components/dashboard/TimeRangeSelector";
import { ReticleFrame } from "@/components/reticle/ReticleFrame";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

type Bucket = { date: string; [key: string]: unknown };

type UsageResponse = {
	ok: true;
	days: number;
	resources: {
		cpu: {
			totalVcpuSeconds: number;
			buckets: Array<{ date: string; vcpuSeconds: number }>;
		};
		memory: {
			totalGibSeconds: number;
			buckets: Array<{ date: string; gibSeconds: number }>;
		};
		storage: {
			totalGibHours: number;
			buckets: Array<{ date: string; gibHours: number }>;
		};
	};
	machineBreakdown: Array<{
		machineId: string;
		vcpu: number;
		memoryMib: number;
		awakeSeconds: number;
		cpuVcpuSeconds: number;
	}>;
	totalCostMillicents: number;
	totalCostFormatted: string;
};

function fmtHours(seconds: number): string {
	const h = seconds / 3600;
	return h >= 10 ? h.toFixed(0) : h.toFixed(1);
}

function fmtActiveTime(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}s`;
	if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
	return `${(seconds / 3600).toFixed(1)}h`;
}

function avgPerDay(total: number, days: number): string {
	if (days <= 0) return "0";
	const avg = total / days;
	return avg >= 10 ? avg.toFixed(0) : avg.toFixed(1);
}

export default function UsagePage() {
	const [days, setDays] = useState(7);
	const [data, setData] = useState<UsageResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let stopped = false;
		setLoading(true);
		async function load() {
			try {
				const res = await fetch(
					`/api/dashboard/metrics/usage?days=${days}`,
					{ cache: "no-store" },
				);
				if (!res.ok || stopped) {
					if (!stopped) setError(`HTTP ${res.status}`);
					return;
				}
				const json = (await res.json()) as UsageResponse;
				if (!stopped) {
					setData(json);
					setError(null);
				}
			} catch {
				if (!stopped) setError("Failed to fetch usage data");
			} finally {
				if (!stopped) setLoading(false);
			}
		}
		load();
		return () => {
			stopped = true;
		};
	}, [days]);

	const cpuHours = data ? fmtHours(data.resources.cpu.totalVcpuSeconds) : "–";
	const memHours = data
		? fmtHours(data.resources.memory.totalGibSeconds)
		: "–";
	const storageHours = data
		? data.resources.storage.totalGibHours.toFixed(1)
		: "–";

	const cpuBuckets = useMemo(
		() =>
			data?.resources.cpu.buckets.map((b) => ({
				date: b.date,
				value: b.vcpuSeconds / 3600,
			})) ?? [],
		[data],
	);
	const memBuckets = useMemo(
		() =>
			data?.resources.memory.buckets.map((b) => ({
				date: b.date,
				value: b.gibSeconds / 3600,
			})) ?? [],
		[data],
	);
	const storageBuckets = useMemo(
		() =>
			data?.resources.storage.buckets.map((b) => ({
				date: b.date,
				value: b.gibHours,
			})) ?? [],
		[data],
	);

	return (
		<div className="flex flex-col">
			<PageHeader
				kicker="USAGE"
				title="Usage"
				description="Org-level machine resource consumption and estimated costs."
				right={
					<TimeRangeSelector
						options={RANGE_OPTIONS_USAGE}
						selected={days}
						onSelect={setDays}
					/>
				}
			/>
			<DashboardPageBody>
				{error ? (
					<ReticleFrame className="border-[var(--ret-red)]/50 bg-[var(--ret-red)]/5 p-3">
						<p className="text-[11px] text-[var(--ret-red)]">
							error: {error}
						</p>
					</ReticleFrame>
				) : null}

				{/* ── B) Resource stat cards ── */}
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{loading ? (
						<>
							{[0, 1, 2, 3].map((i) => (
								<Skeleton key={i} className="h-[100px]" />
							))}
						</>
					) : (
						<>
							<StatCard
								label="Total cost"
								value={data?.totalCostFormatted ?? "$0.00"}
								unit="USD"
							/>
							<StatCard
								label="CPU"
								value={cpuHours}
								unit="vCPU-hrs"
							/>
							<StatCard
								label="Memory"
								value={memHours}
								unit="GB-hrs"
							/>
							<StatCard
								label="Storage"
								value={storageHours}
								unit="GB-hrs"
							/>
						</>
					)}
				</div>

				{/* ── C) Resource utilization charts ── */}
				<ReticleFrame>
					<div className="divide-y divide-[var(--ret-border)]">
						<ResourceChartRow
							title="CPU"
							total={cpuHours}
							unit="vCPU-hrs"
							avgLabel={`${data ? avgPerDay(data.resources.cpu.totalVcpuSeconds / 3600, days) : "–"} avg/day`}
							data={cpuBuckets}
							color="var(--ret-purple)"
							loading={loading}
						/>
						<ResourceChartRow
							title="Memory"
							total={memHours}
							unit="GB-hrs"
							avgLabel={`${data ? avgPerDay(data.resources.memory.totalGibSeconds / 3600, days) : "–"} avg/day`}
							data={memBuckets}
							color="var(--ret-amber)"
							loading={loading}
						/>
						<ResourceChartRow
							title="Storage"
							total={storageHours}
							unit="GB-hrs"
							avgLabel={`${data ? avgPerDay(data.resources.storage.totalGibHours, days) : "–"} avg/day`}
							data={storageBuckets}
							color="var(--ret-red)"
							loading={loading}
						/>
					</div>
				</ReticleFrame>

				{/* ── D) Per-machine usage table ── */}
				<ReticleFrame>
					<div className="border-b border-[var(--ret-border)] px-4 py-3">
						<h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
							Per-machine breakdown
						</h2>
					</div>
					{loading ? (
						<div className="space-y-2 p-4">
							{[0, 1, 2].map((i) => (
								<Skeleton key={i} className="h-10 w-full" />
							))}
						</div>
					) : !data?.machineBreakdown.length ? (
						<p className="px-4 py-6 text-center text-[12px] text-[var(--ret-text-muted)]">
							No machine usage data for this period.
						</p>
					) : (
						<div className="overflow-x-auto">
							<table className="w-full text-left text-[12px]">
								<thead>
									<tr className="border-b border-[var(--ret-border)] text-[var(--ret-text-muted)]">
										<th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal">
											Machine ID
										</th>
										<th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal">
											CPU
										</th>
										<th className="hidden px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal sm:table-cell">
											Memory
										</th>
										<th className="hidden px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal md:table-cell">
											Disk Used
										</th>
										<th className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal">
											Active Time
										</th>
										<th className="hidden px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-normal lg:table-cell">
											Amount Billed
										</th>
									</tr>
								</thead>
								<tbody>
									{data.machineBreakdown.map((row) => (
										<tr
											key={row.machineId}
											className="border-b border-[var(--ret-border)] transition-colors hover:bg-[var(--ret-surface)]"
										>
											<td className="max-w-[160px] truncate px-4 py-2.5 font-mono text-[11px] text-[var(--ret-text)]">
												{row.machineId.slice(0, 20)}
											</td>
											<td className="px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)]">
												{row.vcpu} vCPU
											</td>
											<td className="hidden px-4 py-2.5 text-[11px] text-[var(--ret-text-dim)] sm:table-cell">
												{(row.memoryMib / 1024).toFixed(1)} GiB
											</td>
											<td className="hidden px-4 py-2.5 text-[11px] text-[var(--ret-text-muted)] md:table-cell">
												–
											</td>
											<td className="px-4 py-2.5 font-mono text-[11px] text-[var(--ret-text)]">
												{fmtActiveTime(row.awakeSeconds)}
											</td>
											<td className="hidden px-4 py-2.5 text-[11px] text-[var(--ret-text-muted)] lg:table-cell">
												–
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</ReticleFrame>
			</DashboardPageBody>
		</div>
	);
}

function ResourceChartRow({
	title,
	total,
	unit,
	avgLabel,
	data,
	color,
	loading,
}: {
	title: string;
	total: string;
	unit: string;
	avgLabel: string;
	data: Array<{ date: string; value: number }>;
	color: string;
	loading: boolean;
}) {
	return (
		<div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="shrink-0 sm:w-[140px]">
				<h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ret-text-muted)]">
					{title}
				</h3>
				<p className="mt-1 text-lg font-semibold tabular-nums text-[var(--ret-text)]">
					{total}
					<span className="ml-1 text-[11px] font-normal text-[var(--ret-text-dim)]">
						{unit}
					</span>
				</p>
				<p className="mt-0.5 text-[10px] text-[var(--ret-text-muted)]">
					{avgLabel}
				</p>
			</div>
			<div className="min-w-0 flex-1">
				{loading ? (
					<Skeleton className="h-[120px]" />
				) : (
					<DashboardBarChart
						data={data}
						dataKey="value"
						xFormatter={formatDayShort}
						color={color}
						height={120}
					/>
				)}
			</div>
		</div>
	);
}
