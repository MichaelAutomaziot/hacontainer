"use client";

import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
  alpha,
} from "@mui/material";
import {
  Add as AddIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  RuleFolder as RulesIcon,
} from "@mui/icons-material";
import { useGetIdentity, useList } from "@refinedev/core";
import { CHANNEL_HE, describeRule, type Rule } from "@/components/settings/pricing-rule-labels";
import type { UserIdentity } from "@/types/user";

export function ProfileSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data: identity } = useGetIdentity<UserIdentity>();

  const { data, isFetching } = useList<Rule>({
    resource: "pricing_rules",
    pagination: { pageSize: 100 },
    sorters: [
      { field: "channel", order: "asc" },
      { field: "rule_type", order: "asc" },
    ],
    queryOptions: { enabled: open },
  });
  const rules = (data?.data ?? []) as Rule[];

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Dialog open={open} onClose={onClose} dir="rtl" maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        הגדרות פרופיל
        <IconButton size="small" onClick={onClose} aria-label="סגירה">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {/* Account */}
          <Box>
            <Typography variant="overline" color="text.secondary">חשבון</Typography>
            <Typography sx={{ fontWeight: 700, mt: 0.25 }}>{identity?.name ?? "משתמש"}</Typography>
            {identity?.email && (
              <Typography variant="body2" color="text.secondary" sx={{ direction: "ltr", textAlign: "start" }}>
                {identity.email}
              </Typography>
            )}
          </Box>

          <Divider />

          {/* Pricing rules */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <RulesIcon fontSize="small" color="action" />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>חוקי תמחור</Typography>
              </Stack>
              <Button size="small" variant="outlined" startIcon={<AddIcon fontSize="small" />} onClick={() => go("/settings/rules/create")}>
                הוסף חוק
              </Button>
            </Stack>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
              אלה החוקים שקובעים איך מתומחרים המוצרים בסופר-פארם. ללחיצה על “שינוי” תיפתח עריכה בעברית — בלי קוד.
            </Typography>

            {isFetching && rules.length === 0 ? (
              <Typography variant="body2" color="text.secondary">טוען חוקים…</Typography>
            ) : rules.length === 0 ? (
              <Typography variant="body2" color="text.secondary">אין עדיין חוקי תמחור.</Typography>
            ) : (
              <Stack spacing={1}>
                {rules.map((r) => {
                  const d = describeRule(r);
                  return (
                    <Paper
                      key={r.id}
                      variant="outlined"
                      sx={(theme) => ({
                        p: 1.5,
                        borderRadius: 1.5,
                        borderColor: alpha(theme.palette.text.primary, 0.12),
                        opacity: r.active ? 1 : 0.62,
                      })}
                    >
                      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                        <Box sx={{ minWidth: 0 }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }} flexWrap="wrap" useFlexGap>
                            <Typography sx={{ fontWeight: 700 }}>{d.title}</Typography>
                            <Chip size="small" label={CHANNEL_HE[r.channel] ?? r.channel} variant="outlined" />
                            {r.active ? <Chip size="small" color="success" label="פעיל" /> : <Chip size="small" label="כבוי" />}
                          </Stack>
                          <Typography variant="body2" color="text.secondary">{d.line}</Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<EditIcon fontSize="small" />}
                          onClick={() => go(`/settings/rules/edit/${r.id}`)}
                          sx={{ flexShrink: 0 }}
                        >
                          שינוי
                        </Button>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            )}

            <Button
              variant="text"
              size="small"
              onClick={() => go("/board/settings?tab=rules")}
              sx={{ mt: 1 }}
            >
              לכל ההגדרות המתקדמות
            </Button>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default ProfileSettingsDialog;
