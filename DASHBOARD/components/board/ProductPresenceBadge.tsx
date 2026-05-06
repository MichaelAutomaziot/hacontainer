"use client";

import { Stack, Tooltip, Box, Typography, alpha } from "@mui/material";
import {
  Storefront as SuperPharmIcon,
  Inventory2 as HaContainerIcon,
  HelpOutline as UnknownIcon,
  CheckCircle as PresentIcon,
  RemoveCircle as MissingIcon,
  Warning as ReviewIcon,
} from "@mui/icons-material";

export type Verdict =
  | "missing"
  | "duplicate"
  | "candidate"
  | "manual_review"
  | "exists"
  | null
  | undefined;

export interface ProductPresenceBadgeProps {
  verdict: Verdict;
  size?: "small" | "medium";
  /** show short Hebrew label next to the icons */
  showLabel?: boolean;
}

type ChannelState = "present" | "missing" | "review" | "unknown";

const channelLabel = (state: ChannelState) => {
  switch (state) {
    case "present":
      return "קיים";
    case "missing":
      return "חסר";
    case "review":
      return "דורש בדיקה";
    default:
      return "לא ידוע";
  }
};

const stateColor = (state: ChannelState) => {
  switch (state) {
    case "present":
      return "success" as const;
    case "missing":
      return "error" as const;
    case "review":
      return "warning" as const;
    default:
      return "info" as const;
  }
};

const StateDot = ({ state }: { state: ChannelState }) => {
  const Icon =
    state === "present" ? PresentIcon : state === "missing" ? MissingIcon : state === "review" ? ReviewIcon : UnknownIcon;
  return (
    <Box
      sx={(theme) => ({
        width: 16,
        height: 16,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        bgcolor: alpha(theme.palette[stateColor(state)].main, 0.16),
        color: theme.palette[stateColor(state)].main,
        position: "absolute",
        insetInlineEnd: -3,
        bottom: -3,
        boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
        "& svg": { fontSize: 12 },
      })}
    >
      <Icon fontSize="inherit" />
    </Box>
  );
};

const Channel = ({
  Icon,
  label,
  state,
  size,
  showLabel,
}: {
  Icon: typeof SuperPharmIcon;
  label: string;
  state: ChannelState;
  size: "small" | "medium";
  showLabel: boolean;
}) => {
  const dim = size === "small" ? 28 : 34;
  return (
    <Tooltip title={`${label} · ${channelLabel(state)}`} arrow>
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.7 }}>
        <Box
          sx={(theme) => ({
            position: "relative",
            width: dim,
            height: dim,
            borderRadius: 1.2,
            display: "grid",
            placeItems: "center",
            bgcolor: alpha(theme.palette.text.primary, state === "unknown" ? 0.04 : 0.06),
            color: state === "unknown" ? alpha(theme.palette.text.primary, 0.4) : theme.palette.text.primary,
            border: `1px solid ${alpha(theme.palette.text.primary, 0.08)}`,
            "& svg": { fontSize: size === "small" ? 16 : 18 },
          })}
        >
          <Icon fontSize="inherit" />
          <StateDot state={state} />
        </Box>
        {showLabel && (
          <Typography variant="caption" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
            {label}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
};

const verdictToSp = (verdict: Verdict): ChannelState => {
  if (verdict === "duplicate" || verdict === "exists") return "present";
  if (verdict === "missing") return "missing";
  if (verdict === "candidate" || verdict === "manual_review") return "review";
  return "unknown";
};

export function ProductPresenceBadge({
  verdict,
  size = "small",
  showLabel = false,
}: ProductPresenceBadgeProps) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Channel
        Icon={HaContainerIcon}
        label="הקונטיינר"
        state="present"
        size={size}
        showLabel={showLabel}
      />
      <Channel
        Icon={SuperPharmIcon}
        label="סופר-פארם"
        state={verdictToSp(verdict)}
        size={size}
        showLabel={showLabel}
      />
    </Stack>
  );
}
