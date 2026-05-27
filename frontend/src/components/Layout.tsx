import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
	LayoutDashboard,
	Database,
	Bot,
	FileText,
	Users,
	Settings,
	LogOut,
	Menu,
	X,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
	to: string;
	label: string;
	icon: typeof LayoutDashboard;
}

const navItems: NavItem[] = [
	{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/databases", label: "Databases", icon: Database },
	{ to: "/agents", label: "Agents", icon: Bot },
	{ to: "/audit", label: "Audit Log", icon: FileText },
];

const adminItems: NavItem[] = [
	{ to: "/users", label: "Users", icon: Users },
];

/**
 * Generates the className for a navigation link based on its active state.
 */
function navLinkClass(isActive: boolean): string {
	const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors";
	return isActive
		? `${base} bg-sidebar-accent text-sidebar-accent-foreground font-medium`
		: `${base} text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground`;
}

/**
 * Maps a user role to a badge variant for visual distinction.
 */
function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
	switch (role) {
		case "superadmin":
			return "default";
		case "admin":
			return "secondary";
		default:
			return "outline";
	}
}

export function Layout() {
	const { user, logout } = useAuth();
	const [sidebarOpen, setSidebarOpen] = useState(false);

	const isAdmin = user?.role === "superadmin" || user?.role === "admin";

	const sidebarContent = (
		<>
			{/* Logo / Brand */}
			<div className="flex h-14 items-center gap-2.5 px-4">
				<div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary/15">
					<Database className="size-4 text-sidebar-primary" />
				</div>
				<div className="flex flex-col">
					<span className="text-sm font-semibold leading-tight text-sidebar-foreground">
						Agent
					</span>
					<span className="text-[10px] leading-tight text-sidebar-foreground/50">
						QueryGate
					</span>
				</div>
			</div>

			<Separator />

			{/* Navigation */}
			<nav className="flex-1 space-y-1 p-3">
				{navItems.map((item) => (
					<NavLink
						key={item.to}
						to={item.to}
						onClick={() => setSidebarOpen(false)}
						className={({ isActive }) => navLinkClass(isActive)}
					>
						<item.icon className="size-4" />
						{item.label}
					</NavLink>
				))}

				{isAdmin && (
					<>
						<Separator className="my-2" />
						{adminItems.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								onClick={() => setSidebarOpen(false)}
								className={({ isActive }) => navLinkClass(isActive)}
							>
								<item.icon className="size-4" />
								{item.label}
							</NavLink>
						))}
					</>
				)}
			</nav>

			{/* Bottom section: Settings + User info */}
			<div className="border-t border-sidebar-border p-3">
				<NavLink
					to="/settings"
					onClick={() => setSidebarOpen(false)}
					className={({ isActive }) => navLinkClass(isActive)}
				>
					<Settings className="size-4" />
					Settings
				</NavLink>

				<Separator className="my-2" />

				{/* User info */}
				<div className="flex items-center gap-2 rounded-lg px-3 py-2">
					<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold uppercase text-sidebar-accent-foreground">
						{user?.name?.charAt(0) || "?"}
					</div>
					<div className="flex min-w-0 flex-1 flex-col">
						<span className="truncate text-xs font-medium text-sidebar-foreground">
							{user?.name}
						</span>
						<Badge
							variant={roleBadgeVariant(user?.role ?? "user")}
							className="mt-0.5 w-fit text-[10px]"
						>
							{user?.role}
						</Badge>
					</div>
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={logout}
						title="Logout"
						className="shrink-0 text-sidebar-foreground/50 hover:text-sidebar-foreground"
					>
						<LogOut className="size-3" />
					</Button>
				</div>
			</div>
		</>
	);

	return (
		<div className="flex h-screen bg-background">
			{/* Mobile menu button */}
			<button
				onClick={() => setSidebarOpen(!sidebarOpen)}
				className="fixed left-3 top-3 z-50 flex size-9 items-center justify-center rounded-lg bg-sidebar text-sidebar-foreground ring-1 ring-sidebar-border lg:hidden"
				aria-label="Toggle sidebar"
			>
				{sidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
			</button>

			{/* Mobile overlay */}
			{sidebarOpen && (
				<div
					className="fixed inset-0 z-30 bg-black/60 lg:hidden"
					onClick={() => setSidebarOpen(false)}
				/>
			)}

			{/* Sidebar */}
			<aside
				className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 lg:static lg:translate-x-0 ${
					sidebarOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				{sidebarContent}
			</aside>

			{/* Main content */}
			<main className="flex-1 overflow-auto">
				<div className="mx-auto max-w-7xl p-6 pt-14 lg:pt-6">
					<Outlet />
				</div>
			</main>
		</div>
	);
}
