'use client';

import { useShow } from '@refinedev/core';
import { Show } from '@refinedev/mui';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Divider,
  Chip,
  Stack,
  Button,
} from '@mui/material';
import { Chat as ChatIcon, Phone as PhoneIcon } from '@mui/icons-material';
import { hebrewTranslations } from '@/locales/he';
import { Shipment, getCustomerName } from '@/types/shipments';
import {
  formatPhone,
  formatPhoneLink,
  formatDateRelative,
  formatAddress,
  formatBoolean,
} from '@/utils/formatters';
import { StatusBadge } from '@/components/shipments/StatusBadge';

const CHATWOOT_BASE_URL = process.env.NEXT_PUBLIC_CHATWOOT_URL || 'https://app.chatwoot.com';

export default function ShipmentShowPage() {
  const { queryResult } = useShow<Shipment>();
  const { data } = queryResult;
  const shipment = data?.data;

  if (!shipment) {
    return <div>Loading...</div>;
  }

  const handleChatwootClick = () => {
    if (shipment.chatwoot_conversation_id) {
      const url = `${CHATWOOT_BASE_URL}/app/accounts/1/conversations/${shipment.chatwoot_conversation_id}`;
      window.open(url, '_blank');
    }
  };

  return (
    <Show>
      <Grid container spacing={3}>
        {/* Order Information Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom color="primary">
                פרטי הזמנה
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {hebrewTranslations.shipments.columns.orderNumber}
                  </Typography>
                  <Typography variant="body1" className="ltr-content">
                    {shipment.order_number || '-'}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {hebrewTranslations.shipments.columns.shippingCode}
                  </Typography>
                  <Typography variant="body1" className="ltr-content">
                    {shipment.shipping_code || '-'}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {hebrewTranslations.shipments.columns.status}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <StatusBadge statusCode={shipment.status_code} size="medium" />
                  </Box>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {hebrewTranslations.shipments.columns.shippingType}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      label={
                        shipment.is_pickup
                          ? hebrewTranslations.shipments.types.pickup
                          : hebrewTranslations.shipments.types.regular
                      }
                      color={shipment.is_pickup ? 'primary' : 'default'}
                      variant="outlined"
                    />
                  </Box>
                </Box>

                {shipment.is_pickup && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {hebrewTranslations.shipments.columns.pickupReady}
                    </Typography>
                    <Typography variant="body1">
                      {formatBoolean(shipment.pickup_ready)}
                    </Typography>
                  </Box>
                )}

                {shipment.delivered_to && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      {hebrewTranslations.shipments.columns.deliveredTo}
                    </Typography>
                    <Typography variant="body1">{shipment.delivered_to}</Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Customer Information Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom color="primary">
                פרטי לקוח
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {hebrewTranslations.shipments.columns.customerName}
                  </Typography>
                  <Typography variant="body1">{getCustomerName(shipment)}</Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {hebrewTranslations.shipments.columns.phone}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Typography variant="body1" className="ltr-content">
                      {formatPhone(shipment.normalized_phone)}
                    </Typography>
                    {shipment.normalized_phone && (
                      <Button
                        size="small"
                        startIcon={<PhoneIcon />}
                        href={`tel:${formatPhoneLink(shipment.normalized_phone)}`}
                        variant="outlined"
                      >
                        התקשר
                      </Button>
                    )}
                  </Box>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {hebrewTranslations.shipments.columns.address}
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                    {formatAddress({
                      street: shipment.address_street,
                      houseNumber: shipment.address_number,
                      city: shipment.city,
                      addressExtra: shipment.address_extra,
                    })}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Dates & System Info Card */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom color="primary">
                מידע מערכת
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Stack spacing={2}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {hebrewTranslations.shipments.columns.createdDate}
                  </Typography>
                  <Typography variant="body1">
                    {formatDateRelative(shipment.api_created_at)}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    {hebrewTranslations.shipments.columns.updatedDate}
                  </Typography>
                  <Typography variant="body1">
                    {formatDateRelative(shipment.api_updated_at)}
                  </Typography>
                </Box>

                {shipment.chatwoot_conversation_id && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      שיחת Chatwoot
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <Button
                        variant="outlined"
                        startIcon={<ChatIcon />}
                        onClick={handleChatwootClick}
                      >
                        {hebrewTranslations.actions.openChat}
                      </Button>
                    </Box>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {/* Products Card (if available) */}
        {shipment.products_clean && shipment.products_clean.length > 0 && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom color="primary">
                  מוצרים
                </Typography>
                <Divider sx={{ mb: 2 }} />

                <Stack spacing={1.5}>
                  {shipment.products_clean.map((product, index) => (
                    <Box
                      key={index}
                      sx={{
                        p: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                      }}
                    >
                      <Typography variant="body2" fontWeight={500}>
                        {product.name || `מוצר ${index + 1}`}
                      </Typography>
                      {product.sku && (
                        <Typography variant="caption" color="text.secondary">
                          SKU: {product.sku}
                        </Typography>
                      )}
                      {product.quantity && (
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          כמות: {product.quantity}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Show>
  );
}
