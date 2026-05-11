// Plain-Hebrew labels + descriptions for `pricing_rules` rows.
// Shared by the settings board ("חוקי תמחור" tab) and the profile-settings
// dialog so both surfaces describe a rule the same way, in language a
// non-technical operator can read.

export type Rule = {
  id: string;
  channel: string;
  rule_type: string;
  config: Record<string, unknown>;
  active: boolean;
};

export const CHANNEL_HE: Record<string, string> = {
  superpharm: "סופר-פארם",
  zap: "Zap",
  walla: "Walla שופס",
  ace: "ACE",
};

export const SKIP_LABEL_HE: Record<string, string> = {
  express: "משלוח מהיר",
  distant_area: "אזור מרוחק",
  kibbutz: "קיבוץ / מושב",
  above_2nd_floor: "מעל קומה ראשונה",
  above_1st_floor: "מעל קומת קרקע",
};

/** Turn a stored pricing rule into a plain-Hebrew title + one-line explanation. */
export function describeRule(r: Rule): { title: string; line: string } {
  const c = (r.config ?? {}) as Record<string, unknown>;
  const ch = CHANNEL_HE[r.channel] ?? r.channel;
  switch (r.rule_type) {
    case "shipping_addon":
      return { title: "תוספת דמי משלוח", line: `כל מוצר ב${ch} מקבל תוספת של ${c.amount ?? "?"} ₪ על המחיר.` };
    case "strike_multiplier": {
      const f = Number(c.factor ?? 1);
      const pct = Math.round((f - 1) * 100);
      return {
        title: "ניפוח “מחיר לפני הנחה”",
        line: `ב${ch}, “המחיר לפני הנחה” מוצג גבוה ב-${pct}% מהמחיר שהלקוח משלם בפועל.`,
      };
    }
    case "sale_duration":
      return { title: "אורך תקופת המבצע", line: `ב${ch}, ההנחה פעילה ${c.days ?? "?"} ימים מיום ההעלאה.` };
    case "skip_extras": {
      const ls = Array.isArray(c.labels) ? (c.labels as string[]).map((v) => SKIP_LABEL_HE[v] ?? v) : [];
      return {
        title: "סוגי משלוח שלא מועתקים",
        line: ls.length
          ? `לא מועברים ל${ch}: ${ls.join(", ")}. השאר מועתק כפי שהוא מהקונטיינר.`
          : `כל סוגי המשלוח מועברים ל${ch}.`,
      };
    }
    case "price_match":
      return {
        title: "התאמת מחיר למתחרה",
        line: `המחיר ב${ch} מותאם אוטומטית למחיר של המתחרה הזול ביותר${
          c.always_add_shipping ? ", ועדיין מתווספים 39 ₪ דמי משלוח" : ""
        }.`,
      };
    default:
      return { title: r.rule_type, line: "—" };
  }
}
