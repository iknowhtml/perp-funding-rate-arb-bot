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
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_orders_exchange_order_id" ON "orders" USING btree ("exchange_order_id");--> statement-breakpoint
CREATE INDEX "idx_orders_idempotency_key" ON "orders" USING btree ("idempotency_key");