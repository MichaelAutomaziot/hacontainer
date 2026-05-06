"use client";

import { useRouter } from "next/navigation";
import { useNotification } from "@refinedev/core";
import { RuleFolder as RulesIcon } from "@mui/icons-material";
import { PageFrame, PageHeader, SectionPanel } from "@/components/shared";
import { PricingRuleForm } from "@/components/settings/PricingRuleForm";
import { hebrewTranslations as t } from "@/locales/he";

export default function PricingRuleCreatePage() {
  const router = useRouter();
  const { open } = useNotification();
  return (
    <PageFrame maxWidth={1100}>
      <PageHeader
        title={`הוספת חוק תמחור — ${t.pilot.nav.pricingRules}`}
        subtitle="חוקים מועברים אוטומטית למנוע priceFor. שינוי משפיע על העלאות הבאות."
        icon={<RulesIcon />}
        tone="warning"
      />
      <SectionPanel>
        <PricingRuleForm
          action="create"
          onSaved={(id) => {
            open?.({
              type: "success",
              message: `חוק חדש נשמר (${id.slice(0, 8)}…)`,
            });
            router.push("/settings/rules");
          }}
        />
      </SectionPanel>
    </PageFrame>
  );
}
