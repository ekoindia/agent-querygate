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
import { Database, Loader2 } from "lucide-react";

export function Login() {
	const navigate = useNavigate();
	const { user, login } = useAuth();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [needsSetup, setNeedsSetup] = useState(false);

	useEffect(() => {
		if (user) {
			navigate("/dashboard", { replace: true });
			return;
		}

		// Check if setup is needed (no users exist yet)
		const checkSetup = async () => {
			try {
				await api.get("/auth/me");
			} catch {
				// If 401 and no users, show setup link
				try {
					const status = await api.get<{ needsSetup: boolean }>("/auth/setup-status");
					if (status.needsSetup) {
						setNeedsSetup(true);
					}
				} catch {
					// Setup status endpoint may not exist; ignore
				}
			}
		};

		checkSetup();
	}, [user, navigate]);

	const handleSubmit = async (event: FormEvent) => {
		event.preventDefault();
		setError("");
		setIsLoading(true);

		try {
			await login(email, password);
			navigate("/dashboard", { replace: true });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed");
		} finally {
			setIsLoading(false);
		}
	};

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
							Connector Service Admin
						</p>
					</div>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Sign in</CardTitle>
						<CardDescription>
							Enter your credentials to access the admin panel
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit}>
							<div className="flex flex-col gap-5">
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
										placeholder="Enter your password"
										autoComplete="current-password"
										required
										value={password}
										onChange={(e) => setPassword(e.target.value)}
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
									className="w-full"
									disabled={isLoading}
								>
									{isLoading ? (
										<>
											<Loader2 className="size-4 animate-spin" />
											Signing in...
										</>
									) : (
										"Sign in"
									)}
								</Button>
							</div>
						</form>

						{needsSetup && (
							<div className="mt-4 rounded-lg border border-sidebar-primary/30 bg-sidebar-primary/10 px-3 py-2 text-center text-sm">
								<span className="text-muted-foreground">First time? </span>
								<Link
									to="/setup"
									className="font-medium text-sidebar-primary underline-offset-4 hover:underline"
								>
									Create your admin account
								</Link>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
