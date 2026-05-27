CREATE TABLE `agent_database_access` (
	`id` varchar(36) NOT NULL,
	`agent_id` varchar(36) NOT NULL,
	`database_id` varchar(36) NOT NULL,
	CONSTRAINT `agent_database_access_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_database_unique_idx` UNIQUE(`agent_id`,`database_id`)
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`api_key_hash` varchar(255) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` varchar(36) NOT NULL,
	`agent_id` varchar(36) NOT NULL,
	`database_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`sql_query` text NOT NULL,
	`operation_type` enum('SELECT','INSERT','UPDATE','DELETE') NOT NULL,
	`status` enum('allowed','denied','error') NOT NULL,
	`affected_rows` int,
	`data_before` json,
	`data_after` json,
	`policy_id` varchar(36),
	`denial_reason` text,
	`execution_time_ms` int,
	`created_at` datetime NOT NULL,
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `databases` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`host` varchar(255) NOT NULL,
	`port` int NOT NULL DEFAULT 3306,
	`db_name` varchar(255) NOT NULL,
	`username` varchar(255) NOT NULL,
	`password_encrypted` text NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `databases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`id` varchar(36) NOT NULL,
	`agent_database_access_id` varchar(36) NOT NULL,
	`table_name` varchar(255) NOT NULL,
	`allowed_operations` json NOT NULL,
	`allowed_columns` json DEFAULT ('null'),
	`row_limit` int,
	`where_clause_required` boolean NOT NULL DEFAULT false,
	`custom_rules` json NOT NULL DEFAULT ('{}'),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `policies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`role` enum('superadmin','admin','user') NOT NULL DEFAULT 'user',
	`created_by` varchar(36),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `agent_database_access` ADD CONSTRAINT `agent_database_access_agent_id_agents_id_fk` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agent_database_access` ADD CONSTRAINT `agent_database_access_database_id_databases_id_fk` FOREIGN KEY (`database_id`) REFERENCES `databases`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agents` ADD CONSTRAINT `agents_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_agent_id_agents_id_fk` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_database_id_databases_id_fk` FOREIGN KEY (`database_id`) REFERENCES `databases`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `databases` ADD CONSTRAINT `databases_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `policies` ADD CONSTRAINT `policies_agent_database_access_id_agent_database_access_id_fk` FOREIGN KEY (`agent_database_access_id`) REFERENCES `agent_database_access`(`id`) ON DELETE no action ON UPDATE no action;