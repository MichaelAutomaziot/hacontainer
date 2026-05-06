'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import { List } from '@refinedev/mui';
import { useUpdate, useCreate, useDelete } from '@refinedev/core';
import {
  Box,
  TextField,
  Switch,
  IconButton,
  Tooltip,
  Stack,
  Chip,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Snackbar,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Collapse,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Link as LinkIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import { hebrewTranslations } from '@/locales/he';
import { supabaseDataClient } from '@/utils/supabase/client';

interface PaymentLink {
  id: number;
  delivery_cost: string;
  payment_url: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface InventoryProduct {
  id: number;
  product_name: string;
  sku: string | null;
  delivery_cost: string | null;
  price: number | null;
  in_stock: boolean;
}

export default function PaymentLinksPage() {
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [productsByDeliveryCost, setProductsByDeliveryCost] = useState<Record<string, InventoryProduct[]>>({});
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<PaymentLink>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newLink, setNewLink] = useState({ delivery_cost: '', payment_url: '', label: '' });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [loading, setLoading] = useState(true);

  const { mutate: updateRecord } = useUpdate();
  const { mutate: createRecord } = useCreate();
  const { mutate: deleteRecord } = useDelete();

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch payment links
    const { data: links } = await supabaseDataClient
      .from('payment_links')
      .select('*')
      .order('delivery_cost');

    // Fetch inventory products with delivery costs
    const { data: products } = await supabaseDataClient
      .from('inventory')
      .select('id, product_name, sku, delivery_cost, price, in_stock')
      .not('delivery_cost', 'is', null);

    if (links) setPaymentLinks(links);

    if (products) {
      const grouped: Record<string, InventoryProduct[]> = {};
      products.forEach((p: InventoryProduct) => {
        if (p.delivery_cost) {
          if (!grouped[p.delivery_cost]) grouped[p.delivery_cost] = [];
          grouped[p.delivery_cost].push(p);
        }
      });
      setProductsByDeliveryCost(grouped);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEdit = (link: PaymentLink) => {
    setEditingId(link.id);
    setEditValues({ payment_url: link.payment_url, label: link.label });
  };

  const handleSave = (id: number) => {
    updateRecord(
      {
        resource: 'payment_links',
        id,
        values: editValues,
      },
      {
        onSuccess: () => {
          setEditingId(null);
          setSnackbar({ open: true, message: hebrewTranslations.paymentLinks.messages.updateSuccess, severity: 'success' });
          fetchData();
        },
        onError: () => {
          setSnackbar({ open: true, message: hebrewTranslations.paymentLinks.messages.updateFailed, severity: 'error' });
        },
      }
    );
  };

  const handleToggleActive = (id: number, currentValue: boolean) => {
    updateRecord(
      {
        resource: 'payment_links',
        id,
        values: { is_active: !currentValue },
      },
      {
        onSuccess: () => fetchData(),
      }
    );
  };

  const handleAdd = () => {
    if (!newLink.delivery_cost || !newLink.payment_url) return;
    createRecord(
      {
        resource: 'payment_links',
        values: newLink,
      },
      {
        onSuccess: () => {
          setAddDialogOpen(false);
          setNewLink({ delivery_cost: '', payment_url: '', label: '' });
          setSnackbar({ open: true, message: hebrewTranslations.paymentLinks.messages.updateSuccess, severity: 'success' });
          fetchData();
        },
        onError: () => {
          setSnackbar({ open: true, message: hebrewTranslations.paymentLinks.messages.updateFailed, severity: 'error' });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteRecord(
      {
        resource: 'payment_links',
        id,
      },
      {
        onSuccess: () => {
          setSnackbar({ open: true, message: hebrewTranslations.notifications.deleteSuccess, severity: 'success' });
          fetchData();
        },
      }
    );
  };

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setSnackbar({ open: true, message: hebrewTranslations.paymentLinks.messages.linkCopied, severity: 'success' });
  };

  const getProductCount = (deliveryCost: string): number => {
    return productsByDeliveryCost[deliveryCost]?.length || 0;
  };

  return (
    <List
      title={hebrewTranslations.paymentLinks.title}
      headerButtons={() => (
        <Button
          startIcon={<AddIcon />}
          variant="contained"
          size="small"
          onClick={() => setAddDialogOpen(true)}
        >
          {hebrewTranslations.paymentLinks.actions.addLink}
        </Button>
      )}
    >
      <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell width={50} />
              <TableCell>{hebrewTranslations.paymentLinks.columns.deliveryCost}</TableCell>
              <TableCell>{hebrewTranslations.paymentLinks.columns.label}</TableCell>
              <TableCell sx={{ minWidth: 350 }}>{hebrewTranslations.paymentLinks.columns.paymentUrl}</TableCell>
              <TableCell align="center">{hebrewTranslations.paymentLinks.columns.productCount}</TableCell>
              <TableCell align="center">{hebrewTranslations.paymentLinks.columns.isActive}</TableCell>
              <TableCell align="center">{hebrewTranslations.actions.edit}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paymentLinks.map((link) => (
              <Fragment key={link.id}>
                <TableRow hover>
                  {/* Expand button */}
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => setExpandedRow(expandedRow === link.id ? null : link.id)}
                    >
                      {expandedRow === link.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </TableCell>

                  {/* Delivery Cost */}
                  <TableCell>
                    <Chip
                      label={link.delivery_cost}
                      color="primary"
                      variant="outlined"
                      sx={{ fontWeight: 700, fontSize: '1rem' }}
                    />
                  </TableCell>

                  {/* Label */}
                  <TableCell>
                    {editingId === link.id ? (
                      <TextField
                        size="small"
                        value={editValues.label || ''}
                        onChange={(e) => setEditValues({ ...editValues, label: e.target.value })}
                        fullWidth
                      />
                    ) : (
                      <Typography variant="body2">{link.label || '-'}</Typography>
                    )}
                  </TableCell>

                  {/* Payment URL */}
                  <TableCell>
                    {editingId === link.id ? (
                      <TextField
                        size="small"
                        value={editValues.payment_url || ''}
                        onChange={(e) => setEditValues({ ...editValues, payment_url: e.target.value })}
                        fullWidth
                        placeholder="https://..."
                        dir="ltr"
                      />
                    ) : link.payment_url ? (
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <LinkIcon fontSize="small" color="action" />
                        <Typography
                          variant="body2"
                          dir="ltr"
                          sx={{
                            maxWidth: 300,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {link.payment_url}
                        </Typography>
                        <Tooltip title={hebrewTranslations.paymentLinks.actions.copyLink}>
                          <IconButton size="small" onClick={() => handleCopyLink(link.payment_url)}>
                            <CopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="פתח">
                          <IconButton
                            size="small"
                            onClick={() => window.open(link.payment_url, '_blank')}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.disabled">
                        {hebrewTranslations.paymentLinks.messages.noUrlSet}
                      </Typography>
                    )}
                  </TableCell>

                  {/* Product Count */}
                  <TableCell align="center">
                    <Chip
                      label={getProductCount(link.delivery_cost)}
                      size="small"
                      color={getProductCount(link.delivery_cost) > 0 ? 'info' : 'default'}
                    />
                  </TableCell>

                  {/* Active Toggle */}
                  <TableCell align="center">
                    <Switch
                      checked={link.is_active}
                      onChange={() => handleToggleActive(link.id, link.is_active)}
                      color="success"
                      size="small"
                    />
                  </TableCell>

                  {/* Actions */}
                  <TableCell align="center">
                    {editingId === link.id ? (
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <IconButton size="small" color="primary" onClick={() => handleSave(link.id)}>
                          <SaveIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => setEditingId(null)}>
                          <CancelIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ) : (
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <IconButton size="small" onClick={() => handleEdit(link)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleDelete(link.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>

                {/* Expanded Products Row */}
                <TableRow key={`${link.id}-expand`}>
                  <TableCell colSpan={7} sx={{ py: 0, borderBottom: expandedRow === link.id ? undefined : 'none' }}>
                    <Collapse in={expandedRow === link.id} timeout="auto" unmountOnExit>
                      <Box sx={{ py: 2, px: 3 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          {hebrewTranslations.paymentLinks.messages.productsWithCost}
                        </Typography>
                        {(productsByDeliveryCost[link.delivery_cost] || []).length > 0 ? (
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>שם מוצר</TableCell>
                                <TableCell>מק"ט</TableCell>
                                <TableCell>מחיר</TableCell>
                                <TableCell>במלאי</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {(productsByDeliveryCost[link.delivery_cost] || []).map((product) => (
                                <TableRow key={product.id}>
                                  <TableCell>{product.product_name}</TableCell>
                                  <TableCell>
                                    <Box className="ltr-content" sx={{ fontFamily: 'monospace' }}>
                                      {product.sku || '-'}
                                    </Box>
                                  </TableCell>
                                  <TableCell>
                                    {product.price ? `₪${product.price.toLocaleString('he-IL')}` : '-'}
                                  </TableCell>
                                  <TableCell>
                                    <Chip
                                      label={product.in_stock ? 'במלאי' : 'אזל'}
                                      size="small"
                                      color={product.in_stock ? 'success' : 'error'}
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <Typography variant="body2" color="text.disabled">
                            אין מוצרים עם עלות משלוח זו
                          </Typography>
                        )}
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
            {paymentLinks.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography color="text.disabled" sx={{ py: 4 }}>
                    {hebrewTranslations.paymentLinks.messages.noLinks}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add New Link Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{hebrewTranslations.paymentLinks.actions.addLink}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={hebrewTranslations.paymentLinks.columns.deliveryCost}
              value={newLink.delivery_cost}
              onChange={(e) => setNewLink({ ...newLink, delivery_cost: e.target.value })}
              fullWidth
              placeholder="₪ 59"
            />
            <TextField
              label={hebrewTranslations.paymentLinks.columns.paymentUrl}
              value={newLink.payment_url}
              onChange={(e) => setNewLink({ ...newLink, payment_url: e.target.value })}
              fullWidth
              placeholder="https://..."
              dir="ltr"
            />
            <TextField
              label={hebrewTranslations.paymentLinks.columns.label}
              value={newLink.label}
              onChange={(e) => setNewLink({ ...newLink, label: e.target.value })}
              fullWidth
              placeholder="משלוח 59 ₪"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>{hebrewTranslations.actions.cancel}</Button>
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={!newLink.delivery_cost || !newLink.payment_url}
          >
            {hebrewTranslations.actions.save}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </List>
  );
}
