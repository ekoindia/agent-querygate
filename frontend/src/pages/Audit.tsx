import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	FileText,
	Download,
	ChevronDown,
	ChevronRight,
	ChevronLeft,
	ChevronsLeft,
	ChevronsRight,
} from "lucide-react";
import type { AuditLog, Agent, Database } from "@/types";

interface AuditFilters {
	agentId: string;
	databaseId: string;
	operationType: string;
	status: string;
	startDate: string;
	endDate: string;
}

interface PaginatedAuditResponse {
	data: AuditLog[];
	total: number;
	page: number;
	limit: number;
}

const emptyFilters: AuditFilters = {
	agentId: "",
	databaseId: "",
	operationType: "",
	status: "",
	startDate: "",
	endDate: "",
};

const OPERATIONS = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const STATUSES = ["allowed", "denied", "error"];

/**
 * Audit log page. Displays query audit trail with filtering, pagination, and CSV export.
 */
export function Audit() {
	const [logs, setLogs] = useState<AuditLog[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [limit] = useState(20);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Filter dropdowns data
	const [agents, setAgents] = useState<Agent[]>([]);
	const [databases, setDatabases] = useState<Database[]>([]);
	const [filters, setFilters] = useState<AuditFilters>(emptyFilters);

	// Expanded rows
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const fetchDropdowns = async () => {
		try {
			const [agentsData, dbsData] = await Promise.all([
				api.get<Agent[]>("/agents"),
				api.get<Database[]>("/databases"),
			]);
			setAgents(agentsData);
			setDatabases(dbsData);
		} catch {
			// Non-critical; filters just won't have dropdown options
		}
	};

	const fetchLogs = useCallback(async () => {
		setLoading(true);

		try {
			const params = new URLSearchParams();
			params.set("page", String(page));
			params.set("limit", String(limit));

			if (filters.agentId) params.set("agentId", filters.agentId);
			if (filters.databaseId) params.set("databaseId", filters.databaseId);
			if (filters.operationType) params.set("operationType", filters.operationType);
			if (filters.status) params.set("status", filters.status);
			if (filters.startDate) params.set("startDate", filters.startDate);
			if (filters.endDate) params.set("endDate", filters.endDate);

			const result = await api.get<PaginatedAuditResponse>(
				`/audit?${params.toString()}`,
			);
			setLogs(result.data);
			setTotal(result.total);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load audit logs");
		} finally {
			setLoading(false);
		}
	}, [page, limit, filters]);

	useEffect(() => {
		fetchDropdowns();
	}, []);

	useEffect(() => {
		fetchLogs();
	}, [fetchLogs]);

	const handleFilterChange = (key: keyof AuditFilters, value: string) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
		setPage(1);
	};

	const clearFilters = () => {
		setFilters(emptyFilters);
		setPage(1);
	};

	const handleExport = async () => {
		try {
			const params = new URLSearchParams();
			if (filters.agentId) params.set("agentId", filters.agentId);
			if (filters.databaseId) params.set("databaseId", filters.databaseId);
			if (filters.operationType) params.set("operationType", filters.operationType);
			if (filters.status) params.set("status", filters.status);
			if (filters.startDate) params.set("startDate", filters.startDate);
			if (filters.endDate) params.set("endDate", filters.endDate);

			const response = await fetch(
				`/admin/api/audit/export?${params.toString()}`,
				{ credentials: "include" },
			);

			if (!response.ok) throw new Error("Export failed");

			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
			link.click();
			window.URL.revokeObjectURL(url);
			toast.success("Export downloaded");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Export failed");
		}
	};

	const toggleExpanded = (id: string) => {
		setExpandedId((prev) => (prev === id ? null : id));
	};

	const totalPages = Math.ceil(total / limit);

	const statusVariant = (status: string): "default" | "destructive" | "secondary" => {
		switch (status) {
			case "allowed":
				return "default";
			case "denied":
				return "destructive";
			default:
				return "secondary";
		}
	};

	const formatTime = (dateStr: string) => {
		return new Date(dateStr).toLocaleString("en-US", {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
	};

	const truncateSql = (sql: string, maxLength = 60) => {
		return sql.length > maxLength ? `${sql.slice(0, maxLength)}...` : sql;
	};

	const agentName = (agentId: string) => {
		return agents.find((a) => a.id === agentId)?.name ?? agentId.slice(0, 8);
	};

	const dbName = (databaseId: string) => {
		return databases.find((d) => d.id === databaseId)?.name ?? databaseId.slice(0, 8);
	};

	const hasActiveFilters = Object.values(filters).some((v) => v !== "");

	return (
		<div>
			{/* Page header */}
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
						Audit Log
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Query execution history and access audit trail
					</p>
				</div>
				<Button variant="outline" onClick={handleExport}>
					<Download className="size-4" />
					Export CSV
				</Button>
			</div>

			{/* Error state */}
			{error && (
				<div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{error}
				</div>
			)}

			{/* Filters bar */}
			<div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-muted/20 p-4">
				<div className="grid gap-1.5">
					<Label className="text-xs text-muted-foreground">Agent</Label>
					<Select
						value={filters.agentId}
						onValueChange={(value) => handleFilterChange("agentId", value as string)}
					>
						<SelectTrigger className="w-36">
							<SelectValue placeholder="All agents" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__all__">All agents</SelectItem>
							{agents.map((agent) => (
								<SelectItem key={agent.id} value={agent.id}>
									{agent.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="grid gap-1.5">
					<Label className="text-xs text-muted-foreground">Database</Label>
					<Select
						value={filters.databaseId}
						onValueChange={(value) => handleFilterChange("databaseId", value as string)}
					>
						<SelectTrigger className="w-36">
							<SelectValue placeholder="All databases" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__all__">All databases</SelectItem>
							{databases.map((db) => (
								<SelectItem key={db.id} value={db.id}>
									{db.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="grid gap-1.5">
					<Label className="text-xs text-muted-foreground">Operation</Label>
					<Select
						value={filters.operationType}
						onValueChange={(value) => handleFilterChange("operationType", value as string)}
					>
						<SelectTrigger className="w-32">
							<SelectValue placeholder="All ops" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__all__">All ops</SelectItem>
							{OPERATIONS.map((op) => (
								<SelectItem key={op} value={op}>
									{op}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="grid gap-1.5">
					<Label className="text-xs text-muted-foreground">Status</Label>
					<Select
						value={filters.status}
						onValueChange={(value) => handleFilterChange("status", value as string)}
					>
						<SelectTrigger className="w-32">
							<SelectValue placeholder="All statuses" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__all__">All statuses</SelectItem>
							{STATUSES.map((s) => (
								<SelectItem key={s} value={s}>
									{s.charAt(0).toUpperCase() + s.slice(1)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="grid gap-1.5">
					<Label className="text-xs text-muted-foreground">From</Label>
					<Input
						type="date"
						className="w-36"
						value={filters.startDate}
						onChange={(e) => handleFilterChange("startDate", e.target.value)}
					/>
				</div>

				<div className="grid gap-1.5">
					<Label className="text-xs text-muted-foreground">To</Label>
					<Input
						type="date"
						className="w-36"
						value={filters.endDate}
						onChange={(e) => handleFilterChange("endDate", e.target.value)}
					/>
				</div>

				{hasActiveFilters && (
					<Button variant="ghost" size="sm" onClick={clearFilters}>
						Clear
					</Button>
				)}
			</div>

			{/* Table */}
			{loading ? (
				<div className="space-y-3">
					{Array.from({ length: 6 }).map((_, index) => (
						<Skeleton key={index} className="h-12 w-full rounded-lg" />
					))}
				</div>
			) : logs.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 py-16">
					<FileText className="mb-3 size-10 text-muted-foreground/50" />
					<p className="text-sm text-muted-foreground">No audit records found</p>
				</div>
			) : (
				<>
					<div className="rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-8" />
									<TableHead>Time</TableHead>
									<TableHead>Agent</TableHead>
									<TableHead>Database</TableHead>
									<TableHead>Operation</TableHead>
									<TableHead>SQL</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Rows</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{logs.map((log) => (
									<>
										<TableRow key={log.id}>
											<TableCell>
												<button
													onClick={() => toggleExpanded(log.id)}
													className="text-muted-foreground hover:text-foreground"
													aria-label="Toggle details"
												>
													{expandedId === log.id ? (
														<ChevronDown className="size-4" />
													) : (
														<ChevronRight className="size-4" />
													)}
												</button>
											</TableCell>
											<TableCell className="text-xs text-muted-foreground">
												{formatTime(log.createdAt)}
											</TableCell>
											<TableCell className="text-xs">
												{agentName(log.agentId)}
											</TableCell>
											<TableCell className="text-xs">
												{dbName(log.databaseId)}
											</TableCell>
											<TableCell>
												<Badge variant="outline" className="text-[10px]">
													{log.operationType}
												</Badge>
											</TableCell>
											<TableCell
												className="max-w-[200px] truncate font-mono text-xs text-muted-foreground"
												title={log.sqlQuery}
											>
												{truncateSql(log.sqlQuery)}
											</TableCell>
											<TableCell>
												<Badge
													variant={statusVariant(log.status)}
													className="text-[10px]"
												>
													{log.status}
												</Badge>
											</TableCell>
											<TableCell className="text-xs text-muted-foreground">
												{log.affectedRows ?? "-"}
											</TableCell>
										</TableRow>

										{/* Expanded detail row */}
										{expandedId === log.id && (
											<TableRow key={`${log.id}-detail`}>
												<TableCell colSpan={8} className="bg-muted/30 px-8 py-4">
													<div className="space-y-3">
														{/* Full SQL */}
														<div>
															<p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
																Full SQL Query
															</p>
															<pre className="overflow-x-auto rounded-md border bg-background p-3 text-xs font-mono">
																{log.sqlQuery}
															</pre>
														</div>

														{/* Denial reason */}
														{log.denialReason && (
															<div>
																<p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
																	Denial Reason
																</p>
																<p className="text-sm text-destructive">
																	{log.denialReason}
																</p>
															</div>
														)}

														{/* Execution time */}
														{log.executionTimeMs !== null && (
															<div>
																<p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
																	Execution Time
																</p>
																<p className="text-sm">
																	{log.executionTimeMs}ms
																</p>
															</div>
														)}

														{/* Data diff */}
														<div className="grid grid-cols-2 gap-4">
															{log.dataBefore && (
																<div>
																	<p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
																		Data Before
																	</p>
																	<pre className="max-h-48 overflow-auto rounded-md border bg-background p-3 text-xs font-mono">
																		{JSON.stringify(log.dataBefore, null, 2)}
																	</pre>
																</div>
															)}
															{log.dataAfter && (
																<div>
																	<p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
																		Data After
																	</p>
																	<pre className="max-h-48 overflow-auto rounded-md border bg-background p-3 text-xs font-mono">
																		{JSON.stringify(log.dataAfter, null, 2)}
																	</pre>
																</div>
															)}
														</div>
													</div>
												</TableCell>
											</TableRow>
										)}
									</>
								))}
							</TableBody>
						</Table>
					</div>

					{/* Pagination */}
					<div className="mt-4 flex items-center justify-between">
						<p className="text-xs text-muted-foreground">
							Showing {(page - 1) * limit + 1}-
							{Math.min(page * limit, total)} of {total} records
						</p>
						<div className="flex items-center gap-1">
							<Button
								variant="outline"
								size="icon-xs"
								disabled={page <= 1}
								onClick={() => setPage(1)}
								title="First page"
							>
								<ChevronsLeft className="size-3" />
							</Button>
							<Button
								variant="outline"
								size="icon-xs"
								disabled={page <= 1}
								onClick={() => setPage((p) => p - 1)}
								title="Previous page"
							>
								<ChevronLeft className="size-3" />
							</Button>
							<span className="px-2 text-xs text-muted-foreground">
								Page {page} of {totalPages}
							</span>
							<Button
								variant="outline"
								size="icon-xs"
								disabled={page >= totalPages}
								onClick={() => setPage((p) => p + 1)}
								title="Next page"
							>
								<ChevronRight className="size-3" />
							</Button>
							<Button
								variant="outline"
								size="icon-xs"
								disabled={page >= totalPages}
								onClick={() => setPage(totalPages)}
								title="Last page"
							>
								<ChevronsRight className="size-3" />
							</Button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
