"use client";

import { cn } from "@/lib/cn";

type Props = {
	label: string;
	value: string | number;
	unit?: string;
	badge?: React.ReactNode;
	subtext?: string;
	className?: string;
};

export function StatCard({ label, value, unit, badge, subtext, className }: Props) {
	return (
		<div
			className={cn(
				"relative border border-[var(--ret-border)] bg-[var(--ret-bg)] px-6 py-6 flex flex-col items-center justify-center text-center",
				className,
			)}
		>
			{badge && (
				<div className="absolute top-2 left-2">{badge}</div>
			)}
			<span className="text-[10px] uppercase tracking-widest font-mono text-[var(--ret-text-muted)] mb-2">
				{label}
			</span>
			<span className="text-4xl font-semibold tabular-nums text-[var(--ret-text)]">
				{value}
				{unit && (
					<span className="text-[13px] font-mono text-[var(--ret-text-dim)] ml-1">
						{unit}
					</span>
				)}
			</span>
			{subtext && (
				<span className="absolute bottom-2 right-3 text-[10px] font-mono text-[var(--ret-text-muted)]">
					{subtext}
				</span>
			)}
		</div>
	);
}
