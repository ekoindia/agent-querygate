import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ShieldX, Bot, Database } from "lucide-react";
import type { DashboardStats } from "@/types";

interface StatCardConfig {
	title: string;
	key: keyof DashboardStats;
	icon: typeof Activity;
	accentClass: string;
	iconBgClass: string;
}

const statCards: StatCardConfig[] = [
	{
		title: "Queries Today",
		key: "queriesToday",
		icon: Activity,
		accentClass: "text-emerald-400",
		iconBgClass: "bg-emerald-400/10 ring-emerald-400/20",
	},
	{
		title: "Denied Today",
		key: "deniedToday",
		icon: ShieldX,
		accentClass: "text-red-400",
		iconBgClass: "bg-red-400/10 ring-red-400/20",
	},
	{
		title: "Active Agents",
		key: "activeAgents",
		icon: Bot,
		accentClass: "text-blue-400",
		iconBgClass: "bg-blue-400/10 ring-blue-400/20",
	},
	{
		title: "Total Databases",
		key: "totalDatabases",
		icon: Database,
		accentClass: "text-amber-400",
		iconBgClass: "bg-amber-400/10 ring-amber-400/20",
	},
];

/**
 * Renders a single loading skeleton card matching the stat card layout.
 */
function StatCardSkeleton() {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="size-8 rounded-lg" />
			</CardHeader>
			<CardContent>
				<Skeleton className="h-8 w-16" />
				<Skeleton className="mt-2 h-3 w-32" />
			</CardContent>
		</Card>
	);
}

export function Dashboard() {
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const fetchStats = async () => {
			try {
				const data = await api.get<DashboardStats>("/dashboard/stats");
				setStats(data);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load stats");
			} finally {
				setLoading(false);
			}
		};

		fetchStats();
	}, []);

	return (
		<div>
			{/* Page header */}
			<div className="mb-6">
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">
					Dashboard
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Overview of your MySQL agent connector service
				</p>
			</div>

			{/* Error state */}
			{error && (
				<div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{error}
				</div>
			)}

			{/* Stats grid */}
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{loading
					? Array.from({ length: 4 }).map((_, index) => (
							<StatCardSkeleton key={index} />
						))
					: statCards.map((card) => {
							const IconComponent = card.icon;
							const value = stats?.[card.key] ?? 0;

							return (
								<Card key={card.key}>
									<CardHeader className="flex flex-row items-center justify-between pb-2">
										<CardTitle className="text-sm font-medium text-muted-foreground">
											{card.title}
										</CardTitle>
										<div
											className={`flex size-8 items-center justify-center rounded-lg ring-1 ${card.iconBgClass}`}
										>
											<IconComponent className={`size-4 ${card.accentClass}`} />
										</div>
									</CardHeader>
									<CardContent>
										<div className={`text-3xl font-bold tracking-tight ${card.accentClass}`}>
											{value.toLocaleString()}
										</div>
										<p className="mt-1 text-xs text-muted-foreground">
											{card.key.includes("Today") ? "in the last 24 hours" : "currently registered"}
										</p>
									</CardContent>
								</Card>
							);
						})}
			</div>
		</div>
	);
}
