/**
 * Shipment entity from Supabase database
 * Matches the actual database schema exactly
 */
export interface Shipment {
  // Identifiers
  id: number;
  uuid: string | null;
  order_number: string | null;
  shipping_code: string | null;

  // Customer information
  customer_phone: string | null;
  normalized_phone: string | null;
  first_name: string | null;
  last_name: string | null;

  // Address details
  city: string | null;
  address_street: string | null;
  address_number: string | null;
  address_extra: string | null;

  // Shipping details
  status_code: string | null;
  status_text: string | null;
  is_cancelled: boolean | null;
  shipping_type: string | null;
  is_pickup: boolean | null;
  pickup_ready: boolean | null;
  picked_up: boolean | null;
  delivered_to: string | null;

  // Data (JSONB fields)
  invoice_link: string | null;
  shipping_log: any | null; // JSONB array of shipping events
  products_clean: ProductItem[] | null;
  order_data: any | null; // JSONB order details

  // Chatwoot integration
  chatwoot_contact_id: number | null;
  chatwoot_conversation_id: number | null;
  conversation_status: string | null;
  assigned_agent_id: number | null;
  is_bot_active: boolean | null;
  bot_state: string | null;
  last_interaction_type: string | null;

  // Timestamps (NOTE: shipments table uses api_* prefixed timestamps)
  api_created_at: string | null;
  api_updated_at: string | null;
  synced_at: string | null;
}

/**
 * Product item within a shipment
 */
export interface ProductItem {
  sku?: string;
  name?: string;
  quantity?: number;
  price?: number;
  [key: string]: any; // Allow additional fields
}

/**
 * Shipment creation/update form data
 * Field names match the database columns exactly
 */
export interface ShipmentFormData {
  order_number?: string;
  shipping_code?: string;
  first_name?: string;
  last_name?: string;
  customer_phone?: string;
  normalized_phone?: string;
  city?: string;
  address_street?: string;
  address_number?: string;
  address_extra?: string;
  status_code?: string;
  shipping_type?: string;
  is_pickup?: boolean;
  pickup_ready?: boolean;
  picked_up?: boolean;
  delivered_to?: string;
}

/**
 * Filter options for shipments table
 */
export interface ShipmentFilters {
  search?: string; // Search by order number, phone, or name
  status_code?: string | string[];
  is_pickup?: boolean;
  pickup_ready?: boolean;
  city?: string | string[];
  date_from?: string;
  date_to?: string;
}

/**
 * Shipment status code mapping
 * These codes come from the API and are mapped to Hebrew in translations
 */
export enum ShipmentStatus {
  CLOSED = '99',
  WAREHOUSE_ENTRY = '21',
  REGULAR_PICKUP_LOADING = '4',
  IN_STOCK = '6',
  COMPLETED = '3',
  RESET_SCANS = '16',
  IN_DELIVERY = '27',
  DELIVERY_FAILED = '30',
  CANCELLED = 'cancelled',
}

/**
 * Shipping types
 */
export enum ShippingType {
  REGULAR = 'regular',
  PICKUP = 'pickup',
  DOUBLE_DELIVERY = 'double_delivery',
  EXPRESS = 'express',
}

/**
 * Status color mapping for UI
 */
export const STATUS_COLOR_MAP: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  [ShipmentStatus.CLOSED]: 'success',
  [ShipmentStatus.COMPLETED]: 'success',
  [ShipmentStatus.IN_DELIVERY]: 'info',
  [ShipmentStatus.DELIVERY_FAILED]: 'error',
  [ShipmentStatus.CANCELLED]: 'error',
  [ShipmentStatus.IN_STOCK]: 'warning',
  [ShipmentStatus.WAREHOUSE_ENTRY]: 'warning',
  [ShipmentStatus.REGULAR_PICKUP_LOADING]: 'info',
};

/**
 * Helper to get customer full name
 */
export function getCustomerName(shipment: Shipment): string {
  const parts = [shipment.first_name, shipment.last_name].filter(Boolean);
  return parts.join(' ') || 'לא צוין';
}

/**
 * Helper to determine if shipment is active (not completed/cancelled)
 */
export function isActiveShipment(shipment: Shipment): boolean {
  return (
    shipment.status_code !== ShipmentStatus.CLOSED &&
    shipment.status_code !== ShipmentStatus.COMPLETED &&
    shipment.status_code !== ShipmentStatus.CANCELLED
  );
}
