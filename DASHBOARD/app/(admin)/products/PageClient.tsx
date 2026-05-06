'use client';

import { useDataGrid, List } from '@refinedev/mui';
import { DataGrid, GridColDef, GridToolbarContainer, GridToolbarColumnsButton, GridToolbarFilterButton } from '@mui/x-data-grid';
import {
  Box,
  TextField,
  MenuItem,
  Switch,
  IconButton,
  Tooltip,
  Stack,
  Chip,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Divider,
  Tabs,
  Tab,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  CircularProgress,
  Card,
  CardContent,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableRow,
  Snackbar,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Add as AddIcon,
  Upload as UploadIcon,
  Edit as EditIcon,
  AttachFile as AttachFileIcon,
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  Link as LinkIcon,
  Close as CloseIcon,
  Visibility as ViewIcon,
  OpenInNew as OpenInNewIcon,
  Straighten as MeasureIcon,
  Inventory2 as ProductIcon,
  Photo as PhotoIcon,
  Store as StoreIcon,
  FileDownload as ExportIcon,
} from '@mui/icons-material';
import { useUpdate, useCreate, useList } from '@refinedev/core';
import { hebrewTranslations } from '@/locales/he';
import { DataPanel, FilterBar } from '@/components/shared';
import { supabaseDataClient } from '@/utils/supabase/client';
import { InventoryItem, Supplier } from '@/types/inventory';
import { useState } from 'react';

const WEBHOOK_API_URL = '/api/webhook/stock-notification';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

function CustomToolbar({ onExport, onExportAll }: { onExport: () => void; onExportAll: () => void }) {
  return (
    <GridToolbarContainer>
      <GridToolbarColumnsButton />
      <GridToolbarFilterButton />
      <Button size="small" startIcon={<ExportIcon />} onClick={onExport}>
        ייצוא עמוד נוכחי
      </Button>
      <Button size="small" startIcon={<ExportIcon />} onClick={onExportAll}>
        ייצוא כל המוצרים
      </Button>
    </GridToolbarContainer>
  );
}

type DeliveryType = 'regular' | 'heavy' | 'special';

const EMPTY_PRODUCT = {
  product_name: '',
  profit_quantity: 0,
  woo_id: '',
  sku: '',
  barcode: '',
  sku_machsanei_hashmal: '',
  sku_ksp: '',
  sku_alma: '',
  sku_htz: '',
  sku_ace: '',
  in_stock: true,
  category: '',
  delivery_type: 'regular' as DeliveryType,
  delivery_cost: '',
  delivery_time: '',
  product_link: '',
  category_link: '',
  youtube_link: '',
  product_images: [] as string[],
  showroom_images: [] as string[],
  price: '' as string | number,
  variant: '',
  technical_info: '',
};

