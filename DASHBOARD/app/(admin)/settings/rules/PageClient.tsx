"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  Tooltip,
} from "@mui/material";
import {
  AddCircle as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  RuleFolder as RulesIcon,
} from "@mui/icons-material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useDelete, useList, useNotification } from "@refinedev/core";
import { DataPanel, JsonViewer, PageFrame, PageHeader, SectionPanel } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";

type Rule = {
  id: string;
  channel: string;
  rule_type: string;
  config: Record<string, unknown>;
  active: boolean;
};

export default function RulesPage() {
  const router = useRouter();
  const { open } = useNotification();
  const { data, isFetching, refetch } = useList<Rule>({
    resource: "pricing_rules",
    pagination: { pageSize: 100 },
    sorters: [{ field: "channel", order: "asc" }, { field: "rule_type", order: "asc" }],
  });
  const rows = data?.data ?? [];
  const { mutate: deleteRule } = useDelete();

  const [pendingDelete, setPendingDelete] = useState<Rule | null>(null);

  const onDeleteConfirm = () => {
    if (!pendingDelete) return;
    const r = pendingDelete;
    deleteRule(
      { resource: "pricing_rules", id: r.id },
      {
        onSuccess: () => {
          open?.({ type: "success", message: `חוק ${r.rule_type}/${r.channel} נמחק` });
          setPendingDelete(null);
          refetch();
        },
        onError: (e) => {
          open?.({ type: "error", message: `מחיקה נכשלה: ${e.message}` });
        },
      },
    );
  };

  const cols: GridColDef<Rule>[] = [
    {
      field: "channel",
      headerName: "ערוץ",
      width: 130,
      renderCell: (p) => (
        <Chip size="small" label={p.value as string} color="primary" variant="outlined" />
      ),
    },
    { field: "rule_type", headerName: "סוג חוק", width: 220 },
    {
      field: "config",
      headerName: "תצורה",
      flex: 1,
      minWidth: 280,
      sortable: false,
      renderCell: (p) => (
        <Box
          sx={{
            direction: "ltr",
            fontFamily: "monospace",
            fontSize: 12,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
          }}
        >
          {JSON.stringify(p.value)}
        </Box>
      ),
    },
    {
      field: "active",
      headerName: "פעיל",
      width: 90,
      renderCell: (p) =>
        p.value ? (
          <Chip size="small" color="success" label="פעיל" />
        ) : (
          <Chip size="small" label="כבוי" />
        ),
    },
    {
      field: "actions",
      headerName: "פעולות",
      width: 130,
      sortable: false,
      filterable: false,
      renderCell: (p) => {
        const r = p.row;
        return (
          <Stack direction="row" spacing={0.5}>
            <Tooltip title={t.actions.edit}>
              <IconButton
                size="small"
                color="primary"
                onClick={() => router.push(`/settings/rules/edit/${r.id}`)}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={t.actions.delete}>
              <IconButton
                size="small"
                color="error"
                onClick={() => setPendingDelete(r)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        );
      },
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        title={t.pilot.nav.pricingRules}
        subtitle="בקרה על חוקי תמחור לפי ערוץ, סוג ותצורה פעילה."
        icon={<RulesIcon />}
        tone="warning"
        stats={<Chip label={`${rows.length} חוקים`} color="info" />}
        actions={
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => router.push("/settings/rules/create")}
          >
            הוספת חוק חדש
          </Button>
        }
      />

      <DataPanel>
        <DataGrid
          rows={rows}
          columns={cols}
          getRowId={(r) => r.id}
          autoHeight
          loading={isFetching}
          sx={{ border: "none" }}
          hideFooter={rows.length <= 25}
        />
      </DataPanel>

      {rows[0] && (
        <SectionPanel title="תצורה מפורטת" subtitle="חוק ראשון ברשימה">
          <JsonViewer value={rows[0].config} maxHeight={300} />
        </SectionPanel>
      )}

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <DialogTitle>מחיקת חוק תמחור</DialogTitle>
        <DialogContent>
          <DialogContentText>
            האם למחוק את החוק <strong>{pendingDelete?.rule_type}</strong> בערוץ{" "}
            <strong>{pendingDelete?.channel}</strong>?
            <br />
            פעולה זו אינה ניתנת לביטול. החוק לא יחול על העלאות הבאות.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>{t.actions.cancel}</Button>
          <Button onClick={onDeleteConfirm} color="error" variant="contained">
            {t.actions.delete}
          </Button>
        </DialogActions>
      </Dialog>
    </PageFrame>
  );
}
