/**
 * Resolve Mirakl value-list LABELS to OPTION CODES at runtime.
 *
 * SP rejects free-text labels for any list-type required attribute with:
 *   "2006|The attribute 'X' is not in the possible values set in the value list"
 *
 * For closets attribute 6176 (סוג פתיחה), valid CSV value is the option code
 * `10213010cls_Opening Type1`, NOT the human label `פתיחה`. SP exposes the
 * mapping via /api/values_lists. We pull the full list once, cache, and
 * map any caller-supplied label → code on demand.
 *
 * Used by pm01-dispatch.ts to translate extractor outputs (Hebrew labels)
 * into the option codes Mirakl actually accepts.
 */

interface ListValue {
  code: string;
  label: string;
  /** Lower-cased label for lookups. */
  lcLabel: string;
}

interface ListEntry {
  code: string;
  values: ListValue[];
}

let cache: { ts: number; lists: Map<string, ListEntry> } | null = null;
const CACHE_MS = 30 * 60_000; // 30 min — value lists rarely change.

const fetchAllValueLists = async (): Promise<Map<string, ListEntry>> => {
  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) throw new Error("MIRAKL_API_KEY not set");
  const res = await fetch(`${base}/api/values_lists`, {
    headers: { Authorization: key, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`values_lists HTTP ${res.status}`);
  const json = (await res.json()) as {
    values_lists: { code: string; values: { code: string; label: string }[] }[];
  };
  const out = new Map<string, ListEntry>();
  for (const list of json.values_lists ?? []) {
    out.set(list.code, {
      code: list.code,
      values: (list.values ?? [])
        .filter((v) => v && typeof v.code === "string")
        .map((v) => ({
          code: v.code,
          label: v.label ?? "",
          lcLabel: (v.label ?? "").toLowerCase(),
        })),
    });
  }
  return out;
};

const ensureCache = async (): Promise<Map<string, ListEntry>> => {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.lists;
  const lists = await fetchAllValueLists();
  cache = { ts: Date.now(), lists };
  return lists;
};

/** Resolve `value` (label or code) against `listCode` to a Mirakl option code.
 *  Returns the resolved code, or null when listCode unknown / value unmappable. */
export const resolveListValue = async (
  listCode: string | null | undefined,
  value: string | null | undefined
): Promise<string | null> => {
  if (!listCode || value == null) return null;
  const lists = await ensureCache();
  const entry = lists.get(listCode);
  if (!entry) return null;
  const v = String(value).trim();
  if (!v) return null;
  // Already a code? Pass through.
  if (entry.values.some((x) => x.code === v)) return v;
  // Match by exact lowercased label.
  const lc = v.toLowerCase();
  const hit = entry.values.find((x) => x.lcLabel && x.lcLabel === lc);
  if (hit) return hit.code;
  // Fuzzy substring (Mirakl labels often have variants — "הזזה" matches "הזזה (רחף)").
  const partial = entry.values.find(
    (x) => x.lcLabel && (x.lcLabel.includes(lc) || lc.includes(x.lcLabel))
  );
  return partial?.code ?? null;
};

/** Force a cache refresh (test hook / cron). */
export const invalidateValueListCache = (): void => {
  cache = null;
};
