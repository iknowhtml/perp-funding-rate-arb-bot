CREATE TABLE "execution_estimate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
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
	"timestamp" timestamp with time zone NOT NULL,
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
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exchange" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"type" text NOT NULL,
	"quantity_base" bigint NOT NULL,
	"price_quote" bigint,
	"status" text NOT NULL,
	"exchange_order_id" text,
	"tx_hash" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_execution_estimate_market_timestamp" ON "execution_estimate" USING btree ("market","timestamp");--> statement-breakpoint
CREATE INDEX "idx_market_snapshot_market_timestamp" ON "market_snapshot" USING btree ("market","timestamp");--> statement-breakpoint
CREATE INDEX "idx_orders_idempotency_key" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_orders_tx_hash" ON "orders" USING btree ("tx_hash");