ALTER TABLE `expenses` ADD `category` text DEFAULT 'food' NOT NULL;--> statement-breakpoint
ALTER TABLE `receipt_intakes` ADD `category` text;