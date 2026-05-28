CREATE TABLE `audit_reviews` (
	`id` varchar(36) NOT NULL,
	`audit_log_id` varchar(36) NOT NULL,
	`flag_type` enum('suspicious_pattern','policy_violation','data_anomaly','performance_concern','manual_review') NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL,
	`reviewer_type` enum('human','ai') NOT NULL,
	`reviewer_id` varchar(36) NOT NULL,
	`notes` text,
	`created_at` datetime NOT NULL,
	CONSTRAINT `audit_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `agents` ADD `role` enum('executor','auditor') DEFAULT 'executor' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `audit_reviews` ADD CONSTRAINT `audit_reviews_audit_log_id_audit_logs_id_fk` FOREIGN KEY (`audit_log_id`) REFERENCES `audit_logs`(`id`) ON DELETE no action ON UPDATE no action;