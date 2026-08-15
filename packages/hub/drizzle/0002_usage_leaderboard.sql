ALTER TABLE `user_profiles` ADD `share_total_tokens` integer;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `share_total_cost_usd` real;--> statement-breakpoint
CREATE INDEX `idx_profiles_public_tokens` ON `user_profiles` (`usage_visibility`,`share_total_tokens`);--> statement-breakpoint
CREATE INDEX `idx_profiles_public_cost` ON `user_profiles` (`usage_visibility`,`share_total_cost_usd`);--> statement-breakpoint
CREATE TABLE `usage_leaderboards` (
	`board_id` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
