"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { TextField, Chip } from "@mui/material";
import { AccountTree as CategoryIcon } from "@mui/icons-material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useList } from "@refinedev/core";
import { DataPanel, FilterBar, PageFrame, PageHeader } from "@/components/shared";
import { hebrewTranslations as t } from "@/locales/he";

type Cat = {
  id: string;
  sp_category_code: string;
  parent_code: string | null;
  parent_id: string | null;
  name_he: string;
  full_path: string | null;
};

const fmt = new Intl.NumberFormat("he-IL");

export default function CategoriesPage() {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState({ pageSize: 50, page: 0 });

  const filters = useMemo(() => {
    return deferredSearch ? [{ field: "name_he", operator: "contains", value: deferredSearch }] : [];
  }, [deferredSearch]);

  const { data, isFetching } = useList<Cat>({
    resource: "categories",
    pagination: { current: page.page + 1, pageSize: page.pageSize },
    filters: filters as never,
    sorters: [{ field: "name_he", order: "asc" }],
    queryOptions: { keepPreviousData: true, staleTime: 30_000 },
  });
  const total = data?.total ?? 0;

  const cols: GridColDef<Cat>[] = [
    { field: "sp_category_code", headerName: "קוד SP", width: 130, renderCell: (p) => <Chip size="small" label={p.value as string} variant="outlined" sx={{ direction: "ltr" }} /> },
    { field: "name_he", headerName: t.pilot.columns.name, flex: 1, minWidth: 200 },
    { field: "parent_code", headerName: "הורה", width: 130, renderCell: (p) => p.value ? <Chip size="small" label={p.value as string} variant="outlined" sx={{ direction: "ltr" }} /> : <Chip size="small" label="שורש" color="success" /> },
  ];

  return (
    <PageFrame>
      <PageHeader
        title={t.pilot.nav.categoriesSP}
        subtitle="מיפוי קטגוריות Super-Pharm לפי קוד, הורה ושם להצפת חריגים מהר יותר."
        icon={<CategoryIcon />}
        tone="info"
        stats={<Chip label={`סה"כ ${fmt.format(total)} קטגוריות`} color="info" />}
      />

      <FilterBar>
        <TextField fullWidth size="small" label={t.actions.search} value={search} onChange={(e) => setSearch(e.target.value)} />
      </FilterBar>

      <DataPanel>
        <DataGrid
          rows={data?.data ?? []}
          columns={cols}
          getRowId={(r) => r.id}
          autoHeight
          paginationMode="server"
          rowCount={total}
          paginationModel={page}
          onPaginationModelChange={setPage}
          pageSizeOptions={[25, 50, 100]}
          loading={isFetching}
          sx={{ border: "none" }}
        />
      </DataPanel>
    </PageFrame>
  );
}
