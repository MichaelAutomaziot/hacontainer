"use client";

import { useRouter } from "next/navigation";
import { Inventory2 as ProductIcon } from "@mui/icons-material";
import { useNotification } from "@refinedev/core";
import { PageFrame, PageHeader, SectionPanel } from "@/components/shared";
import { ProductEntryForm } from "@/components/products/ProductEntryForm";
import { hebrewTranslations as t } from "@/locales/he";

export default function ProductNewPage() {
  const router = useRouter();
  const { open } = useNotification();
  return (
    <PageFrame maxWidth={1100}>
      <PageHeader
        title={t.products.formTitle?.new ?? "הזנת מוצר חדש"}
        subtitle="הזרימה היחידה — מוצר נכנס פעם אחת ומופץ אוטומטית לכל הערוצים המחוברים."
        icon={<ProductIcon />}
        tone="primary"
      />
      <SectionPanel>
        <ProductEntryForm
          action="create"
          defaultApproved
          onSaved={(id) => {
            open?.({
              type: "success",
              message: `מוצר #${id} נשמר. מועבר ל-${t.pilot.nav.pilotQueue}…`,
            });
            router.push("/pilot");
          }}
        />
      </SectionPanel>
    </PageFrame>
  );
}
