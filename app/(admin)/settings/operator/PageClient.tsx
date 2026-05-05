"use client";

import { Stack, Chip, Grid } from "@mui/material";
import { Tune as OperatorIcon } from "@mui/icons-material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useList } from "@refinedev/core";
import { PageFrame, PageHeader, SectionPanel } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";

type Field = {
  code: string;
  label: string | null;
  description: string | null;
  type: string;
  required: boolean;
  entity: string | null;
  accepted_values: string[] | null;
};

type LogClass = {
  code: string;
  label: string | null;
  active: boolean;
};

export default function OperatorPage() {
  const { data: fields } = useList<Field>({
    resource: "operator_custom_fields",
    pagination: { pageSize: 100 },
    sorters: [{ field: "entity", order: "asc" }, { field: "required", order: "desc" }],
  });
  const { data: classes } = useList<LogClass>({
    resource: "operator_logistic_classes",
    pagination: { pageSize: 100 },
    sorters: [{ field: "code", order: "asc" }],
  });

  const fieldCols: GridColDef<Field>[] = [
    { field: "entity", headerName: "סקופ", width: 100, renderCell: (p) => <Chip size="small" label={p.value ?? "—"} variant="outlined" /> },
    { field: "code", headerName: "קוד", width: 180, renderCell: (p) => <Chip size="small" label={p.value as string} sx={{ direction: "ltr", fontFamily: "monospace" }} /> },
    { field: "label", headerName: "תיאור", width: 220 },
    { field: "type", headerName: "סוג", width: 100 },
    { field: "required", headerName: "חובה", width: 80, renderCell: (p) => p.value ? <Chip size="small" color="error" label="חובה" /> : <Chip size="small" label="אופציונלי" /> },
    {
      field: "accepted_values", headerName: "ערכים מותרים", flex: 1, minWidth: 200, sortable: false,
      renderCell: (p) => Array.isArray(p.value) && p.value.length > 0
        ? <Stack direction="row" spacing={0.5}>{(p.value as string[]).map((v) => <Chip key={v} size="small" label={v} variant="outlined" />)}</Stack>
        : "—"
    },
  ];

  const classCols: GridColDef<LogClass>[] = [
    { field: "code",   headerName: "קוד", width: 180, renderCell: (p) => <Chip size="small" label={p.value as string} sx={{ direction: "ltr", fontFamily: "monospace" }} /> },
    { field: "label",  headerName: "תיאור", flex: 1 },
    { field: "active", headerName: "פעיל", width: 90, renderCell: (p) => p.value ? <Chip size="small" color="success" label="פעיל" /> : <Chip size="small" label="כבוי" /> },
  ];

  return (
    <PageFrame>
      <PageHeader
        title={t.pilot.nav.operatorSettings}
        subtitle="שדות מפעיל, מחלקות לוגיסטיות וערכי חובה לייצוא נקי."
        icon={<OperatorIcon />}
        tone="secondary"
        stats={
          <>
            <Chip label={`${fields?.data?.length ?? 0} שדות`} color="secondary" />
            <Chip label={`${classes?.data?.length ?? 0} מחלקות`} variant="outlined" />
          </>
        }
      />

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <SectionPanel title="שדות נוספים (AF01)" subtitle="הגדרות חובה וערכים מותרים לפי סקופ">
            <DataGrid
              rows={fields?.data ?? []}
              columns={fieldCols}
              getRowId={(r) => r.code}
              autoHeight
              hideFooter
              sx={{ border: "none" }}
            />
          </SectionPanel>
        </Grid>
        <Grid item xs={12}>
          <SectionPanel title="מחלקות לוגיסטיקה" subtitle="טבלת מחלקות פעילות מול קוד מקור">
            <DataGrid
              rows={classes?.data ?? []}
              columns={classCols}
              getRowId={(r) => r.code}
              autoHeight
              hideFooter
              sx={{ border: "none" }}
            />
          </SectionPanel>
        </Grid>
      </Grid>
    </PageFrame>
  );
}
