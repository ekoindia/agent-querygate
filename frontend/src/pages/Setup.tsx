import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Database, Loader2, CheckCircle2 } from "lucide-react";

export function Setup() {
	const navigate = useNavigate();
	const { user, refresh } = useAuth();

	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [alreadySetUp, setAlreadySetUp] = useState(false);
	const [checkingStatus, setCheckingStatus] = useState(true);

	useEffect(() => {
		if (user) {
			navigate("/dashboard", { replace: true });
			return;
		}

		// Check if setup is already done
		const checkSetup = async () => {
			try {
				const status = await api.get<{ needsSetup: boolean }>("/auth/setup-status");
				if (!status.needsSetup) {
					setAlreadySetUp(true);
				}
			} catch {
				// If the endpoint fails, allow setup attempt
			} finally {
				setCheckingStatus(false);
			}
		};

		checkSetup();
	}, [user, navigate]);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setError("");

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		if (password.length < 8) {
			setError("Password must be at least 8 characters");
			return;
		}

		setIsLoading(true);

		try {
			await api.post("/auth/setup", { name, email, password });
			await refresh();
			navigate("/dashboard", { replace: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Setup failed");
		} finally {
			setIsLoading(false);
		}
	};

	if (checkingStatus) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-background px-4">
			{/* Subtle background grid pattern */}
			<div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />

			<div className="relative z-10 w-full max-w-sm">
				{/* Logo / branding */}
				<div className="mb-8 flex flex-col items-center gap-3">
					<div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
						<Database className="size-6 text-primary" />
					</div>
					<div className="text-center">
						<h1 className="text-xl font-semibold tracking-tight text-foreground">
							Eko MySQL Agent
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Initial Setup
						</p>
					</div>
				</div>

				{alreadySetUp ? (
					<Card>
						<CardContent className="flex flex-col items-center gap-4 pt-6">
							<div className="flex size-12 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/30">
								<CheckCircle2 className="size-6 text-green-500" />
							</div>
							<div className="text-center">
								<p className="font-medium text-foreground">Setup Complete</p>
								<p className="mt-1 text-sm text-muted-foreground">
									An admin account already exists.
								</p>
							</div>
							<Button
								className="w-full"
								size="lg"
								onClick={() => navigate("/login")}
							>
								Go to Login
							</Button>
						</CardContent>
					</Card>
				) : (
					<Card>
						<CardHeader>
							<CardTitle>Create Admin Account</CardTitle>
							<CardDescription>
								Set up the first superadmin account to get started
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleSubmit}>
								<div className="flex flex-col gap-4">
									<div className="grid gap-2">
										<Label htmlFor="name">Full Name</Label>
										<Input
											id="name"
											type="text"
											placeholder="John Doe"
											autoComplete="name"
											required
											value={name}
											onChange={(e) => setName(e.target.value)}
											disabled={isLoading}
										/>
									</div>

									<div className="grid gap-2">
										<Label htmlFor="email">Email</Label>
										<Input
											id="email"
											type="email"
											placeholder="admin@example.com"
											autoComplete="email"
											required
											value={email}
											onChange={(e) => setEmail(e.target.value)}
											disabled={isLoading}
										/>
									</div>

									<div className="grid gap-2">
										<Label htmlFor="password">Password</Label>
										<Input
											id="password"
											type="password"
											placeholder="Minimum 8 characters"
											autoComplete="new-password"
											required
											minLength={8}
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											disabled={isLoading}
										/>
									</div>

									<div className="grid gap-2">
										<Label htmlFor="confirm-password">Confirm Password</Label>
										<Input
											id="confirm-password"
											type="password"
											placeholder="Re-enter your password"
											autoComplete="new-password"
											required
											value={confirmPassword}
											onChange={(e) => setConfirmPassword(e.target.value)}
											disabled={isLoading}
										/>
									</div>

									{error && (
										<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
											{error}
										</div>
									)}

									<Button
										type="submit"
										size="lg"
										className="mt-1 w-full"
										disabled={isLoading}
									>
										{isLoading ? (
											<>
												<Loader2 className="size-4 animate-spin" />
												Creating account...
											</>
										) : (
											"Create Account"
										)}
									</Button>
								</div>
							</form>

							<div className="mt-4 text-center text-sm text-muted-foreground">
								Already set up?{" "}
								<Link
									to="/login"
									className="font-medium text-foreground underline-offset-4 hover:underline"
								>
									Sign in
								</Link>
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
