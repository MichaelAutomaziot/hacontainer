/**
 * Pluggable connector interface for the single-product upload orchestrator.
 *
 * Each platform (Konimbo, Super-Pharm, Zap, Walla, Ace) implements this
 * shape; the orchestrator iterates a `connectors[]` array and aggregates
 * per-connector results without knowing about Mirakl or Konimbo specifics.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductInput } from "@/lib/shared/single-product-schema";

export type ConnectorId = "konimbo" | "superpharm" | "zap" | "walla" | "ace";

export interface ConnectorContext {
  inventoryId: number;
  productInput: ProductInput;
  serviceClient: SupabaseClient;
  jobId: string;
  importType: "official" | "parallel";
}

export interface ConnectorPreflight {
  willPush: boolean;
  blockers: string[];
  warnings: string[];
}

export interface ConnectorResult {
  ok: boolean;
  status: "success" | "pm01_dispatched" | "skipped" | "failed";
  externalId?: string;
  externalUrl?: string;
  error?: { code: string; message: string };
  warnings?: string[];
}

export interface Connector {
  id: ConnectorId;
  enabled: boolean;
  preflight(ctx: ConnectorContext): Promise<ConnectorPreflight>;
  pushProduct(ctx: ConnectorContext): Promise<ConnectorResult>;
}
