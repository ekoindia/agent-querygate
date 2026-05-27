import { useEffect, useState, type FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Shield,
	Plus,
	Pencil,
	Trash2,
	Loader2,
	ArrowLeft,
	Search,
} from "lucide-react";
import type { Policy, Agent, Database } from "@/types";

interface IntrospectionResult {
	tables: string[];
	schema: Record<string, string[]>;
}

const OPERATIONS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

interface PolicyFormData {
	tableName: string;
	allowedOperations: string[];
	allowedColumns: string[] | null;
	rowLimit: number | null;
	whereClauseRequired: boolean;
}

const emptyPolicyForm: PolicyFormData = {
	tableName: "",
	allowedOperations: [],
	allowedColumns: null,
	rowLimit: null,
	whereClauseRequired: false,
};

/**
 * Agent Policies page. Manages table-level access policies for a specific agent-database pair.
 */
export function AgentPolicies() {
	const { agentId, dbId } = useParams<{ agentId: string; dbId: string }>();

	const [policies, setPolicies] = useState<Policy[]>([]);
	const [agent, setAgent] = useState<Agent | null>(null);
	const [database, setDatabase] = useState<Database | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Introspection
	const [introspection, setIntrospection] = useState<IntrospectionResult | null>(null);
	const [introspecting, setIntrospecting] = useState(false);

	// Policy dialog
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<PolicyFormData>(emptyPolicyForm);
	const [saving, setSaving] = useState(false);
	const [allColumnsToggle, setAllColumnsToggle] = useState(true);

	// Delete confirmation
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	const fetchData = async () => {
		if (!agentId || !dbId) return;

		try {
			const [policiesData, agentData, dbData] = await Promise.all([
				api.get<Policy[]>(`/agents/${agentId}/databases/${dbId}/policies`),
				api.get<Agent>(`/agents/${agentId}`),
				api.get<Database>(`/databases/${dbId}`),
			]);
			setPolicies(policiesData);
			setAgent(agentData);
			setDatabase(dbData);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load data");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchData();
	}, [agentId, dbId]);

	const handleIntrospect = async () => {
		if (!dbId) return;
		setIntrospecting(true);

		try {
			const result = await api.get<IntrospectionResult>(
				`/databases/${dbId}/introspect`,
			);
			setIntrospection(result);
			toast.success(
				`Found ${result.tables.length} table${result.tables.length !== 1 ? "s" : ""}`,
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Introspection failed",
			);
		} finally {
			setIntrospecting(false);
		}
	};

	const openCreate = () => {
		setEditingId(null);
		setForm(emptyPolicyForm);
		setAllColumnsToggle(true);
		setDialogOpen(true);
	};

	const openEdit = (policy: Policy) => {
		setEditingId(policy.id);
		const hasAllColumns = policy.allowedColumns === null;
		setAllColumnsToggle(hasAllColumns);
		setForm({
			tableName: policy.tableName,
			allowedOperations: [...policy.allowedOperations],
			allowedColumns: hasAllColumns ? null : [...(policy.allowedColumns ?? [])],
			rowLimit: policy.rowLimit,
			whereClauseRequired: policy.whereClauseRequired,
		});
		setDialogOpen(true);
	};

	const toggleOperation = (op: string) => {
		setForm((prev) => ({
			...prev,
			allowedOperations: prev.allowedOperations.includes(op)
				? prev.allowedOperations.filter((o) => o !== op)
				: [...prev.allowedOperations, op],
		}));
	};

	const toggleColumn = (col: string) => {
		setForm((prev) => {
			const current = prev.allowedColumns ?? [];
			const updated = current.includes(col)
				? current.filter((c) => c !== col)
				: [...current, col];
			return { ...prev, allowedColumns: updated };
		});
	};

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		if (form.allowedOperations.length === 0) {
			toast.error("Select at least one operation");
			return;
		}
		setSaving(true);

		const payload = {
			...form,
			allowedColumns: allColumnsToggle ? null : form.allowedColumns,
		};

		try {
			if (editingId) {
				await api.put(`/policies/${editingId}`, payload);
				toast.success("Policy updated successfully");
			} else {
				await api.post(
					`/agents/${agentId}/databases/${dbId}/policies`,
					payload,
				);
				toast.success("Policy created successfully");
			}
			setDialogOpen(false);
			setForm(emptyPolicyForm);
			setEditingId(null);
			await fetchData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Operation failed");
		} finally {
			setSaving(false);
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
			await api.del(`/policies/${deletingId}`);
			toast.success("Policy deleted successfully");
			setDeleteDialogOpen(false);
			setDeletingId(null);
			await fetchData();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Delete failed");
		} finally {
			setDeleting(false);
		}
	};

	const tableColumns = introspection?.schema[form.tableName] ?? [];

	return (
		<div>
			{/* Breadcrumb / back nav */}
			<div className="mb-4">
				<Link
					to="/agents"
					className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<ArrowLeft className="size-3" />
					Back to Agents
				</Link>
			</div>

			{/* Page header */}
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
						Access Policies
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{agent && database
							? `${agent.name} → ${database.name}`
							: "Loading..."}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" onClick={handleIntrospect} disabled={introspecting}>
						{introspecting ? (
							<>
								<Loader2 className="size-4 animate-spin" />
								Introspecting...
							</>
						) : (
							<>
								<Search className="size-4" />
								Introspect Database
							</>
						)}
					</Button>
					<Button onClick={openCreate}>
						<Plus className="size-4" />
						Add Policy
					</Button>
				</div>
			</div>

			{/* Error state */}
			{error && (
				<div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{error}
				</div>
			)}

			{/* Introspection result info */}
			{introspection && (
				<div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-sm text-blue-400">
					Database introspected: {introspection.tables.length} table
					{introspection.tables.length !== 1 ? "s" : ""} found (
					{introspection.tables.join(", ")})
				</div>
			)}

			{/* Policies Table */}
			{loading ? (
				<div className="space-y-3">
					{Array.from({ length: 3 }).map((_, index) => (
						<Skeleton key={index} className="h-12 w-full rounded-lg" />
					))}
				</div>
			) : policies.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 py-16">
					<Shield className="mb-3 size-10 text-muted-foreground/50" />
					<p className="text-sm text-muted-foreground">
						No policies configured for this agent-database pair
					</p>
					<Button variant="outline" className="mt-4" onClick={openCreate}>
						<Plus className="size-4" />
						Add your first policy
					</Button>
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Table Name</TableHead>
								<TableHead>Operations</TableHead>
								<TableHead>Columns</TableHead>
								<TableHead>Row Limit</TableHead>
								<TableHead>WHERE Required</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{policies.map((policy) => (
								<TableRow key={policy.id}>
									<TableCell className="font-medium font-mono text-xs">
										{policy.tableName}
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{policy.allowedOperations.map((op) => (
												<Badge
													key={op}
													variant={
														op === "SELECT"
															? "default"
															: op === "DELETE"
																? "destructive"
																: "secondary"
													}
													className="text-[10px]"
												>
													{op}
												</Badge>
											))}
										</div>
									</TableCell>
									<TableCell>
										{policy.allowedColumns === null ? (
											<Badge variant="outline" className="text-[10px]">
												All
											</Badge>
										) : (
											<span className="text-xs text-muted-foreground">
												{policy.allowedColumns.length} column
												{policy.allowedColumns.length !== 1 ? "s" : ""}
											</span>
										)}
									</TableCell>
									<TableCell>
										{policy.rowLimit !== null ? (
											<Badge variant="outline">{policy.rowLimit}</Badge>
										) : (
											<span className="text-xs text-muted-foreground">
												None
											</span>
										)}
									</TableCell>
									<TableCell>
										<Badge
											variant={
												policy.whereClauseRequired
													? "default"
													: "secondary"
											}
											className="text-[10px]"
										>
											{policy.whereClauseRequired ? "Yes" : "No"}
										</Badge>
									</TableCell>
									<TableCell className="text-right">
										<div className="flex items-center justify-end gap-1">
											<Button
												variant="ghost"
												size="icon-xs"
												title="Edit"
												onClick={() => openEdit(policy)}
											>
												<Pencil className="size-3" />
											</Button>
											<Button
												variant="ghost"
												size="icon-xs"
												title="Delete"
												onClick={() => openDeleteConfirm(policy.id)}
											>
												<Trash2 className="size-3" />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Create / Edit Policy Dialog */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							{editingId ? "Edit Policy" : "Add Policy"}
						</DialogTitle>
						<DialogDescription>
							{editingId
								? "Update the table access policy."
								: "Configure table-level access for this agent."}
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit}>
						<div className="flex flex-col gap-4">
							{/* Table Name */}
							<div className="grid gap-2">
								<Label htmlFor="policy-table">Table Name</Label>
								{introspection && introspection.tables.length > 0 ? (
									<Select
										value={form.tableName}
										onValueChange={(value) =>
											setForm((prev) => ({
												...prev,
												tableName: value as string,
												allowedColumns: null,
											}))
										}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select a table" />
										</SelectTrigger>
										<SelectContent>
											{introspection.tables.map((tableName) => (
												<SelectItem key={tableName} value={tableName}>
													{tableName}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								) : (
									<Input
										id="policy-table"
										required
										placeholder="table_name"
										value={form.tableName}
										onChange={(e) =>
											setForm({ ...form, tableName: e.target.value })
										}
										disabled={saving}
									/>
								)}
							</div>

							{/* Operations */}
							<div className="grid gap-2">
								<Label>Allowed Operations</Label>
								<div className="flex flex-wrap gap-2">
									{OPERATIONS.map((op) => (
										<label
											key={op}
											className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50"
										>
											<Checkbox
												checked={form.allowedOperations.includes(op)}
												onCheckedChange={() => toggleOperation(op)}
											/>
											{op}
										</label>
									))}
								</div>
							</div>

							{/* Allowed Columns */}
							<div className="grid gap-2">
								<div className="flex items-center justify-between">
									<Label>Allowed Columns</Label>
									<label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
										<Checkbox
											checked={allColumnsToggle}
											onCheckedChange={(checked) => {
												const isChecked = checked === true;
												setAllColumnsToggle(isChecked);
												if (isChecked) {
													setForm((prev) => ({
														...prev,
														allowedColumns: null,
													}));
												} else {
													setForm((prev) => ({
														...prev,
														allowedColumns: [],
													}));
												}
											}}
										/>
										All columns
									</label>
								</div>
								{!allColumnsToggle && tableColumns.length > 0 && (
									<div className="max-h-32 overflow-y-auto rounded-md border p-2">
										<div className="flex flex-wrap gap-1.5">
											{tableColumns.map((col) => (
												<label
													key={col}
													className="flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-muted/50"
												>
													<Checkbox
														checked={
															form.allowedColumns?.includes(col) ?? false
														}
														onCheckedChange={() => toggleColumn(col)}
													/>
													{col}
												</label>
											))}
										</div>
									</div>
								)}
								{!allColumnsToggle && tableColumns.length === 0 && (
									<p className="text-xs text-muted-foreground">
										Introspect the database to see available columns, or
										the table selection above does not match introspected data.
									</p>
								)}
							</div>

							{/* Row Limit */}
							<div className="grid gap-2">
								<Label htmlFor="policy-rowlimit">Row Limit (optional)</Label>
								<Input
									id="policy-rowlimit"
									type="number"
									placeholder="No limit"
									min={0}
									value={form.rowLimit ?? ""}
									onChange={(e) =>
										setForm({
											...form,
											rowLimit: e.target.value
												? parseInt(e.target.value)
												: null,
										})
									}
									disabled={saving}
								/>
							</div>

							{/* WHERE Required */}
							<label className="flex cursor-pointer items-center gap-2 text-sm">
								<Checkbox
									checked={form.whereClauseRequired}
									onCheckedChange={(checked) =>
										setForm({
											...form,
											whereClauseRequired: checked === true,
										})
									}
								/>
								Require WHERE clause on queries
							</label>
						</div>

						<DialogFooter className="mt-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => setDialogOpen(false)}
								disabled={saving}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={saving}>
								{saving ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Saving...
									</>
								) : editingId ? (
									"Update"
								) : (
									"Create"
								)}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete Policy</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this policy? The agent will lose
							access to this table according to these rules.
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
		</div>
	);
}
