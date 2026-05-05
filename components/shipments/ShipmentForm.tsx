import { useForm } from '@refinedev/react-hook-form';
import {
  Box,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  Grid,
  Typography,
  Divider,
} from '@mui/material';
import { hebrewTranslations } from '@/locales/he';
import { ShipmentFormData } from '@/types/shipments';

interface ShipmentFormProps {
  action: 'create' | 'edit';
}

export function ShipmentForm({ action }: ShipmentFormProps) {
  const {
    register,
    formState: { errors },
    watch,
    setValue,
  } = useForm<ShipmentFormData>({
    refineCoreProps: {
      resource: 'shipments',
      action,
    },
  });

  const isPickup = watch('is_pickup');

  return (
    <Box component="form">
      <Grid container spacing={3}>
        {/* Order Information */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            פרטי הזמנה
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            {...register('order_number')}
            label={hebrewTranslations.forms.labels.orderNumber}
            placeholder={hebrewTranslations.forms.placeholders.orderNumber}
            error={!!errors.order_number}
            helperText={errors.order_number?.message as string | undefined}
            fullWidth
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            {...register('shipping_code')}
            label={hebrewTranslations.forms.labels.shippingCode}
            placeholder={hebrewTranslations.forms.placeholders.shippingCode}
            error={!!errors.shipping_code}
            helperText={errors.shipping_code?.message as string | undefined}
            fullWidth
            className="ltr-input"
          />
        </Grid>

        {/* Customer Information */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            פרטי לקוח
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            {...register('first_name', {
              required: hebrewTranslations.forms.validation.required,
            })}
            label={hebrewTranslations.forms.labels.firstName}
            placeholder={hebrewTranslations.forms.placeholders.firstName}
            error={!!errors.first_name}
            helperText={errors.first_name?.message as string | undefined}
            required
            fullWidth
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            {...register('last_name', {
              required: hebrewTranslations.forms.validation.required,
            })}
            label={hebrewTranslations.forms.labels.lastName}
            placeholder={hebrewTranslations.forms.placeholders.lastName}
            error={!!errors.last_name}
            helperText={errors.last_name?.message as string | undefined}
            required
            fullWidth
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            {...register('normalized_phone', {
              required: hebrewTranslations.forms.validation.required,
              pattern: {
                value: /^972[0-9]{9}$/,
                message: hebrewTranslations.forms.validation.invalidPhone,
              },
            })}
            label={hebrewTranslations.forms.labels.phone}
            placeholder={hebrewTranslations.forms.placeholders.phone}
            error={!!errors.normalized_phone}
            helperText={
              (errors.normalized_phone?.message as string | undefined) ||
              'פורמט: 972501234567 (ללא מקפים וסימנים)'
            }
            required
            fullWidth
            className="ltr-input"
          />
        </Grid>

        {/* Address Information */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            כתובת למשלוח
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            {...register('city', {
              required: hebrewTranslations.forms.validation.required,
            })}
            label={hebrewTranslations.forms.labels.city}
            placeholder={hebrewTranslations.forms.placeholders.city}
            error={!!errors.city}
            helperText={errors.city?.message as string | undefined}
            required
            fullWidth
          />
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField
            {...register('address_street', {
              required: hebrewTranslations.forms.validation.required,
            })}
            label={hebrewTranslations.forms.labels.street}
            placeholder={hebrewTranslations.forms.placeholders.street}
            error={!!errors.address_street}
            helperText={errors.address_street?.message as string | undefined}
            required
            fullWidth
          />
        </Grid>

        <Grid item xs={12} md={2}>
          <TextField
            {...register('address_number', {
              required: hebrewTranslations.forms.validation.required,
            })}
            label={hebrewTranslations.forms.labels.houseNumber}
            placeholder={hebrewTranslations.forms.placeholders.houseNumber}
            error={!!errors.address_number}
            helperText={errors.address_number?.message as string | undefined}
            required
            fullWidth
            className="ltr-input"
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            {...register('address_extra')}
            label={hebrewTranslations.forms.labels.addressExtra}
            placeholder={hebrewTranslations.forms.placeholders.addressExtra}
            error={!!errors.address_extra}
            helperText={errors.address_extra?.message as string | undefined}
            fullWidth
            multiline
            rows={2}
          />
        </Grid>

        {/* Shipping Details */}
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
            פרטי משלוח
          </Typography>
          <Divider sx={{ mb: 2 }} />
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField
            {...register('status_code')}
            select
            label={hebrewTranslations.forms.labels.status}
            defaultValue="6"
            fullWidth
          >
            <MenuItem value="6">{hebrewTranslations.shipments.statusMap['6']}</MenuItem>
            <MenuItem value="27">{hebrewTranslations.shipments.statusMap['27']}</MenuItem>
            <MenuItem value="99">{hebrewTranslations.shipments.statusMap['99']}</MenuItem>
            <MenuItem value="3">{hebrewTranslations.shipments.statusMap['3']}</MenuItem>
            <MenuItem value="30">{hebrewTranslations.shipments.statusMap['30']}</MenuItem>
          </TextField>
        </Grid>

        <Grid item xs={12} md={6}>
          <FormControlLabel
            control={
              <Switch
                {...register('is_pickup')}
                onChange={(e) => {
                  setValue('is_pickup', e.target.checked);
                  if (!e.target.checked) {
                    setValue('pickup_ready', false);
                  }
                }}
              />
            }
            label={hebrewTranslations.shipments.types.pickup}
            sx={{ mt: 1 }}
          />
        </Grid>

        {isPickup && (
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={<Switch {...register('pickup_ready')} color="success" />}
              label={hebrewTranslations.forms.labels.pickupReady}
              sx={{ mt: 1 }}
            />
          </Grid>
        )}

        <Grid item xs={12}>
          <TextField
            {...register('delivered_to')}
            label={hebrewTranslations.shipments.columns.deliveredTo}
            placeholder="שם מקבל המשלוח"
            error={!!errors.delivered_to}
            helperText={errors.delivered_to?.message as string | undefined}
            fullWidth
          />
        </Grid>
      </Grid>
    </Box>
  );
}
