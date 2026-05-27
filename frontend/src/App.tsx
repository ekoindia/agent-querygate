import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";

import { Login } from "@/pages/Login";
import { Setup } from "@/pages/Setup";
import { Dashboard } from "@/pages/Dashboard";
import { Databases } from "@/pages/Databases";
import { Agents } from "@/pages/Agents";
import { AgentPolicies } from "@/pages/AgentPolicies";
import { Audit } from "@/pages/Audit";
import { Users } from "@/pages/Users";
import { Settings } from "@/pages/Settings";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
	const { user, loading } = useAuth();

	if (loading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (!user) {
		return <Navigate to="/login" replace />;
	}

	return <>{children}</>;
}

function AdminRoute({ children }: { children: ReactNode }) {
	const { user } = useAuth();

	if (user?.role !== "superadmin" && user?.role !== "admin") {
		return <Navigate to="/dashboard" replace />;
	}

	return <>{children}</>;
}

function AppRoutes() {
	return (
		<Routes>
			<Route path="/login" element={<Login />} />
			<Route path="/setup" element={<Setup />} />

			<Route
				path="/"
				element={
					<ProtectedRoute>
						<Layout />
					</ProtectedRoute>
				}
			>
				<Route index element={<Navigate to="/dashboard" replace />} />
				<Route path="dashboard" element={<Dashboard />} />
				<Route path="databases" element={<Databases />} />
				<Route path="agents" element={<Agents />} />
				<Route
					path="agents/:agentId/databases/:dbId/policies"
					element={<AgentPolicies />}
				/>
				<Route path="audit" element={<Audit />} />
				<Route
					path="users"
					element={
						<AdminRoute>
							<Users />
						</AdminRoute>
					}
				/>
				<Route path="settings" element={<Settings />} />
			</Route>

			<Route path="*" element={<Navigate to="/dashboard" replace />} />
		</Routes>
	);
}

export default function App() {
	return (
		<ThemeProvider defaultTheme="dark">
			<BrowserRouter>
				<AuthProvider>
					<AppRoutes />
					<Toaster />
				</AuthProvider>
			</BrowserRouter>
		</ThemeProvider>
	);
}
