CREATE TABLE `delivery_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`role` text NOT NULL,
	`result_extid` text NOT NULL,
	`trace_guid` text,
	`request_id` text,
	`raw_webhook_body` text NOT NULL,
	`raw_result` text,
	`error_message` text,
	`errors` text,
	`fetch_error` text,
	`received_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_notifications_result_extid_unq` ON `delivery_notifications` (`result_extid`);--> statement-breakpoint
CREATE TABLE `outbound_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`partner` text NOT NULL,
	`ts_code` text NOT NULL,
	`usage_indicator` text,
	`request_payload` text NOT NULL,
	`response_status` integer,
	`response_body` text,
	`outcome` text NOT NULL,
	`stubbed` integer DEFAULT false NOT NULL,
	`trace_guid` text,
	`edi_transaction_extid` text,
	`submitted_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `received_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`result_extid` text NOT NULL,
	`trace_guid` text,
	`request_id` text,
	`raw_webhook_body` text NOT NULL,
	`raw_result` text,
	`raw_document` text,
	`partner` text,
	`transaction_set` text,
	`reference` text,
	`status` text DEFAULT 'received' NOT NULL,
	`error` text,
	`received_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `received_documents_result_extid_unq` ON `received_documents` (`result_extid`);