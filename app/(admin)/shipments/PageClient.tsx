'use client';

import { useDataGrid, List, EditButton, ShowButton } from '@refinedev/mui';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import {
  Box,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  IconButton,
  Tooltip,
  Stack,
  Chip,
} from '@mui/material';
import {
  Chat as ChatIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useUpdate } from '@refinedev/core';
import { hebrewTranslations } from '@/locales/he';
import { Shipment, getCustomerName } from '@/types/shipments';
import { formatPhone, formatDateRelative, formatAddressSingleLine } from '@/utils/formatters';
import { StatusBadge } from '@/components/shipments/StatusBadge';
import { DataPanel, FilterBar } from '@/components/shared';
import { useState } from 'react';

const CHATWOOT_BASE_URL = process.env.NEXT_PUBLIC_CHATWOOT_URL || 'https://app.chatwoot.com';

export default function ShipmentsListPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [pickupFilter, setPickupFilter] = useState<string>('pickup');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Build the OR filter for search (escaped server-side via data-provider).
  const orSearch = searchQuery.trim()
    ? {
        fields: ['first_name', 'last_name', 'customer_phone', 'order_number'],
        value: searchQuery.trim(),
      }
    : undefined;

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
        // Apply status filter if selected
        ...(statusFilter
          ? [
              {
                field: 'status_code',
                operator: 'eq' as const,
                value: statusFilter,
              },
            ]
          : []),
        // Apply pickup filter
        ...(pickupFilter === 'pickup'
          ? [
              {
                field: 'is_pickup',
                operator: 'eq' as const,
                value: true,
              },
            ]
          : pickupFilter === 'delivery'
            ? [
                {
                  field: 'is_pickup',
                  operator: 'eq' as const,
                  value: false,
                },
              ]
            : []),
      ],
    },
    meta: orSearch ? { orSearch } : undefined,
  });

  const { mutate: updateShipment } = useUpdate();

  const handlePickupReadyToggle = (shipmentId: number, currentValue: boolean) => {
    updateShipment({
      resource: 'shipments',
      id: shipmentId,
      values: { pickup_ready: !currentValue },
      mutationMode: 'optimistic',
    });
  };

  const handlePickedUpToggle = (shipmentId: number, currentValue: boolean) => {
    updateShipment({
      resource: 'shipments',
      id: shipmentId,
      values: { picked_up: !currentValue },
      mutationMode: 'optimistic',
    });
  };

  const handleChatwootClick = (conversationId: number) => {
    const url = `${CHATWOOT_BASE_URL}/app/accounts/1/conversations/${conversationId}`;
    window.open(url, '_blank');
  };

  const columns: GridColDef<Shipment>[] = [
    {
      field: 'order_number',
      headerName: hebrewTranslations.shipments.columns.orderNumber,
      width: 130,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
          {row.order_number || '-'}
        </Box>
      ),
    },
    {
      field: 'pickup_ready',
      headerName: hebrewTranslations.shipments.columns.pickupReady,
      width: 140,
      renderCell: ({ row }) => (
        <Switch
          checked={row.pickup_ready || false}
          onChange={() => handlePickupReadyToggle(row.id, row.pickup_ready || false)}
          disabled={!row.is_pickup}
          size="small"
          color="success"
        />
      ),
    },
    {
      field: 'picked_up',
      headerName: hebrewTranslations.shipments.columns.pickedUp,
      width: 100,
      renderCell: ({ row }) => (
        <Switch
          checked={row.picked_up || false}
          onChange={() => handlePickedUpToggle(row.id, row.picked_up || false)}
          disabled={!row.is_pickup}
          size="small"
          color="primary"
        />
      ),
    },
    {
      field: 'sku',
      headerName: hebrewTranslations.shipments.columns.sku,
      width: 150,
      renderCell: ({ row }) => {
        const skus = row.products_clean
          ?.map((product) => product.sku)
          .filter(Boolean)
          .join(', ');
        return (
          <Box className="ltr-content" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {skus || '-'}
          </Box>
        );
      },
    },
    {
      field: 'shipping_code',
      headerName: hebrewTranslations.shipments.columns.shippingCode,
      width: 140,
      renderCell: ({ row }) => (
        <Box className="ltr-content" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {row.shipping_code || '-'}
        </Box>
      ),
    },
    {
      field: 'customer_name',
      headerName: hebrewTranslations.shipments.columns.customerName,
      width: 180,
      valueGetter: ({ row }) => getCustomerName(row),
    },
    {
      field: 'customer_phone',
      headerName: hebrewTranslations.shipments.columns.phone,
      width: 150,
      renderCell: ({ row }) => (
        <Box className="ltr-content">
          {row.customer_phone ? (
            <a
              href={`tel:${row.customer_phone}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              {row.customer_phone}
            </a>
          ) : (
            '-'
          )}
        </Box>
      ),
    },
    {
      field: 'city',
      headerName: hebrewTranslations.shipments.columns.city,
      width: 120,
    },
    {
      field: 'address',
      headerName: hebrewTranslations.shipments.columns.address,
      width: 250,
      renderCell: ({ row }) =>
        formatAddressSingleLine({
          street: row.address_street,
          houseNumber: row.address_number,
          city: row.city,
          addressExtra: row.address_extra,
        }) || '-',
    },
    {
      field: 'status_code',
      headerName: hebrewTranslations.shipments.columns.status,
      width: 150,
      renderCell: ({ row }) => <StatusBadge statusCode={row.status_code} />,
    },
    {
      field: 'is_pickup',
      headerName: hebrewTranslations.shipments.columns.shippingType,
      width: 120,
      renderCell: ({ row }) => (
        <Chip
          label={
            row.is_pickup
              ? hebrewTranslations.shipments.types.pickup
              : hebrewTranslations.shipments.types.regular
          }
          size="small"
          variant="outlined"
          color={row.is_pickup ? 'primary' : 'default'}
        />
      ),
    },
    {
      field: 'api_created_at',
      headerName: hebrewTranslations.shipments.columns.createdDate,
      width: 140,
      renderCell: ({ row }) => formatDateRelative(row.api_created_at),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: hebrewTranslations.shipments.columns.actions,
      width: 180,
      getActions: ({ row }) => [
        <GridActionsCellItem
          key="show"
          label={hebrewTranslations.actions.viewDetails}
          showInMenu
          icon={<ShowButton hideText recordItemId={row.id} />}
        />,
        <GridActionsCellItem
          key="edit"
          label={hebrewTranslations.actions.edit}
          showInMenu
          icon={<EditButton hideText recordItemId={row.id} />}
        />,
        ...(row.chatwoot_conversation_id
          ? [
              <GridActionsCellItem
                key="chatwoot"
                label={hebrewTranslations.actions.openChat}
                showInMenu
                onClick={() => handleChatwootClick(row.chatwoot_conversation_id!)}
                icon={<ChatIcon />}
              />,
            ]
          : []),
      ],
    },
  ];

  return (
    <List
      title={hebrewTranslations.shipments.title}
      headerButtons={({ defaultButtons }) => (
        <>
          <Tooltip title={hebrewTranslations.actions.refresh}>
            <IconButton onClick={() => tableQueryResult?.refetch()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          {defaultButtons}
        </>
      )}
    >
      {/* Search and Filters */}
      <FilterBar sx={{ mb: 2 }}>
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={2}
          alignItems={{ xs: 'stretch', lg: 'center' }}
          useFlexGap
        >
          {/* Search Field */}
          <TextField
            placeholder="חיפוש לפי שם לקוח או טלפון..."
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

          {/* Shipping Type Filter */}
          <TextField
            select
            label={hebrewTranslations.shipments.columns.shippingType}
            value={pickupFilter}
            onChange={(e) => setPickupFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="all">{hebrewTranslations.shipments.filters.all}</MenuItem>
            <MenuItem value="pickup">{hebrewTranslations.shipments.filters.pickupOnly}</MenuItem>
            <MenuItem value="delivery">{hebrewTranslations.shipments.filters.deliveryOnly}</MenuItem>
          </TextField>

          {/* Status Filter */}
          <TextField
            select
            label={hebrewTranslations.shipments.columns.status}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            size="small"
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">{hebrewTranslations.shipments.filters.all}</MenuItem>
            <MenuItem value="99">{hebrewTranslations.shipments.statusMap['99']}</MenuItem>
            <MenuItem value="27">{hebrewTranslations.shipments.statusMap['27']}</MenuItem>
            <MenuItem value="30">{hebrewTranslations.shipments.statusMap['30']}</MenuItem>
            <MenuItem value="3">{hebrewTranslations.shipments.statusMap['3']}</MenuItem>
            <MenuItem value="6">{hebrewTranslations.shipments.statusMap['6']}</MenuItem>
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
    </List>
  );
}
