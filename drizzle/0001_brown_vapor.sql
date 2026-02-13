CREATE TABLE "execution_estimate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"market" text NOT NULL,
	"size_usd" bigint NOT NULL,
	"simulated_impact_bps" bigint NOT NULL,
	"estimated_gas_usd" bigint,
	"acceptable_price" bigint,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "market_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"market" text NOT NULL,
	"market_name" text NOT NULL,
	"price" bigint NOT NULL,
	"long_funding_rate" bigint NOT NULL,
	"short_funding_rate" bigint NOT NULL,
	"long_open_interest_usd" bigint NOT NULL,
	"short_open_interest_usd" bigint NOT NULL,
	"borrow_rate_long" bigint NOT NULL,
	"borrow_rate_short" bigint NOT NULL,
	"oi_skew_ratio" bigint,
	"gas_price_gwei" bigint,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_execution_estimate_market_ts" ON "execution_estimate" USING btree ("market","ts");--> statement-breakpoint
CREATE INDEX "idx_market_snapshot_market_ts" ON "market_snapshot" USING btree ("market","ts");