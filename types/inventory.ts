export interface TechnicalSpecs {
  height_cm?: number;
  width_cm?: number;
  depth_cm?: number;
  weight_kg?: number;
  material?: string;
  capacity_liters?: number;
  wheels?: number;
  expandable?: boolean;
  tsa_lock?: boolean;
}

export interface InventoryItem {
  id: number;
  product_name: string;
  profit_quantity: number;
  woo_id: string | null;
  sku: string | null;
  barcode: string | null;
  sku_machsanei_hashmal: string | null;
  sku_ksp: string | null;
  sku_alma: string | null;
  sku_htz: string | null;
  sku_ace: string | null;
  in_stock: boolean;
  category: string | null;
  technical_specs: TechnicalSpecs | null;
  delivery_type: 'regular' | 'heavy' | 'special' | null;
  delivery_cost: string | null;
  pieces_per_delivery: number | null;
  delivery_time: string | null;
  product_images: string[] | null;
  showroom_images: string[] | null;
  product_link: string | null;
  category_link: string | null;
  youtube_link: string | null;
  price: number | null;
  variant: string | null;
  technical_info: string | null;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  business_name: string | null;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
