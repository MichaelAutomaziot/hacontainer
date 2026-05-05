"use client";

import { useRouter } from "next/navigation";
import { useNotification } from "@refinedev/core";
import { RuleFolder as RulesIcon } from "@mui/icons-material";
import { PageFrame, PageHeader, SectionPanel } from "@/components/shared";
import { PricingRuleForm } from "@/components/settings/PricingRuleForm";
import { hebrewTranslations as t } from "@/locales/he";

export default function PricingRuleEditPage() {
  const router = useRouter();
  const { open } = useNotification();
  return (
    <PageFrame maxWidth={1100}>
      <PageHeader
        title={`עריכת חוק תמחור — ${t.pilot.nav.pricingRules}`}
        subtitle="שינוי בערכים יחול על העלאות עתידיות (לא רטרו על channel_listings קיימים)."
        icon={<RulesIcon />}
        tone="warning"
      />
      <SectionPanel>
        <PricingRuleForm
          action="edit"
          onSaved={() => {
            open?.({ type: "success", message: "חוק עודכן בהצלחה" });
            router.push("/settings/rules");
          }}
        />
      </SectionPanel>
    </PageFrame>
  );
}
