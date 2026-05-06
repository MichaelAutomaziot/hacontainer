'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  MenuItem,
  Switch,
  FormControlLabel,
  IconButton,
  ImageList,
  ImageListItem,
  ImageListItemBar,
  CircularProgress,
  Divider,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  CloudUpload as UploadIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import { supabaseDataClient } from '@/utils/supabase/client';
import { hebrewTranslations } from '@/locales/he';

interface TechnicalSpecs {
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

interface InventoryItem {
  id: number;
  product_name: string;
  sku: string | null;
  category?: string | null;
  technical_specs?: TechnicalSpecs | null;
  delivery_type?: string | null;
  product_images?: string[] | null;
  showroom_images?: string[] | null;
  product_link?: string | null;
  category_link?: string | null;
}

interface ProductEditDialogProps {
  open: boolean;
  onClose: () => void;
  product: InventoryItem | null;
  onSave: (id: number, values: Partial<InventoryItem>) => void;
}

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

export function ProductEditDialog({ open, onClose, product, onSave }: ProductEditDialogProps) {
  const [tabValue, setTabValue] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<'product' | 'showroom'>('product');

  // Form state
  const [category, setCategory] = useState('');
  const [deliveryType, setDeliveryType] = useState('regular');
  const [productLink, setProductLink] = useState('');
  const [categoryLink, setCategoryLink] = useState('');
  const [productImages, setProductImages] = useState<string[]>([]);
  const [showroomImages, setShowroomImages] = useState<string[]>([]);

  // Technical specs
  const [specs, setSpecs] = useState<TechnicalSpecs>({
    height_cm: undefined,
    width_cm: undefined,
    depth_cm: undefined,
    weight_kg: undefined,
    material: '',
    capacity_liters: undefined,
    wheels: undefined,
    expandable: false,
    tsa_lock: false,
  });

  // Reset form when product changes
  useEffect(() => {
    if (product) {
      setCategory(product.category || '');
      setDeliveryType(product.delivery_type || 'regular');
      setProductLink(product.product_link || '');
      setCategoryLink(product.category_link || '');
      setProductImages(product.product_images || []);
      setShowroomImages(product.showroom_images || []);
      setSpecs(product.technical_specs || {
        height_cm: undefined,
        width_cm: undefined,
        depth_cm: undefined,
        weight_kg: undefined,
        material: '',
        capacity_liters: undefined,
        wheels: undefined,
        expandable: false,
        tsa_lock: false,
      });
    }
  }, [product]);

  const handleSpecChange = (field: keyof TechnicalSpecs, value: any) => {
    setSpecs((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'product' | 'showroom') => {
    const files = event.target.files;
    if (!files || files.length === 0 || !product) return;

    setUploading(true);
    setUploadType(type);

    const uploadedUrls: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${product.sku || product.id}_${type}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
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
        setProductImages((prev) => [...prev, ...uploadedUrls]);
      } else {
        setShowroomImages((prev) => [...prev, ...uploadedUrls]);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = (type: 'product' | 'showroom', index: number) => {
    if (type === 'product') {
      setProductImages((prev) => prev.filter((_, i) => i !== index));
    } else {
      setShowroomImages((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleSave = () => {
    if (!product) return;

    const values: Partial<InventoryItem> = {
      category: category || null,
      delivery_type: deliveryType,
      product_link: productLink || null,
      category_link: categoryLink || null,
      product_images: productImages,
      showroom_images: showroomImages,
      technical_specs: specs,
    };

    onSave(product.id, values);
    onClose();
  };

  if (!product) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">
            {hebrewTranslations.inventory.messages.editProduct}: {product.product_name}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
          <Tab label={hebrewTranslations.inventory.messages.productDetails} />
          <Tab label={hebrewTranslations.inventory.columns.technicalSpecs} />
          <Tab label={hebrewTranslations.inventory.columns.productImages} />
          <Tab label={hebrewTranslations.inventory.columns.showroomImages} />
        </Tabs>

        {/* Tab 0: Product Details */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={hebrewTranslations.inventory.columns.category}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label={hebrewTranslations.inventory.columns.deliveryType}
                value={deliveryType}
                onChange={(e) => setDeliveryType(e.target.value)}
              >
                <MenuItem value="regular">{hebrewTranslations.inventory.deliveryTypes.regular}</MenuItem>
                <MenuItem value="heavy">{hebrewTranslations.inventory.deliveryTypes.heavy}</MenuItem>
                <MenuItem value="special">{hebrewTranslations.inventory.deliveryTypes.special}</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {hebrewTranslations.inventory.messages.links}
                </Typography>
              </Divider>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={hebrewTranslations.inventory.columns.productLink}
                value={productLink}
                onChange={(e) => setProductLink(e.target.value)}
                InputProps={{
                  startAdornment: <LinkIcon sx={{ mr: 1, color: 'action.active' }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={hebrewTranslations.inventory.columns.categoryLink}
                value={categoryLink}
                onChange={(e) => setCategoryLink(e.target.value)}
                InputProps={{
                  startAdornment: <LinkIcon sx={{ mr: 1, color: 'action.active' }} />,
                }}
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Tab 1: Technical Specs */}
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={2}>
            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                type="number"
                label={hebrewTranslations.inventory.specs.heightCm}
                value={specs.height_cm || ''}
                onChange={(e) => handleSpecChange('height_cm', e.target.value ? Number(e.target.value) : undefined)}
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                type="number"
                label={hebrewTranslations.inventory.specs.widthCm}
                value={specs.width_cm || ''}
                onChange={(e) => handleSpecChange('width_cm', e.target.value ? Number(e.target.value) : undefined)}
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                type="number"
                label={hebrewTranslations.inventory.specs.depthCm}
                value={specs.depth_cm || ''}
                onChange={(e) => handleSpecChange('depth_cm', e.target.value ? Number(e.target.value) : undefined)}
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                type="number"
                label={hebrewTranslations.inventory.specs.weightKg}
                value={specs.weight_kg || ''}
                onChange={(e) => handleSpecChange('weight_kg', e.target.value ? Number(e.target.value) : undefined)}
                inputProps={{ step: 0.1 }}
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                type="number"
                label={hebrewTranslations.inventory.specs.capacityLiters}
                value={specs.capacity_liters || ''}
                onChange={(e) => handleSpecChange('capacity_liters', e.target.value ? Number(e.target.value) : undefined)}
              />
            </Grid>
            <Grid item xs={6} sm={4}>
              <TextField
                fullWidth
                type="number"
                label={hebrewTranslations.inventory.specs.wheels}
                value={specs.wheels || ''}
                onChange={(e) => handleSpecChange('wheels', e.target.value ? Number(e.target.value) : undefined)}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={hebrewTranslations.inventory.specs.material}
                value={specs.material || ''}
                onChange={(e) => handleSpecChange('material', e.target.value)}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={specs.expandable || false}
                    onChange={(e) => handleSpecChange('expandable', e.target.checked)}
                  />
                }
                label={hebrewTranslations.inventory.specs.expandable}
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <FormControlLabel
                control={
                  <Switch
                    checked={specs.tsa_lock || false}
                    onChange={(e) => handleSpecChange('tsa_lock', e.target.checked)}
                  />
                }
                label={hebrewTranslations.inventory.specs.tsaLock}
              />
            </Grid>
          </Grid>
        </TabPanel>

        {/* Tab 2: Product Images */}
        <TabPanel value={tabValue} index={2}>
          <Box>
            <Button
              variant="outlined"
              component="label"
              startIcon={uploading && uploadType === 'product' ? <CircularProgress size={20} /> : <UploadIcon />}
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

            {productImages.length > 0 ? (
              <ImageList cols={4} rowHeight={120} gap={8}>
                {productImages.map((url, index) => (
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
        <TabPanel value={tabValue} index={3}>
          <Box>
            <Button
              variant="outlined"
              component="label"
              startIcon={uploading && uploadType === 'showroom' ? <CircularProgress size={20} /> : <UploadIcon />}
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

            {showroomImages.length > 0 ? (
              <ImageList cols={4} rowHeight={120} gap={8}>
                {showroomImages.map((url, index) => (
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
        <Button onClick={onClose}>{hebrewTranslations.actions.cancel}</Button>
        <Button onClick={handleSave} variant="contained" color="primary">
          {hebrewTranslations.actions.save}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
