import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Loader2, User, Lock } from "lucide-react";

/**
 * Settings page. Displays current user info and provides a change-password form.
 */
export function Settings() {
	const { user } = useAuth();

	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

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

	const handleChangePassword = async (event: FormEvent) => {
		event.preventDefault();
		setError("");

		if (newPassword !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		if (newPassword.length < 8) {
			setError("New password must be at least 8 characters");
			return;
		}

		setSaving(true);

		try {
			await api.put(`/users/${user?.id}`, {
				currentPassword,
				password: newPassword,
			});
			toast.success("Password changed successfully");
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to change password";
			setError(message);
			toast.error(message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div>
			{/* Page header */}
			<div className="mb-6">
				<h1 className="text-2xl font-semibold tracking-tight text-foreground">
					Settings
				</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Manage your account settings
				</p>
			</div>

			<div className="grid gap-6 lg:max-w-2xl">
				{/* Profile Info Card */}
				<Card>
					<CardHeader>
						<div className="flex items-center gap-3">
							<div className="flex size-10 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
								<User className="size-5 text-primary" />
							</div>
							<div>
								<CardTitle>Profile</CardTitle>
								<CardDescription>Your account information</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<div>
									<p className="text-xs text-muted-foreground">Name</p>
									<p className="text-sm font-medium">{user?.name}</p>
								</div>
							</div>
							<Separator />
							<div className="flex items-center justify-between">
								<div>
									<p className="text-xs text-muted-foreground">Email</p>
									<p className="text-sm font-medium">{user?.email}</p>
								</div>
							</div>
							<Separator />
							<div className="flex items-center justify-between">
								<div>
									<p className="text-xs text-muted-foreground">Role</p>
									<Badge
										variant={roleBadgeVariant(user?.role ?? "user")}
										className="mt-1"
									>
										{user?.role}
									</Badge>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Change Password Card */}
				<Card>
					<CardHeader>
						<div className="flex items-center gap-3">
							<div className="flex size-10 items-center justify-center rounded-full bg-amber-400/10 ring-1 ring-amber-400/20">
								<Lock className="size-5 text-amber-400" />
							</div>
							<div>
								<CardTitle>Change Password</CardTitle>
								<CardDescription>
									Update your account password
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleChangePassword}>
							<div className="flex flex-col gap-4">
								<div className="grid gap-2">
									<Label htmlFor="current-password">Current Password</Label>
									<Input
										id="current-password"
										type="password"
										required
										placeholder="Enter current password"
										autoComplete="current-password"
										value={currentPassword}
										onChange={(e) => setCurrentPassword(e.target.value)}
										disabled={saving}
									/>
								</div>

								<div className="grid gap-2">
									<Label htmlFor="new-password">New Password</Label>
									<Input
										id="new-password"
										type="password"
										required
										minLength={8}
										placeholder="Minimum 8 characters"
										autoComplete="new-password"
										value={newPassword}
										onChange={(e) => setNewPassword(e.target.value)}
										disabled={saving}
									/>
								</div>

								<div className="grid gap-2">
									<Label htmlFor="confirm-new-password">
										Confirm New Password
									</Label>
									<Input
										id="confirm-new-password"
										type="password"
										required
										minLength={8}
										placeholder="Re-enter new password"
										autoComplete="new-password"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										disabled={saving}
									/>
								</div>

								{error && (
									<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
										{error}
									</div>
								)}

								<Button
									type="submit"
									className="w-fit"
									disabled={saving}
								>
									{saving ? (
										<>
											<Loader2 className="size-4 animate-spin" />
											Saving...
										</>
									) : (
										"Change Password"
									)}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
