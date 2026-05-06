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
  Grid,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  PendingActions as PendingIcon,
  LocalShipping as ShippingIcon,
} from '@mui/icons-material';
import { useUpdate } from '@refinedev/core';
import { hebrewTranslations } from '@/locales/he';
import { Shipment, getCustomerName } from '@/types/shipments';
import { formatPhone, formatDateRelative } from '@/utils/formatters';
import { DataPanel, FilterBar, KpiCard } from '@/components/shared';
import { useState, useMemo } from 'react';

export default function PickupManagementPage() {
  const [readinessFilter, setReadinessFilter] = useState<string>('not_ready');

  const { dataGridProps, tableQueryResult } = useDataGrid<Shipment>({
    resource: 'shipments',
    pagination: {
      mode: 'server',
      pageSize: 25,
    },
    sorters: {
      initial: [
        {
          field: 'api_created_at',
          order: 'desc',
        },
      ],
    },
    filters: {
      permanent: [
        // Only show pickup orders
        {
          field: 'is_pickup',
          operator: 'eq' as const,
          value: true,
        },
        // Apply readiness filter
        ...(readinessFilter === 'ready'
          ? [
              {
                field: 'pickup_ready',
                operator: 'eq' as const,
                value: true,
              },
            ]
          : readinessFilter === 'not_ready'
            ? [
                {
                  field: 'pickup_ready',
                  operator: 'eq' as const,
                  value: false,
                },
              ]
            : []),
      ],
    },
  });

  const { mutate: updateShipment } = useUpdate();

  const handlePickupReadyToggle = (shipmentId: number, currentValue: boolean) => {
    updateShipment(
      {
        resource: 'shipments',
        id: shipmentId,
        values: {
          pickup_ready: !currentValue,
        },
      },
      {
        onSuccess: () => {
          tableQueryResult?.refetch();
        },
      }
    );
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const rows = dataGridProps.rows || [];
    const total = rows.length;
    const ready = rows.filter((r) => r.pickup_ready).length;
    const notReady = rows.filter((r) => !r.pickup_ready).length;

    return { total, ready, notReady };
  }, [dataGridProps.rows]);

  const columns: GridColDef<Shipment>[] = [
    {
      field: 'order_number',
      headerName: hebrewTranslations.shipments.columns.orderNumber,
      width: 140,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {row.order_number || '-'}
        </Box>
      ),
    },
    {
      field: 'shipping_code',
      headerName: hebrewTranslations.shipments.columns.shippingCode,
      width: 150,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
          {row.shipping_code || '-'}
        </Box>
      ),
    },
    {
      field: 'customer_name',
      headerName: hebrewTranslations.shipments.columns.customerName,
      width: 200,
      valueGetter: ({ row }) => getCustomerName(row),
      renderCell: ({ row }) => (
        <Box sx={{ fontWeight: 500 }}>
          {getCustomerName(row)}
        </Box>
      ),
    },
    {
      field: 'normalized_phone',
      headerName: hebrewTranslations.shipments.columns.phone,
      width: 150,
      renderCell: ({ row }) => (
        <Box className="ltr-content">
          {row.normalized_phone ? (
            <a
              href={`tel:+${row.normalized_phone}`}
              style={{
                textDecoration: 'none',
                color: '#1976d2',
                fontWeight: 500,
              }}
            >
              {formatPhone(row.normalized_phone)}
            </a>
          ) : (
            '-'
          )}
        </Box>
      ),
    },
    {
      field: 'products',
      headerName: hebrewTranslations.pickupManagement.columns.products,
      width: 300,
      renderCell: ({ row }) => {
        if (!row.products_clean || row.products_clean.length === 0) {
          return '-';
        }

        const productNames = row.products_clean
          .map((p: any) => p.name || p.product_name)
          .filter(Boolean)
          .join(', ');

        return (
          <Tooltip title={productNames} arrow>
            <Box
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {productNames}
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'pickup_ready',
      headerName: hebrewTranslations.shipments.columns.pickupReady,
      width: 180,
      renderCell: ({ row }) => (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Switch
            checked={row.pickup_ready || false}
            onChange={() => handlePickupReadyToggle(row.id, row.pickup_ready || false)}
            size="medium"
            color="success"
          />
          <Chip
            label={
              row.pickup_ready
                ? hebrewTranslations.pickupManagement.status.ready
                : hebrewTranslations.pickupManagement.status.notReady
            }
            size="small"
            color={row.pickup_ready ? 'success' : 'warning'}
            icon={row.pickup_ready ? <CheckCircleIcon /> : <PendingIcon />}
          />
        </Stack>
      ),
    },
    {
      field: 'api_created_at',
      headerName: hebrewTranslations.shipments.columns.createdDate,
      width: 140,
      renderCell: ({ row }) => formatDateRelative(row.api_created_at),
    },
  ];

  return (
    <List
      title={hebrewTranslations.pickupManagement.title}
      headerButtons={({ defaultButtons }) => (
        <>
          <Tooltip title={hebrewTranslations.actions.refresh}>
            <IconButton
              onClick={() => tableQueryResult?.refetch()}
              color="primary"
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </>
      )}
    >
      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={4}>
          <KpiCard label={hebrewTranslations.pickupManagement.stats.totalPickups} value={stats.total} icon={<ShippingIcon />} color="primary" />
        </Grid>

        <Grid item xs={12} sm={4}>
          <KpiCard label={hebrewTranslations.pickupManagement.stats.ready} value={stats.ready} icon={<CheckCircleIcon />} color="success" />
        </Grid>

        <Grid item xs={12} sm={4}>
          <KpiCard label={hebrewTranslations.pickupManagement.stats.pending} value={stats.notReady} icon={<PendingIcon />} color="warning" />
        </Grid>
      </Grid>

      {/* Filter */}
      <FilterBar sx={{ mb: 2 }}>
        <TextField
          select
          label={hebrewTranslations.pickupManagement.filters.readinessStatus}
          value={readinessFilter}
          onChange={(e) => setReadinessFilter(e.target.value)}
          size="small"
          sx={{ minWidth: 250 }}
        >
          <MenuItem value="all">{hebrewTranslations.shipments.filters.all}</MenuItem>
          <MenuItem value="not_ready">{hebrewTranslations.pickupManagement.filters.notReady}</MenuItem>
          <MenuItem value="ready">{hebrewTranslations.pickupManagement.filters.ready}</MenuItem>
        </TextField>
      </FilterBar>

      {/* DataGrid */}
      <DataPanel>
      <DataGrid
        {...dataGridProps}
        columns={columns}
        autoHeight
        pageSizeOptions={[10, 25, 50, 100]}
        disableRowSelectionOnClick
        getRowClassName={(params) =>
          params.row.pickup_ready ? 'pickup-ready-row' : 'pickup-pending-row'
        }
        sx={{
          '& .pickup-ready-row': {
            bgcolor: 'success.lighter',
            '&:hover': {
              bgcolor: 'success.light',
            },
          },
          '& .pickup-pending-row': {
            bgcolor: 'warning.lighter',
            '&:hover': {
              bgcolor: 'warning.light',
            },
          },
          '& .MuiDataGrid-row': {
            cursor: 'pointer',
          },
        }}
      />
      </DataPanel>
    </List>
  );
}
