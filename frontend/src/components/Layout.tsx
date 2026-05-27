import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	LayoutDashboard,
	Database,
	Bot,
	ScrollText,
	Users,
	Settings,
	LogOut,
} from "lucide-react";

const navItems = [
	{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/databases", label: "Databases", icon: Database },
	{ to: "/agents", label: "Agents", icon: Bot },
	{ to: "/audit", label: "Audit Log", icon: ScrollText },
];

const adminItems = [
	{ to: "/users", label: "Users", icon: Users },
];

export function Layout() {
	const { user, logout } = useAuth();

	const isAdmin = user?.role === "superadmin" || user?.role === "admin";

	return (
		<div className="flex h-screen bg-background">
			{/* Sidebar */}
			<aside className="flex w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
				{/* Logo / Brand */}
				<div className="flex h-14 items-center gap-2 px-4">
					<Database className="size-6 text-sidebar-primary" />
					<span className="text-lg font-semibold">Eko MySQL</span>
				</div>

				<Separator />

				{/* Navigation */}
				<nav className="flex-1 space-y-1 p-3">
					{navItems.map((item) => (
						<NavLink
							key={item.to}
							to={item.to}
							className={({ isActive }) =>
								`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
									isActive
										? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
										: "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
								}`
							}
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
									className={({ isActive }) =>
										`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
											isActive
												? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
												: "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
										}`
									}
								>
									<item.icon className="size-4" />
									{item.label}
								</NavLink>
							))}
						</>
					)}
				</nav>

				{/* Bottom section */}
				<div className="border-t border-border p-3">
					<NavLink
						to="/settings"
						className={({ isActive }) =>
							`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
								isActive
									? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
									: "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
							}`
						}
					>
						<Settings className="size-4" />
						Settings
					</NavLink>

					<div className="mt-2 flex items-center gap-2 px-3">
						<div className="flex-1 truncate text-xs text-muted-foreground">
							{user?.email}
						</div>
						<Button variant="ghost" size="icon-xs" onClick={logout} title="Logout">
							<LogOut className="size-3" />
						</Button>
					</div>
				</div>
			</aside>

			{/* Main content */}
			<main className="flex-1 overflow-auto">
				<div className="container mx-auto p-6">
					<Outlet />
				</div>
			</main>
		</div>
	);
}
