"use client";

import { Box, Paper, Typography, Stack, Chip, Button, Divider } from "@mui/material";
import { Print as PrintIcon, PictureAsPdf as PdfIcon } from "@mui/icons-material";
import { useList } from "@refinedev/core";
import { PageFrame, PageHeader } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";

const fmt = new Intl.NumberFormat("he-IL");

export default function PilotReportPage() {
  const { data } = useList({
    resource: "inventory",
    pagination: { pageSize: 100 },
    filters: [{ field: "pilot_status", operator: "in", value: ["uploaded", "ran_approved"] } as never],
  });
  const rows = data?.data ?? [];

  return (
    <PageFrame maxWidth={1160}>
      <PageHeader
        title={t.pilot.nav.pilotReport}
        subtitle="דוח חתימה נקי למוצרים שעברו העלאה או אישור רן."
        icon={<PdfIcon />}
        tone="secondary"
        stats={<Chip label={`סה"כ ${fmt.format(rows.length)} מוצרים`} color="secondary" />}
        actions={
          <>
          <Button startIcon={<PrintIcon />} variant="outlined" onClick={() => window.print()}>{t.actions.export}</Button>
          <Button startIcon={<PdfIcon />} variant="contained" disabled>ייצא PDF (בקרוב)</Button>
          </>
        }
      />

      <Paper sx={{ p: 4, maxWidth: 900, mx: "auto" }}>
        <Stack alignItems="center" spacing={1} sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>דו"ח חתימה · פיילוט סופר-פארם</Typography>
          <Typography color="text.secondary">{new Date().toLocaleDateString("he-IL", { dateStyle: "full" })}</Typography>
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <Chip label={`סה"כ מוצרים בפיילוט: ${fmt.format(rows.length)}`} color="primary" />
          <Chip label="לקוח: רן פיינה" />
          <Chip label="חנות: HaContainer" />
          <Chip label="יעד: סופר-פארם Marketplace" />
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>רשימת המוצרים שאושרו</Typography>
        {rows.length === 0 ? (
          <Typography color="text.secondary">טרם הועלו מוצרים. השלם את ההעלאה ב{`"${t.pilot.nav.pilotQueue}"`} ואז תוכל להפיק דו"ח.</Typography>
        ) : (
          <Box component="ol" sx={{ pl: 3, m: 0 }}>
            {rows.map((r) => (
              <Box component="li" key={(r as { id: number }).id} sx={{ mb: 1 }}>
                <Typography variant="body2"><b>{(r as { name_he?: string }).name_he}</b></Typography>
                <Typography variant="caption" color="text.secondary" sx={{ direction: "ltr" }}>
                  EAN: {(r as { ean?: string | null }).ean ?? "—"} · ID: {(r as { id: number }).id}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        <Divider sx={{ my: 4 }} />

        <Stack direction="row" spacing={6} sx={{ mt: 6 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" color="text.secondary">חתימת הלקוח (רן פיינה)</Typography>
            <Box sx={{ borderBottom: "1px solid #000", height: 60 }} />
            <Typography variant="caption" color="text.secondary">תאריך: ____________</Typography>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" color="text.secondary">חתימת הספק (Automaziot)</Typography>
            <Box sx={{ borderBottom: "1px solid #000", height: 60 }} />
            <Typography variant="caption" color="text.secondary">תאריך: ____________</Typography>
          </Box>
        </Stack>
      </Paper>
    </PageFrame>
  );
}
