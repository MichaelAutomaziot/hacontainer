"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
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
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AddCircle as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  RuleFolder as RulesIcon,
  Tune as OperatorIcon,
  AccountTree as CategoryIcon,
  History as JobsIcon,
  Storefront as ChannelsIcon,
  ShoppingBag as ZapIcon,
  Public as WallaIcon,
  Storage as AceIcon,
} from "@mui/icons-material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useDelete, useList, useNotification } from "@refinedev/core";
import {
  BoardShell,
  ChannelToggleRow,
  SyncJobsHistory,
} from "@/components/board";
import { DataPanel, JsonViewer, SectionHeader } from "@/components/shared";

type SettingsTab = "rules" | "operator" | "categories" | "jobs" | "channels";

const TABS: Array<{ key: SettingsTab; label: string; icon: React.ReactElement }> = [
  { key: "rules", label: "חוקי תמחור", icon: <RulesIcon fontSize="small" /> },
  { key: "operator", label: "שדות מפעיל / AF01", icon: <OperatorIcon fontSize="small" /> },
  { key: "categories", label: "קטגוריות", icon: <CategoryIcon fontSize="small" /> },
  { key: "jobs", label: "היסטוריית סנכרונים", icon: <JobsIcon fontSize="small" /> },
  { key: "channels", label: "ערוצים", icon: <ChannelsIcon fontSize="small" /> },
];

export default function BoardSettings() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get("tab") as SettingsTab | null) ?? "rules";
  const [tab, setTab] = useState<SettingsTab>(initial);

  useEffect(() => {
    setTab((params.get("tab") as SettingsTab | null) ?? "rules");
  }, [params]);

  const onTabChange = (next: SettingsTab) => {
    setTab(next);
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", next);
    router.replace(`/board/settings?${sp.toString()}`);
  };

  return (
    <BoardShell
      eyebrow="הגדרות מתקדמות"
      title="בקרה טכנית — חוקים, שדות מפעיל, ערוצים, סנכרונים"
      description="האזור הזה לא נדרש בתפעול היומיומי. נועד לאדמינים שמכוונים את חוקי התמחור, מיפוי הקטגוריות, ולמעקב אחר משימות סנכרון."
      meta={<Chip label="מתקדם" size="small" color="warning" variant="outlined" />}
    >
      <Tabs
        value={tab}
        onChange={(_, v) => onTabChange(v)}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={(theme) => ({
          borderBottom: `1px solid ${theme.palette.divider}`,
          minHeight: 44,
          "& .MuiTab-root": { minHeight: 44, fontWeight: 850, gap: 0.6 },
        })}
      >
        {TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} icon={t.icon} iconPosition="start" />
        ))}
      </Tabs>

      <Box sx={{ pt: 1 }}>
        {tab === "rules" && <RulesTab />}
        {tab === "operator" && <OperatorTab />}
        {tab === "categories" && <CategoriesTab />}
        {tab === "jobs" && <JobsTab />}
        {tab === "channels" && <ChannelsTab />}
      </Box>
    </BoardShell>
  );
}

/* ---------------------- rules tab ---------------------- */

