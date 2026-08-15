-- APP-061: one Token Usage page per user; handle claimed once.
CREATE TABLE `user_profiles_new` (
	`user_id` text PRIMARY KEY NOT NULL,
	`handle` text,
	`handle_changed_at` integer,
	`handle_claimed_at` integer,
	`primary_share_id` text,
	`profile_public` integer DEFAULT false NOT NULL,
	`avatar_url` text,
	`github_username` text,
	`x_username` text,
	`usage_visibility` text DEFAULT 'off' NOT NULL,
	`unlisted_token_hash` text,
	`include_cost` integer DEFAULT false NOT NULL,
	`snapshot_json` text,
	`snapshot_updated_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `user_profiles_new` (
	`user_id`,
	`handle`,
	`handle_changed_at`,
	`handle_claimed_at`,
	`primary_share_id`,
	`profile_public`,
	`updated_at`
)
SELECT
	`user_id`,
	NULL,
	`handle_changed_at`,
	NULL,
	`primary_share_id`,
	`profile_public`,
	`updated_at`
FROM `user_profiles`;--> statement-breakpoint
DROP TABLE `user_profiles`;--> statement-breakpoint
ALTER TABLE `user_profiles_new` RENAME TO `user_profiles`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_handle_uidx` ON `user_profiles` (`handle`);
