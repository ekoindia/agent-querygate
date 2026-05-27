import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
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
import { Users as UsersIcon, Plus, Loader2, Shield } from "lucide-react";
import type { User } from "@/types";

interface CreateUserForm {
	name: string;
	email: string;
	password: string;
	role: "admin" | "user";
}

const emptyCreateForm: CreateUserForm = {
	name: "",
	email: "",
	password: "",
	role: "user",
};

/**
 * Users management page. Admin-only. Lists users, creates new users, toggles active status, and changes roles.
 */
export function Users() {
	const { user: currentUser } = useAuth();
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	// Create user dialog
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [form, setForm] = useState<CreateUserForm>(emptyCreateForm);
	const [creating, setCreating] = useState(false);

	// Role change dialog
	const [roleDialogOpen, setRoleDialogOpen] = useState(false);
	const [roleChangeUser, setRoleChangeUser] = useState<User | null>(null);
	const [newRole, setNewRole] = useState<"admin" | "user">("user");
	const [changingRole, setChangingRole] = useState(false);

	// Toggling active state
	const [togglingId, setTogglingId] = useState<string | null>(null);

	const fetchUsers = async () => {
		try {
			const data = await api.get<User[]>("/users");
			setUsers(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load users");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchUsers();
	}, []);

	const handleCreate = async (event: FormEvent) => {
		event.preventDefault();

		if (form.password.length < 8) {
			toast.error("Password must be at least 8 characters");
			return;
		}

		setCreating(true);

		try {
			await api.post("/users", form);
			toast.success("User created successfully");
			setCreateDialogOpen(false);
			setForm(emptyCreateForm);
			await fetchUsers();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to create user");
		} finally {
			setCreating(false);
		}
	};

	const handleToggleActive = async (targetUser: User) => {
		if (targetUser.role === "superadmin") {
			toast.error("Cannot modify superadmin users");
			return;
		}
		setTogglingId(targetUser.id);

		try {
			await api.put(`/users/${targetUser.id}`, {
				isActive: !targetUser.isActive,
			});
			toast.success(
				`User ${targetUser.isActive ? "deactivated" : "activated"} successfully`,
			);
			await fetchUsers();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to update user");
		} finally {
			setTogglingId(null);
		}
	};

	const openRoleChange = (targetUser: User) => {
		setRoleChangeUser(targetUser);
		setNewRole(targetUser.role === "admin" ? "user" : "admin");
		setRoleDialogOpen(true);
	};

	const handleRoleChange = async () => {
		if (!roleChangeUser) return;
		setChangingRole(true);

		try {
			await api.put(`/users/${roleChangeUser.id}`, { role: newRole });
			toast.success(`Role changed to ${newRole}`);
			setRoleDialogOpen(false);
			setRoleChangeUser(null);
			await fetchUsers();
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to change role",
			);
		} finally {
			setChangingRole(false);
		}
	};

	const roleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
		switch (role) {
			case "superadmin":
				return "default";
			case "admin":
				return "secondary";
			default:
				return "outline";
		}
	};

	const isSuperadmin = (targetUser: User) => targetUser.role === "superadmin";
	const isSelf = (targetUser: User) => targetUser.id === currentUser?.id;

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
						Users
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage admin panel user accounts
					</p>
				</div>
				<Button onClick={() => setCreateDialogOpen(true)}>
					<Plus className="size-4" />
					Create User
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
			) : users.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 py-16">
					<UsersIcon className="mb-3 size-10 text-muted-foreground/50" />
					<p className="text-sm text-muted-foreground">No users found</p>
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Role</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Created</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{users.map((targetUser) => (
								<TableRow key={targetUser.id}>
									<TableCell className="font-medium">
										<div className="flex items-center gap-2">
											{targetUser.name}
											{isSelf(targetUser) && (
												<Badge variant="outline" className="text-[10px]">
													You
												</Badge>
											)}
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{targetUser.email}
									</TableCell>
									<TableCell>
										<Badge variant={roleBadgeVariant(targetUser.role)}>
											{targetUser.role}
										</Badge>
									</TableCell>
									<TableCell>
										{togglingId === targetUser.id ? (
											<Loader2 className="size-4 animate-spin text-muted-foreground" />
										) : (
											<Badge
												variant={targetUser.isActive ? "default" : "secondary"}
											>
												{targetUser.isActive ? "Active" : "Inactive"}
											</Badge>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{formatDate(targetUser.createdAt)}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex items-center justify-end gap-1">
											{!isSuperadmin(targetUser) && !isSelf(targetUser) && (
												<>
													<Button
														variant="ghost"
														size="xs"
														onClick={() => handleToggleActive(targetUser)}
														disabled={togglingId === targetUser.id}
													>
														{targetUser.isActive ? "Deactivate" : "Activate"}
													</Button>
													<Button
														variant="ghost"
														size="xs"
														onClick={() => openRoleChange(targetUser)}
													>
														<Shield className="size-3" />
														Role
													</Button>
												</>
											)}
											{isSuperadmin(targetUser) && (
												<span className="text-xs text-muted-foreground">
													Protected
												</span>
											)}
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Create User Dialog */}
			<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Create User</DialogTitle>
						<DialogDescription>
							Add a new admin panel user account.
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={handleCreate}>
						<div className="flex flex-col gap-4">
							<div className="grid gap-2">
								<Label htmlFor="user-name">Full Name</Label>
								<Input
									id="user-name"
									required
									placeholder="Jane Doe"
									value={form.name}
									onChange={(e) => setForm({ ...form, name: e.target.value })}
									disabled={creating}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="user-email">Email</Label>
								<Input
									id="user-email"
									type="email"
									required
									placeholder="jane@example.com"
									value={form.email}
									onChange={(e) =>
										setForm({ ...form, email: e.target.value })
									}
									disabled={creating}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="user-password">Password</Label>
								<Input
									id="user-password"
									type="password"
									required
									minLength={8}
									placeholder="Minimum 8 characters"
									value={form.password}
									onChange={(e) =>
										setForm({ ...form, password: e.target.value })
									}
									disabled={creating}
								/>
							</div>

							<div className="grid gap-2">
								<Label>Role</Label>
								<Select
									value={form.role}
									onValueChange={(value) =>
										setForm({ ...form, role: value as "admin" | "user" })
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="user">User</SelectItem>
										<SelectItem value="admin">Admin</SelectItem>
									</SelectContent>
								</Select>
							</div>
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

			{/* Change Role Dialog */}
			<Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Change User Role</DialogTitle>
						<DialogDescription>
							Change the role for {roleChangeUser?.name} from{" "}
							<strong>{roleChangeUser?.role}</strong> to{" "}
							<strong>{newRole}</strong>.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRoleDialogOpen(false)}
							disabled={changingRole}
						>
							Cancel
						</Button>
						<Button onClick={handleRoleChange} disabled={changingRole}>
							{changingRole ? (
								<>
									<Loader2 className="size-4 animate-spin" />
									Changing...
								</>
							) : (
								"Change Role"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