function RulesTab() {
  const router = useRouter();
  const { open } = useNotification();
  const { data, isFetching, refetch } = useList<Rule>({
    resource: "pricing_rules",
    pagination: { pageSize: 100 },
    sorters: [
      { field: "channel", order: "asc" },
      { field: "rule_type", order: "asc" },
    ],
  });
  const rows = (data?.data ?? []) as Rule[];
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
        onError: (e) => open?.({ type: "error", message: `מחיקה נכשלה: ${e.message}` }),
      },
    );
  };

  const cols: GridColDef<Rule>[] = [
    {
      field: "channel",
      headerName: "ערוץ",
      width: 130,
      renderCell: (p) => <Chip size="small" label={p.value as string} color="primary" variant="outlined" />,
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
      renderCell: (p) => (p.value ? <Chip size="small" color="success" label="פעיל" /> : <Chip size="small" label="כבוי" />),
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
            <Tooltip title="ערוך">
              <IconButton size="small" color="primary" onClick={() => router.push(`/settings/rules/edit/${r.id}`)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="מחק">
              <IconButton size="small" color="error" onClick={() => setPendingDelete(r)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        );
      },
    },
  ];

  return (
    <Stack spacing={2}>
      <Alert severity="info" variant="outlined" icon={<RulesIcon fontSize="small" />}>
        <Stack spacing={0.6}>
          <Typography variant="subtitle2">חוקי סופר-פארם הנוכחיים (נעולים)</Typography>
          <Typography variant="body2">
            תוספת משלוח: <strong>₪39</strong> · מקדם מחיר רגיל: <strong>1.15</strong> · משך מבצע: <strong>30 ימים</strong> ·
            התאמת מחיר מתחרים: <strong>כבוי</strong> (עד שנגדיר רצפת רווח).
          </Typography>
        </Stack>
      </Alert>

      <SectionHeader
        title="כל חוקי התמחור"
        subtitle={`${rows.length} חוקים`}
        actions={
          <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => router.push("/settings/rules/create")}>
            הוסף חוק
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
        <DataPanel sx={{ p: 2 }}>
          <Typography variant="overline" color="text.secondary">
            תצורה מפורטת — חוק ראשון
          </Typography>
          <Box sx={{ mt: 1 }}>
            <JsonViewer value={rows[0].config} maxHeight={300} />
          </Box>
        </DataPanel>
      )}

      <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)}>
        <DialogTitle>מחיקת חוק תמחור</DialogTitle>
        <DialogContent>
          <DialogContentText>
            האם למחוק את החוק <strong>{pendingDelete?.rule_type}</strong> בערוץ <strong>{pendingDelete?.channel}</strong>?
            <br />
            פעולה זו אינה ניתנת לביטול.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>ביטול</Button>
          <Button onClick={onDeleteConfirm} color="error" variant="contained">
            מחק
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

type Rule = {
  id: string;
  channel: string;
  rule_type: string;
  config: Record<string, unknown>;
  active: boolean;
};

/* ---------------------- operator tab ---------------------- */

function OperatorTab() {
  type Field = {
    code: string;
    label: string | null;
    description: string | null;
    type: string;
    required: boolean;
    entity: string | null;
    accepted_values: string[] | null;
  };
  type LogClass = { code: string; label: string | null; active: boolean };

  const { data: fields } = useList<Field>({
    resource: "operator_custom_fields",
    pagination: { pageSize: 100 },
    sorters: [
      { field: "entity", order: "asc" },
      { field: "required", order: "desc" },
    ],
  });
  const { data: classes } = useList<LogClass>({
    resource: "operator_logistic_classes",
    pagination: { pageSize: 100 },
    sorters: [{ field: "code", order: "asc" }],
  });

  const fieldCols: GridColDef<Field>[] = [
    { field: "entity", headerName: "סקופ", width: 100, renderCell: (p) => <Chip size="small" label={p.value ?? "—"} variant="outlined" /> },
    {
      field: "code",
      headerName: "קוד",
      width: 180,
      renderCell: (p) => <Chip size="small" label={p.value as string} sx={{ direction: "ltr", fontFamily: "monospace" }} />,
    },
    { field: "label", headerName: "תיאור", width: 220 },
    { field: "type", headerName: "סוג", width: 100 },
    {
      field: "required",
      headerName: "חובה",
      width: 80,
      renderCell: (p) => (p.value ? <Chip size="small" color="error" label="חובה" /> : <Chip size="small" label="אופציונלי" />),
    },
    {
      field: "accepted_values",
      headerName: "ערכים מותרים",
      flex: 1,
      minWidth: 200,
      sortable: false,
      renderCell: (p) =>
        Array.isArray(p.value) && p.value.length > 0 ? (
          <Stack direction="row" spacing={0.5}>
            {(p.value as string[]).map((v) => (
              <Chip key={v} size="small" label={v} variant="outlined" />
            ))}
          </Stack>
        ) : (
          "—"
        ),
    },
  ];

  const classCols: GridColDef<LogClass>[] = [
    {
      field: "code",
      headerName: "קוד",
      width: 180,
      renderCell: (p) => <Chip size="small" label={p.value as string} sx={{ direction: "ltr", fontFamily: "monospace" }} />,
    },
    { field: "label", headerName: "תיאור", flex: 1 },
    {
      field: "active",
      headerName: "פעיל",
      width: 90,
      renderCell: (p) => (p.value ? <Chip size="small" color="success" label="פעיל" /> : <Chip size="small" label="כבוי" />),
    },
  ];

  return (
    <Stack spacing={3}>
      <SectionHeader
        title="שדות נוספים (AF01)"
        subtitle={`${fields?.data?.length ?? 0} שדות`}
      />
      <DataPanel>
        <DataGrid
          rows={fields?.data ?? []}
          columns={fieldCols}
          getRowId={(r) => r.code}
          autoHeight
          hideFooter
          sx={{ border: "none" }}
        />
      </DataPanel>

      <SectionHeader
        title="מחלקות לוגיסטיקה"
        subtitle={`${classes?.data?.length ?? 0} מחלקות`}
      />
      <DataPanel>
        <DataGrid
          rows={classes?.data ?? []}
          columns={classCols}
          getRowId={(r) => r.code}
          autoHeight
          hideFooter
          sx={{ border: "none" }}
        />
      </DataPanel>
    </Stack>
  );
}

