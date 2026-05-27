import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Bot,
	Plus,
	Trash2,
	Loader2,
	KeyRound,
	Copy,
	Check,
	Database,
	Shield,
	ChevronDown,
	ChevronRight,
} from "lucide-react";
import type { Agent, Database as DatabaseType } from "@/types";

interface AgentWithDatabases extends Agent {
	databases?: DatabaseAccess[];
}

interface DatabaseAccess {
	id: string;
	agentId: string;
	databaseId: string;
	database?: DatabaseType;
}

/**
 * Agents management page. Lists agents, manages API keys, database assignments, and policies.
 */
export function Agents() {
	const [agents, setAgents] = useState<AgentWithDatabases[]>([]);
	const [databases, setDatabases] = useState<DatabaseType[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Create agent dialog
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [agentName, setAgentName] = useState("");
	const [creating, setCreating] = useState(false);

	// API key display dialog
	const [keyDialogOpen, setKeyDialogOpen] = useState(false);
	const [displayedKey, setDisplayedKey] = useState("");
	const [copied, setCopied] = useState(false);

	// Delete confirmation
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	// Regenerate key confirmation
	const [regenDialogOpen, setRegenDialogOpen] = useState(false);
	const [regenId, setRegenId] = useState<string | null>(null);
	const [regenerating, setRegenerating] = useState(false);

	// Database management
	const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
	const [dbDialogOpen, setDbDialogOpen] = useState(false);
	const [managingAgentId, setManagingAgentId] = useState<string | null>(null);
	const [selectedDatabaseIds, setSelectedDatabaseIds] = useState<string[]>([]);
	const [savingDbs, setSavingDbs] = useState(false);

	// Toggling active state
	const [togglingId, setTogglingId] = useState<string | null>(null);

	const fetchData = async () => {
		try {
			const [agentsData, dbsData] = await Promise.all([
				api.get<AgentWithDatabases[]>("/agents"),
				api.get<DatabaseType[]>("/databases"),
			]);
			setAgents(agentsData);
			setDatabases(dbsData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load data");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchData();
	}, []);

	const handleCreate = async (event: FormEvent) => {
		event.preventDefault();
		setCreating(true);

		try {
			const result = await api.post<{ agent: Agent; apiKey: string }>("/agents", {
				name: agentName,
			});
			setCreateDialogOpen(false);
			setAgentName("");
			setDisplayedKey(result.apiKey);
			setKeyDialogOpen(true);
			await fetchData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to create agent");
		} finally {
			setCreating(false);
		}
	};

	const handleToggleActive = async (agent: AgentWithDatabases) => {
		setTogglingId(agent.id);

		try {
			await api.put(`/agents/${agent.id}`, { isActive: !agent.isActive });
			toast.success(
				`Agent ${agent.isActive ? "deactivated" : "activated"} successfully`,
			);
			await fetchData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update agent");
		} finally {
			setTogglingId(null);
		}
	};

	const openRegenConfirm = (id: string) => {
		setRegenId(id);
		setRegenDialogOpen(true);
	};

	const handleRegenerate = async () => {
		if (!regenId) return;
		setRegenerating(true);

		try {
			const result = await api.post<{ apiKey: string }>(
				`/agents/${regenId}/regenerate-key`,
			);
			setRegenDialogOpen(false);
			setRegenId(null);
			setDisplayedKey(result.apiKey);
			setKeyDialogOpen(true);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to regenerate key",
			);
		} finally {
			setRegenerating(false);
		}
	};

	const openDeleteConfirm = (id: string) => {
		setDeletingId(id);
		setDeleteDialogOpen(true);
	};

	const handleDelete = async () => {
		if (!deletingId) return;
		setDeleting(true);

		try {
			await api.del(`/agents/${deletingId}`);
			toast.success("Agent deleted successfully");
			setDeleteDialogOpen(false);
			setDeletingId(null);
			await fetchData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Delete failed");
		} finally {
			setDeleting(false);
		}
	};

	const copyKey = async () => {
		try {
			await navigator.clipboard.writeText(displayedKey);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Failed to copy to clipboard");
		}
	};

	const openManageDatabases = (agent: AgentWithDatabases) => {
		setManagingAgentId(agent.id);
		setSelectedDatabaseIds(
			agent.databases?.map((da) => da.databaseId) ?? [],
		);
		setDbDialogOpen(true);
	};

	const handleSaveDatabases = async () => {
		if (!managingAgentId) return;
		setSavingDbs(true);

		try {
			await api.put(`/agents/${managingAgentId}/databases`, {
				databaseIds: selectedDatabaseIds,
			});
			toast.success("Database assignments updated");
			setDbDialogOpen(false);
			await fetchData();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to update databases",
			);
		} finally {
			setSavingDbs(false);
		}
	};

	const toggleDatabaseSelection = (dbId: string) => {
		setSelectedDatabaseIds((prev) =>
			prev.includes(dbId)
				? prev.filter((id) => id !== dbId)
				: [...prev, dbId],
		);
	};

	const toggleExpanded = (agentId: string) => {
		setExpandedAgentId((prev) => (prev === agentId ? null : agentId));
	};

	const formatDate = (dateStr: string) => {
		return new Date(dateStr).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	return (
		<div>
			{/* Page header */}
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
						Agents
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage AI agents and their database access
					</p>
				</div>
				<Button onClick={() => setCreateDialogOpen(true)}>
					<Plus className="size-4" />
					Create Agent
				</Button>
			</div>

			{/* Error state */}
			{error && (
				<div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{error}
				</div>
			)}

			{/* Table */}
			{loading ? (
				<div className="space-y-3">
					{Array.from({ length: 4 }).map((_, index) => (
						<Skeleton key={index} className="h-12 w-full rounded-lg" />
					))}
				</div>
			) : agents.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 py-16">
					<Bot className="mb-3 size-10 text-muted-foreground/50" />
					<p className="text-sm text-muted-foreground">No agents configured</p>
					<Button
						variant="outline"
						className="mt-4"
						onClick={() => setCreateDialogOpen(true)}
					>
						<Plus className="size-4" />
						Create your first agent
					</Button>
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8" />
								<TableHead>Name</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Databases</TableHead>
								<TableHead>Created</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{agents.map((agent) => (
								<>
									<TableRow key={agent.id}>
										<TableCell>
											<button
												onClick={() => toggleExpanded(agent.id)}
												className="text-muted-foreground hover:text-foreground"
												aria-label="Toggle details"
											>
												{expandedAgentId === agent.id ? (
													<ChevronDown className="size-4" />
												) : (
													<ChevronRight className="size-4" />
												)}
											</button>
										</TableCell>
										<TableCell className="font-medium">{agent.name}</TableCell>
										<TableCell>
											{togglingId === agent.id ? (
												<Loader2 className="size-4 animate-spin text-muted-foreground" />
											) : (
												<button onClick={() => handleToggleActive(agent)}>
													<Badge
														variant={agent.isActive ? "default" : "secondary"}
														className="cursor-pointer"
													>
														{agent.isActive ? "Active" : "Inactive"}
													</Badge>
												</button>
											)}
										</TableCell>
										<TableCell>
											<Badge variant="outline">
												{agent.databases?.length ?? 0}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDate(agent.createdAt)}
										</TableCell>
										<TableCell className="text-right">
											<div className="flex items-center justify-end gap-1">
												<Button
													variant="ghost"
													size="xs"
													title="Manage Databases"
													onClick={() => openManageDatabases(agent)}
												>
													<Database className="size-3" />
													DBs
												</Button>
												<Button
													variant="ghost"
													size="icon-xs"
													title="Regenerate API Key"
													onClick={() => openRegenConfirm(agent.id)}
												>
													<KeyRound className="size-3" />
												</Button>
												<Button
													variant="ghost"
													size="icon-xs"
													title="Delete"
													onClick={() => openDeleteConfirm(agent.id)}
												>
													<Trash2 className="size-3" />
												</Button>
											</div>
										</TableCell>
									</TableRow>

									{/* Expanded row: database assignments with policy links */}
									{expandedAgentId === agent.id && (
										<TableRow key={`${agent.id}-expanded`}>
											<TableCell colSpan={6} className="bg-muted/30 px-8 py-3">
												{agent.databases && agent.databases.length > 0 ? (
													<div className="space-y-2">
														<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
															Assigned Databases
														</p>
														<div className="flex flex-wrap gap-2">
															{agent.databases.map((da) => (
																<Link
																	key={da.id}
																	to={`/agents/${agent.id}/databases/${da.databaseId}/policies`}
																	className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
																>
																	<Shield className="size-3 text-blue-400" />
																	{da.database?.name ?? da.databaseId}
																	<span className="text-muted-foreground">
																		- Policies
																	</span>
																</Link>
															))}
														</div>
													</div>
												) : (
													<p className="text-xs text-muted-foreground">
														No databases assigned.{" "}
														<button
															className="text-primary underline-offset-4 hover:underline"
															onClick={() => openManageDatabases(agent)}
														>
															Assign databases
														</button>
													</p>
												)}
											</TableCell>
										</TableRow>
									)}
								</>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Create Agent Dialog */}
			<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create Agent</DialogTitle>
						<DialogDescription>
							Create a new AI agent. An API key will be generated that can only
							be viewed once.
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleCreate}>
						<div className="grid gap-2">
							<Label htmlFor="agent-name">Agent Name</Label>
							<Input
								id="agent-name"
								required
								placeholder="My AI Agent"
								value={agentName}
								onChange={(e) => setAgentName(e.target.value)}
								disabled={creating}
							/>
						</div>
						<DialogFooter className="mt-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => setCreateDialogOpen(false)}
								disabled={creating}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={creating}>
								{creating ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Creating...
									</>
								) : (
									"Create"
								)}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* API Key Display Dialog */}
			<Dialog
				open={keyDialogOpen}
				onOpenChange={(open) => {
					setKeyDialogOpen(open);
					if (!open) {
						setDisplayedKey("");
						setCopied(false);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>API Key Generated</DialogTitle>
						<DialogDescription>
							Copy this API key now. It will not be shown again.
						</DialogDescription>
					</DialogHeader>
					<div className="flex items-center gap-2">
						<Input
							readOnly
							value={displayedKey}
							className="font-mono text-xs"
						/>
						<Button
							variant="outline"
							size="icon"
							onClick={copyKey}
							title="Copy to clipboard"
						>
							{copied ? (
								<Check className="size-4 text-emerald-400" />
							) : (
								<Copy className="size-4" />
							)}
						</Button>
					</div>
					<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
						This key is only shown once. Store it securely.
					</div>
					<DialogFooter>
						<Button onClick={() => setKeyDialogOpen(false)}>Done</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Regenerate Key Confirmation Dialog */}
			<Dialog open={regenDialogOpen} onOpenChange={setRegenDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Regenerate API Key</DialogTitle>
						<DialogDescription>
							Are you sure you want to regenerate this agent's API key? The
							existing key will be invalidated immediately.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRegenDialogOpen(false)}
							disabled={regenerating}
						>
							Cancel
						</Button>
						<Button onClick={handleRegenerate} disabled={regenerating}>
							{regenerating ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Regenerating...
								</>
							) : (
								"Regenerate"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Agent</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this agent? This action cannot be
							undone. All associated database access and policies will also be
							removed.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeleteDialogOpen(false)}
							disabled={deleting}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleDelete}
							disabled={deleting}
						>
							{deleting ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Deleting...
								</>
							) : (
								"Delete"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Manage Databases Dialog */}
			<Dialog open={dbDialogOpen} onOpenChange={setDbDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Manage Database Access</DialogTitle>
						<DialogDescription>
							Select which databases this agent can access.
						</DialogDescription>
					</DialogHeader>
					{databases.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No databases available. Create a database first.
						</p>
					) : (
						<div className="max-h-64 space-y-2 overflow-y-auto">
							{databases.map((db) => (
								<label
									key={db.id}
									className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50"
								>
									<Checkbox
										checked={selectedDatabaseIds.includes(db.id)}
										onCheckedChange={() => toggleDatabaseSelection(db.id)}
									/>
									<div className="flex-1">
										<p className="text-sm font-medium">{db.name}</p>
										<p className="text-xs text-muted-foreground">
											{db.host}:{db.port}/{db.dbName}
										</p>
									</div>
								</label>
							))}
						</div>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDbDialogOpen(false)}
							disabled={savingDbs}
						>
							Cancel
						</Button>
						<Button onClick={handleSaveDatabases} disabled={savingDbs}>
							{savingDbs ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Saving...
								</>
							) : (
								"Save"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
