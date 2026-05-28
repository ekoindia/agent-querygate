import { relations } from "drizzle-orm";
import {
	boolean,
	datetime,
	int,
	json,
	mysqlEnum,
	mysqlTable,
	text,
	uniqueIndex,
	varchar,
} from "drizzle-orm/mysql-core";

// ── Enums ──────────────────────────────────────────────────────────

export const userRoleEnum = ["superadmin", "admin", "user"] as const;
export const operationTypeEnum = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
export const auditStatusEnum = ["allowed", "denied", "error"] as const;
export const agentRoleEnum = ["executor", "auditor"] as const;
export const flagTypeEnum = ["suspicious_pattern", "policy_violation", "data_anomaly", "performance_concern", "manual_review"] as const;
export const severityEnum = ["low", "medium", "high", "critical"] as const;
export const reviewerTypeEnum = ["human", "ai"] as const;

// ── Users ──────────────────────────────────────────────────────────

export const users = mysqlTable("users", {
	id: varchar("id", { length: 36 }).primaryKey(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	name: varchar("name", { length: 255 }).notNull(),
	role: mysqlEnum("role", userRoleEnum).notNull().default("user"),
	createdBy: varchar("created_by", { length: 36 }),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
	updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const usersRelations = relations(users, ({ one, many }) => ({
	creator: one(users, {
		fields: [users.createdBy],
		references: [users.id],
		relationName: "userCreator",
	}),
	createdUsers: many(users, { relationName: "userCreator" }),
	databases: many(databases),
	agents: many(agents),
	auditLogs: many(auditLogs),
}));

// ── Databases ──────────────────────────────────────────────────────

export const databases = mysqlTable("databases", {
	id: varchar("id", { length: 36 }).primaryKey(),
	userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
	name: varchar("name", { length: 255 }).notNull(),
	host: varchar("host", { length: 255 }).notNull(),
	port: int("port").notNull().default(3306),
	dbName: varchar("db_name", { length: 255 }).notNull(),
	username: varchar("username", { length: 255 }).notNull(),
	passwordEncrypted: text("password_encrypted").notNull(),
	createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
	updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const databasesRelations = relations(databases, ({ one, many }) => ({
	user: one(users, {
		fields: [databases.userId],
		references: [users.id],
	}),
	agentAccess: many(agentDatabaseAccess),
	auditLogs: many(auditLogs),
}));

// ── Agents ─────────────────────────────────────────────────────────

export const agents = mysqlTable("agents", {
	id: varchar("id", { length: 36 }).primaryKey(),
	userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
	name: varchar("name", { length: 255 }).notNull(),
	apiKeyHash: varchar("api_key_hash", { length: 255 }).notNull(),
	role: mysqlEnum("role", agentRoleEnum).notNull().default("executor"),
	isActive: boolean("is_active").notNull().default(true),
	createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
	updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const agentsRelations = relations(agents, ({ one, many }) => ({
	user: one(users, {
		fields: [agents.userId],
		references: [users.id],
	}),
	databaseAccess: many(agentDatabaseAccess),
	auditLogs: many(auditLogs),
}));

// ── Agent Database Access ──────────────────────────────────────────

export const agentDatabaseAccess = mysqlTable(
	"agent_database_access",
	{
		id: varchar("id", { length: 36 }).primaryKey(),
		agentId: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id),
		databaseId: varchar("database_id", { length: 36 }).notNull().references(() => databases.id),
	},
	(table) => [
		uniqueIndex("agent_database_unique_idx").on(table.agentId, table.databaseId),
	],
);

export const agentDatabaseAccessRelations = relations(agentDatabaseAccess, ({ one, many }) => ({
	agent: one(agents, {
		fields: [agentDatabaseAccess.agentId],
		references: [agents.id],
	}),
	database: one(databases, {
		fields: [agentDatabaseAccess.databaseId],
		references: [databases.id],
	}),
	policies: many(policies),
}));

// ── Policies ───────────────────────────────────────────────────────

export const policies = mysqlTable("policies", {
	id: varchar("id", { length: 36 }).primaryKey(),
	agentDatabaseAccessId: varchar("agent_database_access_id", { length: 36 })
		.notNull()
		.references(() => agentDatabaseAccess.id),
	tableName: varchar("table_name", { length: 255 }).notNull(),
	allowedOperations: json("allowed_operations").$type<string[]>().notNull(),
	allowedColumns: json("allowed_columns").$type<string[] | null>().default(null),
	rowLimit: int("row_limit"),
	whereClauseRequired: boolean("where_clause_required").notNull().default(false),
	customRules: json("custom_rules").$type<Record<string, unknown>>().notNull().default({}),
	createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
	updatedAt: datetime("updated_at").notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
});

export const policiesRelations = relations(policies, ({ one }) => ({
	agentDatabaseAccess: one(agentDatabaseAccess, {
		fields: [policies.agentDatabaseAccessId],
		references: [agentDatabaseAccess.id],
	}),
}));

// ── Audit Logs ─────────────────────────────────────────────────────

export const auditLogs = mysqlTable("audit_logs", {
	id: varchar("id", { length: 36 }).primaryKey(),
	agentId: varchar("agent_id", { length: 36 }).notNull().references(() => agents.id),
	databaseId: varchar("database_id", { length: 36 }).notNull().references(() => databases.id),
	userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
	sqlQuery: text("sql_query").notNull(),
	operationType: mysqlEnum("operation_type", operationTypeEnum).notNull(),
	status: mysqlEnum("status", auditStatusEnum).notNull(),
	affectedRows: int("affected_rows"),
	dataBefore: json("data_before").$type<Record<string, unknown>[] | null>(),
	dataAfter: json("data_after").$type<Record<string, unknown>[] | null>(),
	policyId: varchar("policy_id", { length: 36 }),
	denialReason: text("denial_reason"),
	executionTimeMs: int("execution_time_ms"),
	reason: text("reason"),
	createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

export const auditLogsRelations = relations(auditLogs, ({ one, many }) => ({
	agent: one(agents, {
		fields: [auditLogs.agentId],
		references: [agents.id],
	}),
	database: one(databases, {
		fields: [auditLogs.databaseId],
		references: [databases.id],
	}),
	user: one(users, {
		fields: [auditLogs.userId],
		references: [users.id],
	}),
	reviews: many(auditReviews),
}));

// ── Audit Reviews ─────────────────────────────────────────────────

export const auditReviews = mysqlTable("audit_reviews", {
	id: varchar("id", { length: 36 }).primaryKey(),
	auditLogId: varchar("audit_log_id", { length: 36 }).notNull().references(() => auditLogs.id),
	flagType: mysqlEnum("flag_type", flagTypeEnum).notNull(),
	severity: mysqlEnum("severity", severityEnum).notNull(),
	reviewerType: mysqlEnum("reviewer_type", reviewerTypeEnum).notNull(),
	reviewerId: varchar("reviewer_id", { length: 36 }).notNull(),
	notes: text("notes"),
	createdAt: datetime("created_at").notNull().$defaultFn(() => new Date()),
});

export const auditReviewsRelations = relations(auditReviews, ({ one }) => ({
	auditLog: one(auditLogs, {
		fields: [auditReviews.auditLogId],
		references: [auditLogs.id],
	}),
}));