/* ---------------------- categories tab ---------------------- */

function CategoriesTab() {
  type Cat = { id: string; sp_category_code: string; parent_code: string | null; name_he: string };

  const { data, isFetching } = useList<Cat>({
    resource: "categories",
    pagination: { pageSize: 100 },
    sorters: [{ field: "name_he", order: "asc" }],
  });

  const cols: GridColDef<Cat>[] = [
    {
      field: "sp_category_code",
      headerName: "קוד SP",
      width: 130,
      renderCell: (p) => <Chip size="small" label={p.value as string} variant="outlined" sx={{ direction: "ltr" }} />,
    },
    { field: "name_he", headerName: "שם", flex: 1 },
    {
      field: "parent_code",
      headerName: "הורה",
      width: 130,
      renderCell: (p) =>
        p.value ? (
          <Chip size="small" label={p.value as string} variant="outlined" sx={{ direction: "ltr" }} />
        ) : (
          <Chip size="small" label="שורש" color="success" />
        ),
    },
  ];

  return (
    <Stack spacing={2}>
      <SectionHeader title="קטגוריות סופר-פארם (קריאה בלבד)" subtitle={`${data?.total ?? 0} קטגוריות`} />
      <DataPanel>
        <DataGrid
          rows={data?.data ?? []}
          columns={cols}
          getRowId={(r) => r.id}
          autoHeight
          loading={isFetching}
          sx={{ border: "none" }}
        />
      </DataPanel>
    </Stack>
  );
}

/* ---------------------- jobs tab ---------------------- */

