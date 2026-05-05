'use client';

import { useDataGrid, List } from '@refinedev/mui';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import {
  Box,
  TextField,
  MenuItem,
  Switch,
  IconButton,
  Tooltip,
  Stack,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Add as AddIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { useUpdate, useCreate } from '@refinedev/core';
import { hebrewTranslations } from '@/locales/he';
import { DataPanel, FilterBar } from '@/components/shared';
import { Supplier } from '@/types/inventory';
import { useState } from 'react';

export default function SuppliersPage() {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    business_name: '',
    email: '',
  });

  // Build the OR filter for search (escaped server-side via data-provider).
  const orSearch = searchQuery.trim()
    ? { fields: ['name', 'business_name', 'email'], value: searchQuery.trim() }
    : undefined;

  const { dataGridProps, tableQueryResult } = useDataGrid<Supplier>({
    resource: 'suppliers',
    pagination: {
      mode: 'server',
      pageSize: 25,
    },
    sorters: {
      initial: [
        {
          field: 'name',
          order: 'asc',
        },
      ],
    },
    filters: {
      permanent: [
        ...(statusFilter === 'active'
          ? [{ field: 'is_active', operator: 'eq' as const, value: true }]
          : statusFilter === 'inactive'
            ? [{ field: 'is_active', operator: 'eq' as const, value: false }]
            : []),
      ],
    },
    meta: orSearch ? { orSearch } : undefined,
  });

  const { mutate: updateSupplier } = useUpdate();
  const { mutate: createSupplier } = useCreate();

  const handleActiveToggle = (supplier: Supplier) => {
    updateSupplier(
      {
        resource: 'suppliers',
        id: supplier.id,
        values: {
          is_active: !supplier.is_active,
          updated_at: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          tableQueryResult?.refetch();
        },
      }
    );
  };

  const handleOpenDialog = (supplier?: Supplier) => {
    if (supplier) {
      setEditingSupplier(supplier);
      setFormData({
        name: supplier.name,
        business_name: supplier.business_name || '',
        email: supplier.email,
      });
    } else {
      setEditingSupplier(null);
      setFormData({ name: '', business_name: '', email: '' });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingSupplier(null);
    setFormData({ name: '', business_name: '', email: '' });
  };

  const handleSaveSupplier = () => {
    if (!formData.name || !formData.email) return;

    if (editingSupplier) {
      updateSupplier(
        {
          resource: 'suppliers',
          id: editingSupplier.id,
          values: {
            ...formData,
            updated_at: new Date().toISOString(),
          },
        },
        {
          onSuccess: () => {
            handleCloseDialog();
            tableQueryResult?.refetch();
          },
        }
      );
    } else {
      createSupplier(
        {
          resource: 'suppliers',
          values: {
            ...formData,
            is_active: true,
          },
        },
        {
          onSuccess: () => {
            handleCloseDialog();
            tableQueryResult?.refetch();
          },
        }
      );
    }
  };

  const columns: GridColDef<Supplier>[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 70,
    },
    {
      field: 'name',
      headerName: hebrewTranslations.suppliers.columns.name,
      width: 200,
      minWidth: 150,
    },
    {
      field: 'business_name',
      headerName: hebrewTranslations.suppliers.columns.businessName,
      width: 250,
      flex: 1,
      minWidth: 200,
      renderCell: ({ row }) => row.business_name || '-',
    },
    {
      field: 'email',
      headerName: hebrewTranslations.suppliers.columns.email,
      width: 250,
      renderCell: ({ row }) => (
        <Box className="ltr-content">
          <a href={`mailto:${row.email}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            {row.email}
          </a>
        </Box>
      ),
    },
    {
      field: 'is_active',
      headerName: hebrewTranslations.suppliers.columns.isActive,
      width: 130,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch
            checked={row.is_active}
            onChange={() => handleActiveToggle(row)}
            size="small"
            color="success"
          />
          <Chip
            label={row.is_active ? hebrewTranslations.suppliers.status.active : hebrewTranslations.suppliers.status.inactive}
            size="small"
            color={row.is_active ? 'success' : 'default'}
            variant="outlined"
          />
        </Box>
      ),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: hebrewTranslations.shipments.columns.actions,
      width: 80,
      getActions: ({ row }) => [
        <Tooltip key="edit" title={hebrewTranslations.actions.edit}>
          <IconButton
            size="small"
            onClick={() => handleOpenDialog(row)}
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
      title={hebrewTranslations.suppliers.title}
      headerButtons={() => (
        <>
          <Tooltip title={hebrewTranslations.actions.refresh}>
            <IconButton onClick={() => tableQueryResult?.refetch()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            {hebrewTranslations.suppliers.actions.addSupplier}
          </Button>
        </>
      )}
    >
      {/* Search and Filters */}
      <FilterBar sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} useFlexGap>
          {/* Search Field */}
          <TextField
            placeholder={hebrewTranslations.suppliers.messages.searchPlaceholder}
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

          {/* Status Filter */}
          <TextField
            select
            label={hebrewTranslations.suppliers.filters.status}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">{hebrewTranslations.shipments.filters.all}</MenuItem>
            <MenuItem value="active">{hebrewTranslations.suppliers.status.active}</MenuItem>
            <MenuItem value="inactive">{hebrewTranslations.suppliers.status.inactive}</MenuItem>
          </TextField>
        </Stack>
      </FilterBar>

      {/* DataGrid */}
      <DataPanel>
      <DataGrid
        {...dataGridProps}
        columns={columns}
        autoHeight
        pageSizeOptions={[10, 25, 50, 100]}
        disableRowSelectionOnClick
        sx={{
          '& .MuiDataGrid-row:hover': {
            backgroundColor: 'action.hover',
          },
        }}
      />
      </DataPanel>

      {/* Add/Edit Supplier Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingSupplier
            ? hebrewTranslations.suppliers.actions.editSupplier
            : hebrewTranslations.suppliers.actions.addSupplier}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={hebrewTranslations.suppliers.columns.name}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              fullWidth
            />
            <TextField
              label={hebrewTranslations.suppliers.columns.businessName}
              value={formData.business_name}
              onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
              fullWidth
            />
            <TextField
              label={hebrewTranslations.suppliers.columns.email}
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              fullWidth
              dir="ltr"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>{hebrewTranslations.actions.cancel}</Button>
          <Button
            variant="contained"
            onClick={handleSaveSupplier}
            disabled={!formData.name || !formData.email}
          >
            {hebrewTranslations.actions.save}
          </Button>
        </DialogActions>
      </Dialog>
    </List>
  );
}
