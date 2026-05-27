import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { User } from "@/types";

interface AuthContextType {
	user: User | null;
	loading: boolean;
	login: (email: string, password: string) => Promise<void>;
	logout: () => Promise<void>;
	refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		try {
			const data = await api.get<{ user: User }>("/auth/me");
			setUser(data.user);
		} catch {
			setUser(null);
		} finally {
			setLoading(false);
		}
	}, []);

	const login = useCallback(async (email: string, password: string) => {
		const data = await api.post<{ user: User }>("/auth/login", { email, password });
		setUser(data.user);
	}, []);

	const logout = useCallback(async () => {
		await api.post("/auth/logout");
		setUser(null);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return (
		<AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthContextType {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