function JobsTab() {
  const { open } = useNotification();
  const [busy, setBusy] = useState(false);
  const [blogBusy, setBlogBusy] = useState(false);
  const [lastResult, setLastResult] = useState<null | {
    checked: number;
    sp_offers_loaded: number;
    flipped_by_ean: number;
    flipped_by_title: number;
    flipped_matches: number;
    flipped_inventory: number;
  }>(null);
  const [blogResult, setBlogResult] = useState<null | {
    inventory: number;
    catalog_matches: number;
    channel_listings: number;
    image_assets: number;
  }>(null);

  const runBlogCleanup = async (dry: boolean) => {
    if (blogBusy) return;
    setBlogBusy(true);
    try {
      const res = await fetch("/api/admin/cleanup-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        open?.({ type: "error", message: `כישלון: ${json.error ?? res.statusText}` });
        return;
      }
      setBlogResult({
        inventory: json.inventory ?? 0,
        catalog_matches: json.catalog_matches ?? 0,
        channel_listings: json.channel_listings ?? 0,
        image_assets: json.image_assets ?? 0,
      });
      const verb = dry ? "ימחקו" : "נמחקו";
      open?.({
        type: "success",
        message: `${verb} ${json.inventory ?? 0} שורות מקטגוריית "בלוג"`,
      });
    } catch (e) {
      open?.({ type: "error", message: `שגיאת רשת: ${(e as Error).message}` });
    } finally {
      setBlogBusy(false);
    }
  };

  const runDedupe = async (dry: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sync/superpharm/dedupe-from-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        open?.({ type: "error", message: `כישלון: ${json.error ?? res.statusText}` });
        return;
      }
      setLastResult({
        checked: json.checked ?? 0,
        sp_offers_loaded: json.sp_offers_loaded ?? 0,
        flipped_by_ean: json.flipped_by_ean ?? 0,
        flipped_by_title: json.flipped_by_title ?? 0,
        flipped_matches: json.flipped_matches ?? 0,
        flipped_inventory: json.flipped_inventory ?? 0,
      });
      const verb = dry ? "מצאו" : "סומנו";
      open?.({
        type: "success",
        message: `${verb} ${json.flipped_matches ?? 0} כפילויות (מתוך ${json.checked ?? 0} שנבדקו)`,
      });
    } catch (e) {
      open?.({ type: "error", message: `שגיאת רשת: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Alert severity="warning" variant="outlined">
        <Stack spacing={1}>
          <Typography variant="subtitle2">מחיקת מוצרי קטגוריית &quot;בלוג&quot;</Typography>
          <Typography variant="body2">
            פוסטי בלוג שנכנסו בטעות לקטלוג כמוצרים (ללא מחיר אמיתי). המחיקה מסירה גם רשומות
            תלויות בטבלאות catalog_matches, channel_listings, image_assets.
          </Typography>
          {blogResult && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              ריצה אחרונה — מלאי: {blogResult.inventory} · התאמות: {blogResult.catalog_matches} · ערוצים:{" "}
              {blogResult.channel_listings} · תמונות: {blogResult.image_assets}
            </Typography>
          )}
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" disabled={blogBusy} onClick={() => runBlogCleanup(true)}>
              בדיקה (ללא מחיקה)
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={blogBusy}
              onClick={() => {
                if (!window.confirm("למחוק את כל מוצרי קטגוריית 'בלוג' לצמיתות?")) return;
                runBlogCleanup(false);
              }}
            >
              {blogBusy ? "מוחק…" : "מחק מוצרי בלוג"}
            </Button>
          </Stack>
        </Stack>
      </Alert>

      <Alert severity="info" variant="outlined">
        <Stack spacing={1}>
          <Typography variant="subtitle2">ניקוי כפילויות מול הצעות סופר-פארם</Typography>
          <Typography variant="body2">
            המערכת בודקת את כל המוצרים שמסומנים כ&quot;חסרים&quot; מול ההצעות הפעילות בסופר-פארם —
            פעם בברקוד מדויק, ופעם בהתאמה של 100% לשם. מה שנמצא יסומן כ&quot;קיים בסופר-פארם&quot;
            וייעלם מרשימת ההעלאה.
          </Typography>
          {lastResult && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              ריצה אחרונה — נבדקו: {lastResult.checked} · הצעות SP נטענו: {lastResult.sp_offers_loaded}
              {" · "}
              לפי ברקוד: {lastResult.flipped_by_ean} · לפי שם: {lastResult.flipped_by_title} · סה&quot;כ סומנו:{" "}
              {lastResult.flipped_matches} · עודכנו במלאי: {lastResult.flipped_inventory}
            </Typography>
          )}
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" disabled={busy} onClick={() => runDedupe(true)}>
              בדיקה (ללא שינוי)
            </Button>
            <Button variant="contained" color="primary" disabled={busy} onClick={() => runDedupe(false)}>
              {busy ? "רץ…" : "נקה כפילויות"}
            </Button>
          </Stack>
        </Stack>
      </Alert>

      <SectionHeader title="היסטוריית סנכרונים" subtitle="כל המשימות (sync_jobs)" />
      <SyncJobsHistory />
    </Stack>
  );
}

/* ---------------------- channels tab ---------------------- */

function ChannelsTab() {
  return (
    <Stack spacing={2}>
      <SectionHeader title="ערוצים" subtitle="ערוצי הפצה נוספים בקנה — Zap, Walla שופס, ACE" />
      <Stack spacing={1.2}>
        <ChannelToggleRow
          icon={<ChannelsIcon />}
          label="סופר-פארם"
          description="ערוץ ראשי דרך Mirakl OF01 + PM01. מצב פעיל."
          enabled
        />
        <ChannelToggleRow
          icon={<ZapIcon />}
          label="Zap"
          description="פיד מחירים פתוח. בקנה לרבעון הקרוב."
          enabled={false}
          comingSoon
        />
        <ChannelToggleRow
          icon={<WallaIcon />}
          label="Walla שופס"
          description="ממשק ספק Walla — בפיתוח."
          enabled={false}
          comingSoon
        />
        <ChannelToggleRow
          icon={<AceIcon />}
          label="ACE"
          description="ממשק B2B מול ACE — בפיתוח."
          enabled={false}
          comingSoon
        />
      </Stack>
    </Stack>
  );
}
