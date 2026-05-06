import { Chip, ChipProps } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  LocalShipping as LocalShippingIcon,
  Warning as WarningIcon,
  Cancel as CancelIcon,
  Inventory as InventoryIcon,
  Loop as LoopIcon,
} from '@mui/icons-material';
import { hebrewTranslations } from '@/locales/he';
import { STATUS_COLOR_MAP, ShipmentStatus } from '@/types/shipments';

interface StatusBadgeProps {
  statusCode: string | null | undefined;
  size?: 'small' | 'medium';
}

/**
 * Status icon mapping
 */
const STATUS_ICON_MAP: Record<string, React.ReactElement> = {
  [ShipmentStatus.CLOSED]: <CheckCircleIcon fontSize="small" />,
  [ShipmentStatus.COMPLETED]: <CheckCircleIcon fontSize="small" />,
  [ShipmentStatus.IN_DELIVERY]: <LocalShippingIcon fontSize="small" />,
  [ShipmentStatus.DELIVERY_FAILED]: <WarningIcon fontSize="small" />,
  [ShipmentStatus.CANCELLED]: <CancelIcon fontSize="small" />,
  [ShipmentStatus.IN_STOCK]: <InventoryIcon fontSize="small" />,
  [ShipmentStatus.WAREHOUSE_ENTRY]: <InventoryIcon fontSize="small" />,
  [ShipmentStatus.RESET_SCANS]: <LoopIcon fontSize="small" />,
};

/**
 * StatusBadge Component
 * Displays shipment status with Hebrew text, color coding, and icon
 */
export function StatusBadge({ statusCode, size = 'small' }: StatusBadgeProps) {
  if (!statusCode) {
    return (
      <Chip
        label="לא ידוע"
        size={size}
        variant="outlined"
        color="default"
      />
    );
  }

  // Get Hebrew translation
  const label = (hebrewTranslations.shipments.statusMap as Record<string, string>)[statusCode] || statusCode;

  // Get color from mapping
  const color = STATUS_COLOR_MAP[statusCode] || 'default';

  // Get icon
  const icon = STATUS_ICON_MAP[statusCode];

  return (
    <Chip
      label={label}
      size={size}
      color={color as ChipProps['color']}
      icon={icon}
      sx={{
        fontWeight: 850,
        '& .MuiChip-icon': {
          marginRight: '-2px',
          marginLeft: '5px',
        },
      }}
    />
  );
}
