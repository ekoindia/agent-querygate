import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
	Database as DatabaseIcon,
	Plus,
	Pencil,
	Trash2,
	Loader2,
	PlugZap,
} from "lucide-react";
import type { Database } from "@/types";

interface DatabaseFormData {
	name: string;
	host: string;
	port: number;
	dbName: string;
	username: string;
	password: string;
}

const emptyForm: DatabaseFormData = {
	name: "",
	host: "",
	port: 3306,
	dbName: "",
	username: "",
	password: "",
};

/**
 * Databases management page. Lists, creates, edits, deletes, and tests database connections.
 */
export function Databases() {
	const [databases, setDatabases] = useState<Database[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Dialog state
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<DatabaseFormData>(emptyForm);
	const [saving, setSaving] = useState(false);

	// Delete confirmation
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);

	// Test connection
	const [testingId, setTestingId] = useState<string | null>(null);

	const fetchDatabases = async () => {
		try {
			const data = await api.get<{ databases: Database[] }>("/databases");
			setDatabases(data.databases);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load databases");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchDatabases();
	}, []);

	const openCreate = () => {
		setEditingId(null);
		setForm(emptyForm);
		setDialogOpen(true);
	};

	const openEdit = (db: Database) => {
		setEditingId(db.id);
		setForm({
			name: db.name,
			host: db.host,
			port: db.port,
			dbName: db.dbName,
			username: db.username,
			password: "",
		});
		setDialogOpen(true);
	};

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setSaving(true);

		try {
			if (editingId) {
				await api.put(`/databases/${editingId}`, form);
				toast.success("Database updated successfully");
			} else {
				await api.post("/databases", form);
				toast.success("Database created successfully");
			}
			setDialogOpen(false);
			setForm(emptyForm);
			setEditingId(null);
			await fetchDatabases();
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
			await api.del(`/databases/${deletingId}`);
			toast.success("Database deleted successfully");
			setDeleteDialogOpen(false);
			setDeletingId(null);
			await fetchDatabases();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Delete failed");
		} finally {
			setDeleting(false);
		}
	};

	const handleTestConnection = async (id: string) => {
		setTestingId(id);

		try {
			await api.post(`/databases/${id}/test-connection`);
			toast.success("Connection successful");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Connection failed");
		} finally {
			setTestingId(null);
		}
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
						Databases
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage your MySQL database connections
					</p>
				</div>
				<Button onClick={openCreate}>
					<Plus className="size-4" />
					Add Database
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
			) : databases.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 py-16">
					<DatabaseIcon className="mb-3 size-10 text-muted-foreground/50" />
					<p className="text-sm text-muted-foreground">No databases configured</p>
					<Button variant="outline" className="mt-4" onClick={openCreate}>
						<Plus className="size-4" />
						Add your first database
					</Button>
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Host</TableHead>
								<TableHead>Port</TableHead>
								<TableHead>Database</TableHead>
								<TableHead>Username</TableHead>
								<TableHead>Created</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{databases.map((db) => (
								<TableRow key={db.id}>
									<TableCell className="font-medium">{db.name}</TableCell>
									<TableCell>
										<Badge variant="outline">{db.host}</Badge>
									</TableCell>
									<TableCell>{db.port}</TableCell>
									<TableCell>{db.dbName}</TableCell>
									<TableCell>{db.username}</TableCell>
									<TableCell className="text-muted-foreground">
										{formatDate(db.createdAt)}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex items-center justify-end gap-1">
											<Button
												variant="ghost"
												size="icon-xs"
												title="Test Connection"
												disabled={testingId === db.id}
												onClick={() => handleTestConnection(db.id)}
											>
												{testingId === db.id ? (
													<Loader2 className="size-3 animate-spin" />
												) : (
													<PlugZap className="size-3" />
												)}
											</Button>
											<Button
												variant="ghost"
												size="icon-xs"
												title="Edit"
												onClick={() => openEdit(db)}
											>
												<Pencil className="size-3" />
											</Button>
											<Button
												variant="ghost"
												size="icon-xs"
												title="Delete"
												onClick={() => openDeleteConfirm(db.id)}
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

			{/* Create / Edit Dialog */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							{editingId ? "Edit Database" : "Add Database"}
						</DialogTitle>
						<DialogDescription>
							{editingId
								? "Update the database connection details."
								: "Configure a new MySQL database connection."}
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleSubmit}>
						<div className="flex flex-col gap-4">
							<div className="grid gap-2">
								<Label htmlFor="db-name">Connection Name</Label>
								<Input
									id="db-name"
									required
									placeholder="My Production DB"
									value={form.name}
									onChange={(e) => setForm({ ...form, name: e.target.value })}
									disabled={saving}
								/>
							</div>

							<div className="grid grid-cols-3 gap-3">
								<div className="col-span-2 grid gap-2">
									<Label htmlFor="db-host">Host</Label>
									<Input
										id="db-host"
										required
										placeholder="localhost"
										value={form.host}
										onChange={(e) => setForm({ ...form, host: e.target.value })}
										disabled={saving}
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="db-port">Port</Label>
									<Input
										id="db-port"
										type="number"
										required
										placeholder="3306"
										value={form.port}
										onChange={(e) =>
											setForm({ ...form, port: parseInt(e.target.value) || 3306 })
										}
										disabled={saving}
									/>
								</div>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="db-database">Database Name</Label>
								<Input
									id="db-database"
									required
									placeholder="my_database"
									value={form.dbName}
									onChange={(e) => setForm({ ...form, dbName: e.target.value })}
									disabled={saving}
								/>
							</div>

							<div className="grid grid-cols-2 gap-3">
								<div className="grid gap-2">
									<Label htmlFor="db-username">Username</Label>
									<Input
										id="db-username"
										required
										placeholder="root"
										value={form.username}
										onChange={(e) =>
											setForm({ ...form, username: e.target.value })
										}
										disabled={saving}
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="db-password">Password</Label>
									<Input
										id="db-password"
										type="password"
										placeholder={editingId ? "Leave blank to keep" : "Enter password"}
										required={!editingId}
										value={form.password}
										onChange={(e) =>
											setForm({ ...form, password: e.target.value })
										}
										disabled={saving}
									/>
								</div>
							</div>
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
						<DialogTitle>Delete Database</DialogTitle>
						<DialogDescription>
							Are you sure you want to delete this database connection? This
							action cannot be undone. All associated agent access and policies
							will also be removed.
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