export default function ProductsPage() {
  const [stockFilter, setStockFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Single product dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<InventoryItem | null>(null);
  const [formData, setFormData] = useState(EMPTY_PRODUCT);
  const [dialogTab, setDialogTab] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<'product' | 'showroom'>('product');

  // Mass import dialog
  const [massImportOpen, setMassImportOpen] = useState(false);
  const [massImportText, setMassImportText] = useState('');
  const [massImportError, setMassImportError] = useState('');

  // View product dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewProduct, setViewProduct] = useState<InventoryItem | null>(null);
  const [viewTab, setViewTab] = useState(0);

  // Webhook notification feedback
  const [webhookSnackbar, setWebhookSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  // Build the OR filter for search (escaped server-side via data-provider).
  const orSearch = searchQuery.trim()
    ? { fields: ['product_name', 'sku', 'barcode'], value: searchQuery.trim() }
    : undefined;

  const { dataGridProps, tableQueryResult } = useDataGrid<InventoryItem>({
    resource: 'inventory',
    pagination: {
      mode: 'server',
      pageSize: 25,
    },
    sorters: {
      initial: [
        {
          field: 'id',
          order: 'desc',
        },
      ],
    },
    filters: {
      permanent: [
        ...(stockFilter === 'in_stock'
          ? [{ field: 'in_stock', operator: 'eq' as const, value: true }]
          : stockFilter === 'out_of_stock'
            ? [{ field: 'in_stock', operator: 'eq' as const, value: false }]
            : []),
      ],
    },
    meta: orSearch ? { orSearch } : undefined,
  });

  // Fetch active suppliers for sending notifications. Capped at 200 — at the
  // current scale this covers all of them; if it ever exceeds, switch to a
  // proper paginated picker rather than returning every row on mount.
  const { data: suppliersData } = useList<Supplier>({
    resource: 'suppliers',
    filters: [{ field: 'is_active', operator: 'eq', value: true }],
    pagination: { mode: 'server', current: 1, pageSize: 200 },
    meta: { select: 'id,name,email,is_active' },
    queryOptions: { staleTime: 5 * 60_000 },
  });

  const { mutate: updateInventory } = useUpdate();
  const { mutate: createProduct } = useCreate();

  const notifySuppliers = async (product: InventoryItem, newStockStatus: boolean) => {
    const suppliers = suppliersData?.data || [];

    const payload = {
      event: 'stock_status_changed',
      product: {
        id: product.id,
        product_name: product.product_name,
        sku: product.sku,
        barcode: product.barcode,
        in_stock: newStockStatus,
      },
      suppliers: suppliers.map((s) => ({
        name: s.name,
        business_name: s.business_name,
        email: s.email,
      })),
      timestamp: new Date().toISOString(),
    };

    console.log('Sending webhook payload:', payload);

    try {
      const response = await fetch(WEBHOOK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      console.log('Webhook response:', result);

      if (response.ok) {
        setWebhookSnackbar({ open: true, message: `Webhook sent - stock ${newStockStatus ? 'in stock' : 'out of stock'}`, severity: 'success' });
      } else {
        console.error('Webhook failed:', result);
        setWebhookSnackbar({ open: true, message: 'Webhook failed to send', severity: 'error' });
      }
    } catch (error) {
      console.error('Failed to notify suppliers:', error);
      setWebhookSnackbar({ open: true, message: 'Webhook error: ' + String(error), severity: 'error' });
    }
  };

  const handleStockToggle = (item: InventoryItem) => {
    const newStockStatus = !item.in_stock;

    updateInventory(
      {
        resource: 'inventory',
        id: item.id,
        values: {
          in_stock: newStockStatus,
          updated_at: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          tableQueryResult?.refetch();
          notifySuppliers(item, newStockStatus);
        },
      }
    );
  };

  // Image upload handler
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'product' | 'showroom') => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadType(type);

    const uploadedUrls: string[] = [];
    const productId = editingProduct?.id || 'new';
    const productSku = formData.sku || productId;

    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${productSku}_${type}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${type}/${fileName}`;

        const { error: uploadError } = await supabaseDataClient.storage
          .from('product-images')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        const { data: { publicUrl } } = supabaseDataClient.storage
          .from('product-images')
          .getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
      }

      if (type === 'product') {
        setFormData(prev => ({
          ...prev,
          product_images: [...prev.product_images, ...uploadedUrls],
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          showroom_images: [...prev.showroom_images, ...uploadedUrls],
        }));
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }

    // Reset input
    event.target.value = '';
  };

  const handleRemoveImage = (type: 'product' | 'showroom', index: number) => {
    if (type === 'product') {
      setFormData(prev => ({
        ...prev,
        product_images: prev.product_images.filter((_, i) => i !== index),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        showroom_images: prev.showroom_images.filter((_, i) => i !== index),
      }));
    }
  };

  // View product handlers
  const handleOpenViewDialog = (product: InventoryItem) => {
    setViewProduct(product);
    setViewTab(0);
    setViewDialogOpen(true);
  };

  const handleCloseViewDialog = () => {
    setViewDialogOpen(false);
    setViewProduct(null);
    setViewTab(0);
  };

  // Single product handlers
  const handleOpenAddDialog = (product?: InventoryItem) => {
    setDialogTab(0);
    if (product) {
      setEditingProduct(product);
      setFormData({
        product_name: product.product_name,
        profit_quantity: product.profit_quantity,
        woo_id: product.woo_id || '',
        sku: product.sku || '',
        barcode: product.barcode || '',
        sku_machsanei_hashmal: product.sku_machsanei_hashmal || '',
        sku_ksp: product.sku_ksp || '',
        sku_alma: product.sku_alma || '',
        sku_htz: product.sku_htz || '',
        sku_ace: product.sku_ace || '',
        in_stock: product.in_stock,
        category: product.category || '',
        delivery_type: product.delivery_type || 'regular',
        delivery_cost: product.delivery_cost || '',
        delivery_time: product.delivery_time || '',
        product_link: product.product_link || '',
        category_link: product.category_link || '',
        youtube_link: product.youtube_link || '',
        product_images: product.product_images || [],
        showroom_images: product.showroom_images || [],
        price: product.price || '',
        variant: product.variant || '',
        technical_info: product.technical_info || '',
      });
    } else {
      setEditingProduct(null);
      setFormData(EMPTY_PRODUCT);
    }
    setAddDialogOpen(true);
  };

  const handleCloseAddDialog = () => {
    setAddDialogOpen(false);
    setEditingProduct(null);
    setFormData(EMPTY_PRODUCT);
    setDialogTab(0);
  };

  const handleSaveProduct = async () => {
    if (!formData.product_name) return;

    const productData = {
      product_name: formData.product_name,
      profit_quantity: formData.profit_quantity,
      woo_id: formData.woo_id || null,
      sku: formData.sku || null,
      barcode: formData.barcode || null,
      sku_machsanei_hashmal: formData.sku_machsanei_hashmal || null,
      sku_ksp: formData.sku_ksp || null,
      sku_alma: formData.sku_alma || null,
      sku_htz: formData.sku_htz || null,
      sku_ace: formData.sku_ace || null,
      in_stock: formData.in_stock,
      category: formData.category || null,
      delivery_type: formData.delivery_type || 'regular',
      delivery_cost: formData.delivery_cost || null,
      delivery_time: formData.delivery_time || null,
      product_link: formData.product_link || null,
      category_link: formData.category_link || null,
      youtube_link: formData.youtube_link || null,
      product_images: formData.product_images,
      showroom_images: formData.showroom_images,
      price: formData.price ? Number(formData.price) : null,
      variant: formData.variant || null,
      technical_info: formData.technical_info || null,
      updated_at: new Date().toISOString(),
    };

    if (editingProduct) {
      updateInventory(
        {
          resource: 'inventory',
          id: editingProduct.id,
          values: productData,
        },
        {
          onSuccess: () => {
            handleCloseAddDialog();
            tableQueryResult?.refetch();
          },
        }
      );
    } else {
      // Use upsert to update existing product if SKU matches
      if (formData.sku && formData.sku.trim() !== '') {
        const { error } = await supabaseDataClient
          .from('inventory')
          .upsert(productData, { onConflict: 'sku' });

        if (error) {
          console.error('Upsert error:', error);
          return;
        }

        handleCloseAddDialog();
        tableQueryResult?.refetch();
      } else {
        // No SKU, just create new product
        createProduct(
          {
            resource: 'inventory',
            values: productData,
          },
          {
            onSuccess: () => {
              handleCloseAddDialog();
              tableQueryResult?.refetch();
            },
          }
        );
      }
    }
  };

  // Mass import handlers
  const handleOpenMassImport = () => {
    setMassImportOpen(true);
    setMassImportText('');
    setMassImportError('');
  };

  const handleCloseMassImport = () => {
    setMassImportOpen(false);
    setMassImportText('');
    setMassImportError('');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setMassImportText(text);
        setMassImportError('');
      }
    };
    reader.onerror = () => {
      setMassImportError('Failed to read file');
    };
    reader.readAsText(file);

    // Reset the input so the same file can be selected again
    event.target.value = '';
  };

  // Parse CSV text handling multi-line quoted fields, escaped quotes, and commas inside quotes
  const parseCSV = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    // Remove BOM if present
    const cleanText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;

    while (i < cleanText.length) {
      const char = cleanText[i];

      if (inQuotes) {
        if (char === '"') {
          // Check if this is an escaped quote (double quote)
          if (i + 1 < cleanText.length && cleanText[i + 1] === '"') {
            currentField += '"';
            i += 2;
            continue;
          } else {
            // End of quoted field
            inQuotes = false;
            i++;
            continue;
          }
        } else {
          // Inside quotes - include everything including newlines
          currentField += char;
          i++;
        }
      } else {
        if (char === '"') {
          // Start of quoted field
          inQuotes = true;
          i++;
        } else if (char === ',') {
          // End of field
          currentRow.push(currentField);
          currentField = '';
          i++;
        } else if (char === '\n' || char === '\r') {
          // End of row (handle both \n and \r\n)
          if (char === '\r' && i + 1 < cleanText.length && cleanText[i + 1] === '\n') {
            i++; // Skip the \n in \r\n
          }
          currentRow.push(currentField);
          if (currentRow.some(field => field.trim())) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentField = '';
          i++;
        } else {
          currentField += char;
          i++;
        }
      }
    }

    // Don't forget the last field and row
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField);
      if (currentRow.some(field => field.trim())) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  const parseMassImportData = (text: string): Partial<InventoryItem>[] => {
    const rows = parseCSV(text);
    const products: Partial<InventoryItem>[] = [];

    // Helper function to clean field value
    const cleanField = (value: string | undefined): string | null => {
      if (!value) return null;
      const trimmed = value.trim();
      // Return null for empty values or Hebrew "none" values
      if (!trimmed || trimmed === 'אין' || trimmed === 'אין ') return null;
      return trimmed;
    };

    for (const values of rows) {
      // Skip header row if it contains known headers
      const firstField = values[0]?.trim() || '';
      if (firstField.includes('שם מוצר') || firstField.toLowerCase().includes('product_name')) continue;

      if (values.length < 1) continue;

      // Parse product images (semicolon-separated URLs - column 22)
      const productImagesRaw = cleanField(values[21]);
      const productImages = productImagesRaw
        ? productImagesRaw.split(';').map(url => url.trim()).filter(url => url && url !== 'אין')
        : null;

      // Parse showroom images (semicolon-separated URLs - column 23)
      const showroomImagesRaw = cleanField(values[22]);
      const showroomImages = showroomImagesRaw
        ? showroomImagesRaw.split(';').map(url => url.trim()).filter(url => url && url !== 'אין')
        : null;

      const product: Partial<InventoryItem> = {
        product_name: values[0]?.trim() || '',
        profit_quantity: parseInt(values[1]?.trim() || '0') || 0,
        woo_id: cleanField(values[2]),
        sku: cleanField(values[3]),
        barcode: cleanField(values[4]),
        sku_machsanei_hashmal: cleanField(values[5]),
        sku_ksp: cleanField(values[6]),
        sku_alma: cleanField(values[7]),
        sku_htz: cleanField(values[8]),
        sku_ace: cleanField(values[9]),
        in_stock: values[10]?.trim()?.toLowerCase() === 'true' || values[10]?.trim() === '1' || values[10]?.trim() === 'כן',
        category: cleanField(values[11]),
        delivery_type: (['regular', 'heavy', 'special'].includes(values[12]?.trim()) ? values[12]?.trim() : 'regular') as DeliveryType,
        delivery_cost: cleanField(values[13]),
        delivery_time: cleanField(values[14]),
        product_link: cleanField(values[15]),
        category_link: cleanField(values[16]),
        youtube_link: cleanField(values[17]),
        price: values[18]?.trim() ? parseFloat(values[18].trim()) : null,
        variant: cleanField(values[19]),
        technical_info: cleanField(values[20]),
        product_images: productImages,
        showroom_images: showroomImages,
      };

      if (product.product_name) {
        products.push(product);
      }
    }

    return products;
  };

  // Handle inline editing of quantity
  const processRowUpdate = async (newRow: InventoryItem, oldRow: InventoryItem) => {
    if (newRow.profit_quantity !== oldRow.profit_quantity) {
      updateInventory(
        {
          resource: 'inventory',
          id: newRow.id,
          values: {
            profit_quantity: newRow.profit_quantity,
            updated_at: new Date().toISOString(),
          },
        },
        {
          onSuccess: () => {
            tableQueryResult?.refetch();
          },
        }
      );
    }
    return newRow;
  };

  const handleMassImport = async () => {
    setMassImportError('');

    try {
      const products = parseMassImportData(massImportText);

      if (products.length === 0) {
        setMassImportError(hebrewTranslations.products.messages.noProductsToImport);
        return;
      }

      // Filter products: only upsert those with a valid SKU
      const productsWithSku = products.filter(p => p.sku && p.sku.trim() !== '');
      const productsWithoutSku = products.filter(p => !p.sku || p.sku.trim() === '');

      // Upsert products with SKU (update existing or insert new based on SKU)
      if (productsWithSku.length > 0) {
        const { error: upsertError } = await supabaseDataClient
          .from('inventory')
          .upsert(
            productsWithSku.map(p => ({
              ...p,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'sku' }
          );

        if (upsertError) {
          console.error('Upsert error:', upsertError);
          setMassImportError(hebrewTranslations.products.messages.importFailed);
          return;
        }
      }

      // Insert products without SKU as new records
      if (productsWithoutSku.length > 0) {
        const { error: insertError } = await supabaseDataClient
          .from('inventory')
          .insert(productsWithoutSku);

        if (insertError) {
          console.error('Insert error:', insertError);
          setMassImportError(hebrewTranslations.products.messages.importFailed);
          return;
        }
      }

      handleCloseMassImport();
      tableQueryResult?.refetch();
    } catch (error) {
      console.error('Mass import error:', error);
      setMassImportError(hebrewTranslations.products.messages.parseError);
    }
  };

  // Helper function to escape CSV values
  const escapeCSVValue = (val: unknown): string => {
    const str = String(val ?? '');
    // Always quote fields that might contain special characters
    // This includes: comma, double quote, newline, carriage return, or literal \n
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes('\\n') || str.includes(':') || str.includes(';')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Export to CSV with all fields
  const handleExport = () => {
    const rows = dataGridProps.rows || [];

    // CSV headers matching the import format (23 columns)
    const headers = [
      'שם מוצר',
      'כמות',
      'WOO ID',
      'מק״ט',
      'ברקוד',
      'מקט מחסני חשמל',
      'מקט KSP',
      'מקט עלמא',
      'מקט HTZ',
      'מקט ACE',
      'במלאי',
      'קטגוריה',
      'סוג משלוח',
      'עלות משלוח',
      'זמן הפצה',
      'לינק למוצר',
      'לינק לקטגוריה',
      'לינק ליוטיוב',
      'מחיר',
      'וריאנט',
      'מפרט טכני',
      'תמונות מוצר',
      'תמונות אולם תצוגה',
    ];

    const csvRows = rows.map((row) => {
      return [
        escapeCSVValue(row.product_name),
        escapeCSVValue(row.profit_quantity || 0),
        escapeCSVValue(row.woo_id),
        escapeCSVValue(row.sku),
        escapeCSVValue(row.barcode),
        escapeCSVValue(row.sku_machsanei_hashmal),
        escapeCSVValue(row.sku_ksp),
        escapeCSVValue(row.sku_alma),
        escapeCSVValue(row.sku_htz),
        escapeCSVValue(row.sku_ace),
        row.in_stock ? 'TRUE' : 'FALSE',
        escapeCSVValue(row.category),
        escapeCSVValue(row.delivery_type || 'regular'),
        escapeCSVValue(row.delivery_cost),
        escapeCSVValue(row.delivery_time),
        escapeCSVValue(row.product_link),
        escapeCSVValue(row.category_link),
        escapeCSVValue(row.youtube_link),
        escapeCSVValue(row.price),
        escapeCSVValue(row.variant),
        escapeCSVValue(row.technical_info),
        escapeCSVValue((row.product_images || []).join(';')),
        escapeCSVValue((row.showroom_images || []).join(';')),
      ].join(',');
    });

    // Add BOM for UTF-8 Excel compatibility
    const csvContent = '\ufeff' + [headers.join(','), ...csvRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `products_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportAll = async () => {
    // Fetch all products from the database
    const { data: allProducts, error } = await supabaseDataClient
      .from('inventory')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      console.error('Error fetching all products:', error);
      return;
    }

    const rows = allProducts || [];

    // CSV headers matching the import format (23 columns)
    const headers = [
      'שם מוצר',
      'כמות',
      'WOO ID',
      'מק״ט',
      'ברקוד',
      'מקט מחסני חשמל',
      'מקט KSP',
      'מקט עלמא',
      'מקט HTZ',
      'מקט ACE',
      'במלאי',
      'קטגוריה',
      'סוג משלוח',
      'עלות משלוח',
      'זמן הפצה',
      'לינק למוצר',
      'לינק לקטגוריה',
      'לינק ליוטיוב',
      'מחיר',
      'וריאנט',
      'מפרט טכני',
      'תמונות מוצר',
      'תמונות אולם תצוגה',
    ];

    const csvRows = rows.map((row) => {
      return [
        escapeCSVValue(row.product_name),
        escapeCSVValue(row.profit_quantity || 0),
        escapeCSVValue(row.woo_id),
        escapeCSVValue(row.sku),
        escapeCSVValue(row.barcode),
        escapeCSVValue(row.sku_machsanei_hashmal),
        escapeCSVValue(row.sku_ksp),
        escapeCSVValue(row.sku_alma),
        escapeCSVValue(row.sku_htz),
        escapeCSVValue(row.sku_ace),
        row.in_stock ? 'TRUE' : 'FALSE',
        escapeCSVValue(row.category),
        escapeCSVValue(row.delivery_type || 'regular'),
        escapeCSVValue(row.delivery_cost),
        escapeCSVValue(row.delivery_time),
        escapeCSVValue(row.product_link),
        escapeCSVValue(row.category_link),
        escapeCSVValue(row.youtube_link),
        escapeCSVValue(row.price),
        escapeCSVValue(row.variant),
        escapeCSVValue(row.technical_info),
        escapeCSVValue((row.product_images || []).join(';')),
        escapeCSVValue((row.showroom_images || []).join(';')),
      ].join(',');
    });

    // Add BOM for UTF-8 Excel compatibility
    const csvContent = '\ufeff' + [headers.join(','), ...csvRows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `all_products_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const columns: GridColDef<InventoryItem>[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 70,
    },
    {
      field: 'in_stock',
      headerName: hebrewTranslations.products.columns.inStock,
      width: 130,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch
            checked={row.in_stock}
            onChange={() => handleStockToggle(row)}
            size="small"
            color="success"
          />
          <Chip
            label={row.in_stock ? hebrewTranslations.products.stockStatus.inStock : hebrewTranslations.products.stockStatus.outOfStock}
            size="small"
            color={row.in_stock ? 'success' : 'error'}
            variant="outlined"
          />
        </Box>
      ),
    },
    {
      field: 'product_name',
      headerName: hebrewTranslations.products.columns.productName,
      width: 300,
      minWidth: 250,
      flex: 1,
    },
    {
      field: 'sku',
      headerName: hebrewTranslations.products.columns.sku,
      width: 120,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace' }}>
          {row.sku || '-'}
        </Box>
      ),
    },
    {
      field: 'barcode',
      headerName: hebrewTranslations.products.columns.barcode,
      width: 140,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace' }}>
          {row.barcode || '-'}
        </Box>
      ),
    },
    {
      field: 'price',
      headerName: hebrewTranslations.inventory.columns.price,
      width: 100,
      renderCell: ({ row }) => row.price ? `₪${row.price}` : '-',
    },
    {
      field: 'category',
      headerName: hebrewTranslations.inventory.columns.category,
      width: 150,
      renderCell: ({ row }) => row.category || '-',
    },
    {
      field: 'delivery_type',
      headerName: hebrewTranslations.inventory.columns.deliveryType,
      width: 120,
      renderCell: ({ row }) => {
        const type = row.delivery_type || 'regular';
        const label = hebrewTranslations.inventory.deliveryTypes[type as keyof typeof hebrewTranslations.inventory.deliveryTypes] || type;
        const color = type === 'regular' ? 'default' : type === 'heavy' ? 'warning' : 'error';
        return <Chip label={label} size="small" color={color as any} />;
      },
    },
    {
      field: 'delivery_cost',
      headerName: hebrewTranslations.inventory.columns.deliveryCost,
      width: 120,
      renderCell: ({ row }) => row.delivery_cost || '-',
    },
    {
      field: 'pieces_per_delivery',
      headerName: 'כמות למשלוח',
      width: 120,
      renderCell: ({ row }) => row.pieces_per_delivery || '-',
    },
    {
      field: 'delivery_time',
      headerName: hebrewTranslations.inventory.columns.deliveryTime,
      width: 120,
      renderCell: ({ row }) => row.delivery_time || '-',
    },
    {
      field: 'product_images',
      headerName: hebrewTranslations.inventory.columns.productImages,
      width: 100,
      renderCell: ({ row }) => {
        const count = row.product_images?.length || 0;
        return <Chip label={count} size="small" variant="outlined" />;
      },
    },
    {
      field: 'profit_quantity',
      headerName: hebrewTranslations.products.columns.profitQuantity,
      width: 120,
      type: 'number',
      editable: true,
      align: 'center',
      headerAlign: 'center',
    },
    {
      field: 'woo_id',
      headerName: hebrewTranslations.products.columns.wooId,
      width: 100,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace' }}>
          {row.woo_id || '-'}
        </Box>
      ),
    },
    {
      field: 'sku_machsanei_hashmal',
      headerName: hebrewTranslations.products.columns.skuMachsaneiHashmal,
      width: 140,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {row.sku_machsanei_hashmal || '-'}
        </Box>
      ),
    },
    {
      field: 'sku_ksp',
      headerName: hebrewTranslations.products.columns.skuKsp,
      width: 100,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {row.sku_ksp || '-'}
        </Box>
      ),
    },
    {
      field: 'sku_alma',
      headerName: hebrewTranslations.products.columns.skuAlma,
      width: 100,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {row.sku_alma || '-'}
        </Box>
      ),
    },
    {
      field: 'sku_htz',
      headerName: hebrewTranslations.products.columns.skuHtz,
      width: 100,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {row.sku_htz || '-'}
        </Box>
      ),
    },
    {
      field: 'sku_ace',
      headerName: hebrewTranslations.products.columns.skuAce,
      width: 100,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {row.sku_ace || '-'}
        </Box>
      ),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'פעולות',
      width: 120,
      getActions: ({ row }) => [
        <Tooltip key="view" title={hebrewTranslations.actions.viewDetails}>
          <IconButton
            size="small"
            onClick={() => handleOpenViewDialog(row)}
            sx={{
              color: 'grey.500',
              '&:hover': {
                color: 'info.main',
                backgroundColor: 'rgba(2, 136, 209, 0.08)',
              },
            }}
          >
            <ViewIcon fontSize="small" />
          </IconButton>
        </Tooltip>,
        <Tooltip key="edit" title={hebrewTranslations.actions.edit}>
          <IconButton
            size="small"
            onClick={() => handleOpenAddDialog(row)}
            sx={{
              color: 'grey.500',
              '&:hover': {
                color: 'primary.main',
                backgroundColor: 'rgba(25, 118, 210, 0.08)',
              },
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>,
      ],
    },
  ];

  return (
    <List
      title={hebrewTranslations.products.title}
      headerButtons={() => (
        <Stack direction="row" spacing={1}>
          <Tooltip title={hebrewTranslations.actions.refresh}>
            <IconButton onClick={() => tableQueryResult?.refetch()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={handleOpenMassImport}
          >
            {hebrewTranslations.products.actions.massImport}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenAddDialog()}
          >
            {hebrewTranslations.products.actions.addProduct}
          </Button>
        </Stack>
      )}
    >

      {/* Search and Filters */}
      <FilterBar sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ xs: 'stretch', lg: 'center' }} useFlexGap>
          {/* Search Field */}
          <TextField
            placeholder={hebrewTranslations.products.messages.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{ minWidth: 280 }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ color: 'action.active', mr: 1 }} />,
              endAdornment: searchQuery && (
                <IconButton size="small" onClick={() => setSearchQuery('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              ),
            }}
          />

          {/* Stock Filter */}
          <TextField
            select
            label={hebrewTranslations.products.filters.stockStatus}
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">{hebrewTranslations.shipments.filters.all}</MenuItem>
            <MenuItem value="in_stock">{hebrewTranslations.products.stockStatus.inStock}</MenuItem>
            <MenuItem value="out_of_stock">{hebrewTranslations.products.stockStatus.outOfStock}</MenuItem>
          </TextField>
        </Stack>
      </FilterBar>

      {/* DataGrid with Column Visibility */}
      <DataPanel>
      <DataGrid
        {...dataGridProps}
        columns={columns}
        autoHeight
        pageSizeOptions={[10, 25, 50, 100]}
        disableRowSelectionOnClick
        processRowUpdate={processRowUpdate}
        onProcessRowUpdateError={(error) => console.error('Error updating row:', error)}
        slots={{
          toolbar: () => <CustomToolbar onExport={handleExport} onExportAll={handleExportAll} />,
        }}
        initialState={{
          columns: {
            columnVisibilityModel: {
              sku_machsanei_hashmal: false,
              sku_ksp: false,
              sku_alma: false,
              sku_htz: false,
              sku_ace: false,
              pieces_per_delivery: false,
            },
          },
        }}
        sx={{
          '& .MuiDataGrid-row:hover': {
            backgroundColor: 'action.hover',
          },
          '& .MuiDataGrid-cell--editable': {
            backgroundColor: 'rgba(25, 118, 210, 0.04)',
            '&:hover': {
              backgroundColor: 'rgba(25, 118, 210, 0.08)',
            },
          },
        }}
      />
      </DataPanel>

      {/* Add/Edit Product Dialog */}
      <Dialog open={addDialogOpen} onClose={handleCloseAddDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              {editingProduct
                ? hebrewTranslations.products.actions.editProduct
                : hebrewTranslations.products.actions.addProduct}
            </Typography>
            <IconButton onClick={handleCloseAddDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Tabs value={dialogTab} onChange={(_, v) => setDialogTab(v)} sx={{ mb: 2 }}>
            <Tab label="פרטים בסיסיים" />
            <Tab label={hebrewTranslations.inventory.columns.technicalSpecs} />
            <Tab label={hebrewTranslations.inventory.columns.productImages} />
            <Tab label={hebrewTranslations.inventory.columns.showroomImages} />
          </Tabs>

          {/* Tab 0: Basic Details */}
          <TabPanel value={dialogTab} index={0}>
            <Stack spacing={2}>
              <TextField
                label={hebrewTranslations.products.columns.productName}
                value={formData.product_name}
                onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                required
                fullWidth
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  label={hebrewTranslations.products.columns.profitQuantity}
                  type="number"
                  value={formData.profit_quantity}
                  onChange={(e) => setFormData({ ...formData, profit_quantity: parseInt(e.target.value) || 0 })}
                  fullWidth
                />
                <TextField
                  label={hebrewTranslations.products.columns.wooId}
                  value={formData.woo_id}
                  onChange={(e) => setFormData({ ...formData, woo_id: e.target.value })}
                  fullWidth
                  dir="ltr"
                />
              </Stack>
              <Stack direction="row" spacing={2}>
                <TextField
                  label={hebrewTranslations.products.columns.sku}
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  fullWidth
                  dir="ltr"
                />
                <TextField
                  label={hebrewTranslations.products.columns.barcode}
                  value={formData.barcode}
                  onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  fullWidth
                  dir="ltr"
                />
              </Stack>

              <Stack direction="row" spacing={2}>
                <TextField
                  label={hebrewTranslations.inventory.columns.price}
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  fullWidth
                  InputProps={{
                    startAdornment: <Typography sx={{ mr: 1 }}>₪</Typography>,
                  }}
                />
                <TextField
                  label={hebrewTranslations.inventory.columns.variant}
                  value={formData.variant}
                  onChange={(e) => setFormData({ ...formData, variant: e.target.value })}
                  fullWidth
                  placeholder="שם המוצר הבסיסי (ללא צבע)"
                  helperText="לדוגמה: כיסא גיימינג Tesla דגם 7305"
                />
              </Stack>

              <Divider sx={{ my: 1 }}>
                <Typography variant="body2" color="text.secondary">פרטים נוספים</Typography>
              </Divider>

              <Stack direction="row" spacing={2}>
                <TextField
                  label={hebrewTranslations.inventory.columns.category}
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  fullWidth
                />
                <TextField
                  select
                  label={hebrewTranslations.inventory.columns.deliveryType}
                  value={formData.delivery_type}
                  onChange={(e) => setFormData({ ...formData, delivery_type: e.target.value as 'regular' | 'heavy' | 'special' })}
                  fullWidth
                >
                  <MenuItem value="regular">{hebrewTranslations.inventory.deliveryTypes.regular}</MenuItem>
                  <MenuItem value="heavy">{hebrewTranslations.inventory.deliveryTypes.heavy}</MenuItem>
                  <MenuItem value="special">{hebrewTranslations.inventory.deliveryTypes.special}</MenuItem>
                </TextField>
              </Stack>

              <Stack direction="row" spacing={2}>
                <TextField
                  label={hebrewTranslations.inventory.columns.deliveryCost}
                  value={formData.delivery_cost}
                  onChange={(e) => setFormData({ ...formData, delivery_cost: e.target.value })}
                  fullWidth
                  placeholder="לדוגמה: 50 ₪"
                />
                <TextField
                  label={hebrewTranslations.inventory.columns.deliveryTime}
                  value={formData.delivery_time}
                  onChange={(e) => setFormData({ ...formData, delivery_time: e.target.value })}
                  fullWidth
                  placeholder="לדוגמה: 2-3 ימי עסקים"
                />
              </Stack>

              <Stack direction="row" spacing={2}>
                <TextField
                  label={hebrewTranslations.inventory.columns.productLink}
                  value={formData.product_link}
                  onChange={(e) => setFormData({ ...formData, product_link: e.target.value })}
                  fullWidth
                  dir="ltr"
                  InputProps={{
                    startAdornment: <LinkIcon sx={{ mr: 1, color: 'action.active' }} />,
                  }}
                />
                <TextField
                  label={hebrewTranslations.inventory.columns.categoryLink}
                  value={formData.category_link}
                  onChange={(e) => setFormData({ ...formData, category_link: e.target.value })}
                  fullWidth
                  dir="ltr"
                  InputProps={{
                    startAdornment: <LinkIcon sx={{ mr: 1, color: 'action.active' }} />,
                  }}
                />
              </Stack>

              <TextField
                label={hebrewTranslations.inventory.columns.youtubeLink}
                value={formData.youtube_link}
                onChange={(e) => setFormData({ ...formData, youtube_link: e.target.value })}
                fullWidth
                dir="ltr"
                InputProps={{
                  startAdornment: <LinkIcon sx={{ mr: 1, color: 'action.active' }} />,
                }}
                placeholder="https://youtube.com/watch?v=..."
              />

              <Divider sx={{ my: 1 }}>
                <Typography variant="body2" color="text.secondary">{hebrewTranslations.products.labels.retailerSkus}</Typography>
              </Divider>

              <Stack direction="row" spacing={2}>
                <TextField
                  label={hebrewTranslations.products.columns.skuMachsaneiHashmal}
                  value={formData.sku_machsanei_hashmal}
                  onChange={(e) => setFormData({ ...formData, sku_machsanei_hashmal: e.target.value })}
                  fullWidth
                  dir="ltr"
                />
                <TextField
                  label={hebrewTranslations.products.columns.skuKsp}
                  value={formData.sku_ksp}
                  onChange={(e) => setFormData({ ...formData, sku_ksp: e.target.value })}
                  fullWidth
                  dir="ltr"
                />
              </Stack>
              <Stack direction="row" spacing={2}>
                <TextField
                  label={hebrewTranslations.products.columns.skuAlma}
                  value={formData.sku_alma}
                  onChange={(e) => setFormData({ ...formData, sku_alma: e.target.value })}
                  fullWidth
                  dir="ltr"
                />
                <TextField
                  label={hebrewTranslations.products.columns.skuHtz}
                  value={formData.sku_htz}
                  onChange={(e) => setFormData({ ...formData, sku_htz: e.target.value })}
                  fullWidth
                  dir="ltr"
                />
                <TextField
                  label={hebrewTranslations.products.columns.skuAce}
                  value={formData.sku_ace}
                  onChange={(e) => setFormData({ ...formData, sku_ace: e.target.value })}
                  fullWidth
                  dir="ltr"
                />
              </Stack>
            </Stack>
          </TabPanel>

          {/* Tab 1: Technical Specs */}
          <TabPanel value={dialogTab} index={1}>
            <Stack spacing={3}>
              {/* Technical Info - Rich Text */}
              <TextField
                label={hebrewTranslations.inventory.technicalInfo}
                value={formData.technical_info}
                onChange={(e) => setFormData(prev => ({ ...prev, technical_info: e.target.value }))}
                multiline
                rows={10}
                fullWidth
                placeholder={hebrewTranslations.inventory.technicalInfoPlaceholder}
                helperText="הזן את כל המידע הטכני: מידות, משקל, חומרים, נפח, גלגלים, מנעול TSA וכו׳"
              />
            </Stack>
          </TabPanel>

          {/* Tab 2: Product Images */}
          <TabPanel value={dialogTab} index={2}>
            <Box>
              <Button
                variant="outlined"
                component="label"
                startIcon={uploading && uploadType === 'product' ? <CircularProgress size={20} /> : <CloudUploadIcon />}
                disabled={uploading}
                sx={{ mb: 2 }}
              >
                {hebrewTranslations.inventory.messages.uploadImages}
                <input
                  type="file"
                  hidden
                  multiple
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'product')}
                />
              </Button>

              {formData.product_images.length > 0 ? (
                <ImageList cols={4} rowHeight={120} gap={8}>
                  {formData.product_images.map((url, index) => (
                    <ImageListItem key={index}>
                      <img
                        src={url}
                        alt={`Product ${index + 1}`}
                        loading="lazy"
                        style={{ objectFit: 'cover', height: '100%' }}
                      />
                      <ImageListItemBar
                        actionIcon={
                          <IconButton
                            sx={{ color: 'white' }}
                            onClick={() => handleRemoveImage('product', index)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        }
                      />
                    </ImageListItem>
                  ))}
                </ImageList>
              ) : (
                <Typography color="text.secondary" textAlign="center" py={4}>
                  אין תמונות מוצר
                </Typography>
              )}
            </Box>
          </TabPanel>

          {/* Tab 3: Showroom Images */}
          <TabPanel value={dialogTab} index={3}>
            <Box>
              <Button
                variant="outlined"
                component="label"
                startIcon={uploading && uploadType === 'showroom' ? <CircularProgress size={20} /> : <CloudUploadIcon />}
                disabled={uploading}
                sx={{ mb: 2 }}
              >
                {hebrewTranslations.inventory.messages.uploadImages}
                <input
                  type="file"
                  hidden
                  multiple
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, 'showroom')}
                />
              </Button>

              {formData.showroom_images.length > 0 ? (
                <ImageList cols={4} rowHeight={120} gap={8}>
                  {formData.showroom_images.map((url, index) => (
                    <ImageListItem key={index}>
                      <img
                        src={url}
                        alt={`Showroom ${index + 1}`}
                        loading="lazy"
                        style={{ objectFit: 'cover', height: '100%' }}
                      />
                      <ImageListItemBar
                        actionIcon={
                          <IconButton
                            sx={{ color: 'white' }}
                            onClick={() => handleRemoveImage('showroom', index)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        }
                      />
                    </ImageListItem>
                  ))}
                </ImageList>
              ) : (
                <Typography color="text.secondary" textAlign="center" py={4}>
                  אין תמונות מאולם תצוגה
                </Typography>
              )}
            </Box>
          </TabPanel>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddDialog}>{hebrewTranslations.actions.cancel}</Button>
          <Button
            variant="contained"
            onClick={handleSaveProduct}
            disabled={!formData.product_name}
          >
            {hebrewTranslations.actions.save}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Mass Import Dialog */}
      <Dialog open={massImportOpen} onClose={handleCloseMassImport} maxWidth="md" fullWidth>
        <DialogTitle>{hebrewTranslations.products.actions.massImport}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              <Typography variant="body2" component="div">
                <strong>{hebrewTranslations.products.messages.massImportInstructions}</strong>
                <Box component="ul" sx={{ mt: 1, mb: 0 }}>
                  <li>{hebrewTranslations.products.messages.massImportFormat}</li>
                  <li>23 עמודות: שם מוצר, כמות, WOO ID, מק״ט, ברקוד, מקטים קמעונאים (5), במלאי, קטגוריה, סוג משלוח, עלות משלוח, זמן הפצה, לינקים (3), מחיר, וריאנט, מפרט טכני, תמונות מוצר, תמונות אולם</li>
                  <li>מחיר - מספר (ללא סימן מטבע)</li>
                  <li>וריאנט - שם המוצר הבסיסי לקיבוץ מוצרים בצבעים שונים</li>
                  <li>תמונות - לינקים מופרדים ב-; (נקודה-פסיק), תומך ב-webp ופורמטים אחרים</li>
                  <li>שורת כותרות תדולג אוטומטית</li>
                </Box>
              </Typography>
            </Alert>

            <Box sx={{ bgcolor: 'grey.100', p: 2, borderRadius: 1, direction: 'ltr', overflowX: 'auto' }}>
              <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                שם מוצר,כמות,WOO ID,מק״ט,ברקוד,מקט מחסני חשמל,מקט KSP,מקט עלמא,מקט HTZ,מקט ACE,במלאי,קטגוריה,סוג משלוח,עלות משלוח,זמן הפצה,לינק למוצר,לינק לקטגוריה,לינק יוטיוב,מחיר,וריאנט,מפרט טכני,תמונות מוצר,תמונות אולם{'\n'}
                כיסא גיימינג,15,WOO001,SKU-001,7290001234567,,,,,,,true,כיסאות,regular,50 ₪,2-3 ימים,,,https://youtube.com/xxx,1299,כיסא גיימינג Tesla,"גובה: 65 ס""מ",https://site.com/img1.webp;https://site.com/img2.webp,
              </Typography>
            </Box>

            {/* File Upload Button */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Button
                variant="outlined"
                component="label"
                startIcon={<AttachFileIcon />}
              >
                בחר קובץ CSV
                <input
                  type="file"
                  accept=".csv,.txt"
                  hidden
                  onChange={handleFileUpload}
                />
              </Button>
              <Typography variant="body2" color="text.secondary">
                או הדבק נתונים בשדה למטה
              </Typography>
            </Box>

            <TextField
              label={hebrewTranslations.products.labels.massImportData}
              value={massImportText}
              onChange={(e) => setMassImportText(e.target.value)}
              multiline
              rows={10}
              fullWidth
              placeholder={hebrewTranslations.products.messages.massImportPlaceholder}
              dir="ltr"
            />

            {massImportError && (
              <Alert severity="error">{massImportError}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseMassImport}>{hebrewTranslations.actions.cancel}</Button>
          <Button
            variant="contained"
            onClick={handleMassImport}
            disabled={!massImportText.trim()}
            startIcon={<UploadIcon />}
          >
            {hebrewTranslations.products.actions.importProducts}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Product Dialog */}
      <Dialog open={viewDialogOpen} onClose={handleCloseViewDialog} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Stack direction="row" spacing={2} alignItems="center">
              <ProductIcon color="primary" />
              <Typography variant="h6">{viewProduct?.product_name}</Typography>
              <Chip
                label={viewProduct?.in_stock ? hebrewTranslations.products.stockStatus.inStock : hebrewTranslations.products.stockStatus.outOfStock}
                size="small"
                color={viewProduct?.in_stock ? 'success' : 'error'}
              />
            </Stack>
            <IconButton onClick={handleCloseViewDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {viewProduct && (
            <>
              <Tabs value={viewTab} onChange={(_, v) => setViewTab(v)} sx={{ mb: 2 }}>
                <Tab icon={<ProductIcon />} label="פרטי מוצר" iconPosition="start" />
                <Tab icon={<MeasureIcon />} label={hebrewTranslations.inventory.columns.technicalSpecs} iconPosition="start" />
                <Tab icon={<PhotoIcon />} label={`תמונות מוצר (${viewProduct.product_images?.length || 0})`} iconPosition="start" />
                <Tab icon={<StoreIcon />} label={`תמונות אולם (${viewProduct.showroom_images?.length || 0})`} iconPosition="start" />
              </Tabs>

              {/* Tab 0: Product Details */}
              <TabPanel value={viewTab} index={0}>
                <Grid container spacing={3}>
                  {/* Basic Info Card */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2" color="primary" gutterBottom>
                          מידע בסיסי
                        </Typography>
                        <Table size="small">
                          <TableBody>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold', width: '40%' }}>מק״ט</TableCell>
                              <TableCell dir="ltr">{viewProduct.sku || '-'}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold' }}>ברקוד</TableCell>
                              <TableCell dir="ltr">{viewProduct.barcode || '-'}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold' }}>WOO ID</TableCell>
                              <TableCell dir="ltr">{viewProduct.woo_id || '-'}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold' }}>כמות בריווחית</TableCell>
                              <TableCell>{viewProduct.profit_quantity}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold' }}>קטגוריה</TableCell>
                              <TableCell>{viewProduct.category || '-'}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold' }}>סוג משלוח</TableCell>
                              <TableCell>
                                <Chip
                                  label={hebrewTranslations.inventory.deliveryTypes[viewProduct.delivery_type as keyof typeof hebrewTranslations.inventory.deliveryTypes] || viewProduct.delivery_type || 'רגיל'}
                                  size="small"
                                  color={viewProduct.delivery_type === 'regular' ? 'default' : viewProduct.delivery_type === 'heavy' ? 'warning' : 'error'}
                                />
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold' }}>{hebrewTranslations.inventory.columns.deliveryCost}</TableCell>
                              <TableCell>{viewProduct.delivery_cost || '-'}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold' }}>כמות יחידות למשלוח</TableCell>
                              <TableCell>{viewProduct.pieces_per_delivery || '-'}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold' }}>{hebrewTranslations.inventory.columns.deliveryTime}</TableCell>
                              <TableCell>{viewProduct.delivery_time || '-'}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold' }}>{hebrewTranslations.inventory.columns.price}</TableCell>
                              <TableCell>{viewProduct.price ? `₪${viewProduct.price}` : '-'}</TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 'bold' }}>{hebrewTranslations.inventory.columns.variant}</TableCell>
                              <TableCell>{viewProduct.variant || '-'}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Links Card */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2" color="primary" gutterBottom>
                          קישורים
                        </Typography>
                        <Stack spacing={2}>
                          {viewProduct.product_link ? (
                            <Button
                              variant="outlined"
                              startIcon={<OpenInNewIcon />}
                              href={viewProduct.product_link}
                              target="_blank"
                              fullWidth
                            >
                              לינק למוצר
                            </Button>
                          ) : (
                            <Typography color="text.secondary" variant="body2">אין לינק למוצר</Typography>
                          )}
                          {viewProduct.category_link ? (
                            <Button
                              variant="outlined"
                              startIcon={<OpenInNewIcon />}
                              href={viewProduct.category_link}
                              target="_blank"
                              fullWidth
                            >
                              לינק לקטגוריה
                            </Button>
                          ) : (
                            <Typography color="text.secondary" variant="body2">אין לינק לקטגוריה</Typography>
                          )}
                          {viewProduct.youtube_link ? (
                            <Button
                              variant="outlined"
                              startIcon={<OpenInNewIcon />}
                              href={viewProduct.youtube_link}
                              target="_blank"
                              fullWidth
                              color="error"
                            >
                              {hebrewTranslations.inventory.columns.youtubeLink}
                            </Button>
                          ) : (
                            <Typography color="text.secondary" variant="body2">אין לינק ליוטיוב</Typography>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Retailer SKUs Card */}
                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2" color="primary" gutterBottom>
                          מק״טים קמעונאים
                        </Typography>
                        <Grid container spacing={2}>
                          <Grid item xs={6} sm={4} md={2}>
                            <Typography variant="caption" color="text.secondary">מחסני חשמל</Typography>
                            <Typography dir="ltr">{viewProduct.sku_machsanei_hashmal || '-'}</Typography>
                          </Grid>
                          <Grid item xs={6} sm={4} md={2}>
                            <Typography variant="caption" color="text.secondary">KSP</Typography>
                            <Typography dir="ltr">{viewProduct.sku_ksp || '-'}</Typography>
                          </Grid>
                          <Grid item xs={6} sm={4} md={2}>
                            <Typography variant="caption" color="text.secondary">עלמא</Typography>
                            <Typography dir="ltr">{viewProduct.sku_alma || '-'}</Typography>
                          </Grid>
                          <Grid item xs={6} sm={4} md={2}>
                            <Typography variant="caption" color="text.secondary">HTZ</Typography>
                            <Typography dir="ltr">{viewProduct.sku_htz || '-'}</Typography>
                          </Grid>
                          <Grid item xs={6} sm={4} md={2}>
                            <Typography variant="caption" color="text.secondary">ACE</Typography>
                            <Typography dir="ltr">{viewProduct.sku_ace || '-'}</Typography>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </TabPanel>

              {/* Tab 1: Technical Specs */}
              <TabPanel value={viewTab} index={1}>
                {viewProduct.technical_info ? (
                  <Grid container spacing={3}>
                    {/* Technical Info Card */}
                    <Grid item xs={12}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" color="primary" gutterBottom>
                            {hebrewTranslations.inventory.technicalInfo}
                          </Typography>
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 2,
                              backgroundColor: 'grey.50',
                              whiteSpace: 'pre-wrap',
                              minHeight: 100,
                            }}
                          >
                            <Typography variant="body2">
                              {viewProduct.technical_info}
                            </Typography>
                          </Paper>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                ) : (
                  <Box textAlign="center" py={4}>
                    <MeasureIcon sx={{ fontSize: 60, color: 'grey.300', mb: 2 }} />
                    <Typography color="text.secondary">אין מפרט טכני למוצר זה</Typography>
                  </Box>
                )}
              </TabPanel>

              {/* Tab 2: Product Images */}
              <TabPanel value={viewTab} index={2}>
                {viewProduct.product_images && viewProduct.product_images.length > 0 ? (
                  <ImageList cols={3} gap={16}>
                    {viewProduct.product_images.map((url, index) => (
                      <ImageListItem key={index} sx={{ borderRadius: 2, overflow: 'hidden' }}>
                        <img
                          src={url}
                          alt={`תמונת מוצר ${index + 1}`}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: 250,
                            objectFit: 'cover',
                            cursor: 'pointer',
                          }}
                          onClick={() => window.open(url, '_blank')}
                        />
                        <ImageListItemBar
                          title={`תמונה ${index + 1}`}
                          actionIcon={
                            <IconButton
                              sx={{ color: 'white' }}
                              onClick={() => window.open(url, '_blank')}
                            >
                              <OpenInNewIcon />
                            </IconButton>
                          }
                        />
                      </ImageListItem>
                    ))}
                  </ImageList>
                ) : (
                  <Box textAlign="center" py={4}>
                    <PhotoIcon sx={{ fontSize: 60, color: 'grey.300', mb: 2 }} />
                    <Typography color="text.secondary">אין תמונות מוצר</Typography>
                  </Box>
                )}
              </TabPanel>

              {/* Tab 3: Showroom Images */}
              <TabPanel value={viewTab} index={3}>
                {viewProduct.showroom_images && viewProduct.showroom_images.length > 0 ? (
                  <ImageList cols={3} gap={16}>
                    {viewProduct.showroom_images.map((url, index) => (
                      <ImageListItem key={index} sx={{ borderRadius: 2, overflow: 'hidden' }}>
                        <img
                          src={url}
                          alt={`תמונת אולם ${index + 1}`}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: 250,
                            objectFit: 'cover',
                            cursor: 'pointer',
                          }}
                          onClick={() => window.open(url, '_blank')}
                        />
                        <ImageListItemBar
                          title={`תמונה ${index + 1}`}
                          actionIcon={
                            <IconButton
                              sx={{ color: 'white' }}
                              onClick={() => window.open(url, '_blank')}
                            >
                              <OpenInNewIcon />
                            </IconButton>
                          }
                        />
                      </ImageListItem>
                    ))}
                  </ImageList>
                ) : (
                  <Box textAlign="center" py={4}>
                    <StoreIcon sx={{ fontSize: 60, color: 'grey.300', mb: 2 }} />
                    <Typography color="text.secondary">אין תמונות מאולם התצוגה</Typography>
                  </Box>
                )}
              </TabPanel>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseViewDialog}>{hebrewTranslations.actions.close}</Button>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => {
              handleCloseViewDialog();
              if (viewProduct) handleOpenAddDialog(viewProduct);
            }}
          >
            {hebrewTranslations.actions.edit}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Webhook notification snackbar */}
      <Snackbar
        open={webhookSnackbar.open}
        autoHideDuration={4000}
        onClose={() => setWebhookSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setWebhookSnackbar(prev => ({ ...prev, open: false }))}
          severity={webhookSnackbar.severity}
          sx={{ width: '100%' }}
        >
          {webhookSnackbar.message}
        </Alert>
      </Snackbar>
    </List>
  );
}
