export interface User {
	id: string;
	email: string;
	name: string;
	role: "superadmin" | "admin" | "user";
	isActive: boolean;
	createdAt: string;
}

export interface Database {
	id: string;
	userId: string;
	name: string;
	host: string;
	port: number;
	dbName: string;
	username: string;
	createdAt: string;
}

export interface Agent {
	id: string;
	userId: string;
	name: string;
	role: "executor" | "auditor";
	isActive: boolean;
	createdAt: string;
}

export interface Policy {
	id: string;
	agentDatabaseAccessId: string;
	tableName: string;
	allowedOperations: string[];
	allowedColumns: string[] | null;
	rowLimit: number | null;
	whereClauseRequired: boolean;
	customRules: Record<string, unknown>;
}

export interface AuditLog {
	id: string;
	agentId: string;
	databaseId: string;
	userId: string;
	sqlQuery: string;
	operationType: string;
	status: "allowed" | "denied" | "error";
	affectedRows: number | null;
	dataBefore: Record<string, unknown>[] | null;
	dataAfter: Record<string, unknown>[] | null;
	policyId: string | null;
	denialReason: string | null;
	executionTimeMs: number | null;
	reason: string | null;
	createdAt: string;
}

export interface AuditReview {
	id: string;
	auditLogId: string;
	flagType: "suspicious_pattern" | "policy_violation" | "data_anomaly" | "performance_concern" | "manual_review";
	severity: "low" | "medium" | "high" | "critical";
	reviewerType: "human" | "ai";
	reviewerId: string;
	notes: string | null;
	createdAt: string;
}

export interface DashboardStats {
	queriesToday: number;
	deniedToday: number;
	activeAgents: number;
	totalDatabases: number;
}
