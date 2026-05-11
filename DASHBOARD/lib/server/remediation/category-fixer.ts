/**
 * LLM-based re-classification for SP wrong_category rejections.
 *
 * SP merchandiser routinely flags products as "הקטגוריה אינה הנכונה"
 * (wrong category) when our heuristic resolver picks the wrong leaf. The
 * fixer re-classifies the product against the live SP hierarchy, keyed
 * on Hebrew name + first 500 chars of description + brand.
 *
 * Confidence is reported by the model; only ≥0.7 results overwrite the
 * inventory.category_id. Lower-confidence results are surfaced for
 * manual review.
 */
import { getServiceClient } from "@/utils/supabase/admin";
import { callOpenRouterJson } from "./openrouter";

const HIERARCHY_REFRESH_DAYS = 7;
const MAX_CANDIDATE_LEAVES = 600;

export interface SpHierarchyLeaf {
  code: string;
  label: string;
  parent_code: string | null;
  full_path: string | null;
}

interface MiraklHierarchyApi {
  hierarchies?: { code: string; label: string; level: number; parent_code?: string }[];
}

const buildPath = (
  node: { code: string; label: string; parent_code?: string },
  byCode: Map<string, { code: string; label: string; parent_code?: string }>,
  cap = 6
): string => {
  const parts: string[] = [node.label];
  let cur = node.parent_code;
  while (cur && parts.length < cap) {
    const p = byCode.get(cur);
    if (!p) break;
    parts.unshift(p.label);
    cur = p.parent_code;
  }
  return parts.join(" / ");
};

/**
 * Refreshes the local sp_hierarchy_snapshot from Mirakl /api/hierarchies
 * if the snapshot is older than HIERARCHY_REFRESH_DAYS. Idempotent.
 */
export const refreshHierarchyIfStale = async (): Promise<number> => {
  const sb = getServiceClient();
  const { data: latest } = await sb
    .from("sp_hierarchy_snapshot")
    .select("refreshed_at")
    .order("refreshed_at", { ascending: false })
    .limit(1);
  const last = latest?.[0]?.refreshed_at as string | undefined;
  if (last) {
    const ageMs = Date.now() - new Date(last).getTime();
    if (ageMs < HIERARCHY_REFRESH_DAYS * 24 * 3600_000) {
      const { count } = await sb
        .from("sp_hierarchy_snapshot")
        .select("code", { count: "exact", head: true });
      return count ?? 0;
    }
  }

  const base = process.env.MIRAKL_BASE_URL ?? "https://superpharm-prod.mirakl.net";
  const key = process.env.MIRAKL_API_KEY ?? "";
  if (!key) throw new Error("MIRAKL_API_KEY not set");
  const res = await fetch(`${base}/api/hierarchies`, {
    headers: { Authorization: key, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`hierarchies HTTP ${res.status}`);
  const json = (await res.json()) as MiraklHierarchyApi;
  const all = json.hierarchies ?? [];
  const byCode = new Map(all.map((h) => [h.code, h]));
  const childCount = new Map<string, number>();
  for (const h of all) {
    if (h.parent_code) childCount.set(h.parent_code, (childCount.get(h.parent_code) ?? 0) + 1);
  }
  const rows = all.map((h) => ({
    code: h.code,
    label: h.label,
    parent_code: h.parent_code ?? null,
    level: h.level,
    is_leaf: !childCount.has(h.code),
    full_path: buildPath(h, byCode),
    refreshed_at: new Date().toISOString(),
  }));
  // Wipe + reinsert in chunks for atomicity.
  await sb.from("sp_hierarchy_snapshot").delete().neq("code", "");
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await sb.from("sp_hierarchy_snapshot").insert(slice);
    if (error) throw new Error(`sp_hierarchy_snapshot insert: ${error.message}`);
  }
  return rows.length;
};

const fetchLeaves = async (): Promise<SpHierarchyLeaf[]> => {
  const sb = getServiceClient();
  const out: SpHierarchyLeaf[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("sp_hierarchy_snapshot")
      .select("code, label, parent_code, full_path")
      .eq("is_leaf", true)
      .range(from, from + 999);
    if (error) throw new Error(`sp_hierarchy_snapshot read: ${error.message}`);
    const rows = (data ?? []) as SpHierarchyLeaf[];
    out.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }
  return out;
};

let leafCache: { ts: number; rows: SpHierarchyLeaf[] } | null = null;
const LEAF_CACHE_MS = 5 * 60_000;

const getLeavesCached = async (): Promise<SpHierarchyLeaf[]> => {
  if (leafCache && Date.now() - leafCache.ts < LEAF_CACHE_MS) return leafCache.rows;
  await refreshHierarchyIfStale();
  const rows = await fetchLeaves();
  leafCache = { ts: Date.now(), rows };
  return rows;
};

/** Trim the candidate list down to the most plausible leaves for a single
 *  product. Pure heuristic, no LLM. Falls back to first MAX_CANDIDATE_LEAVES
 *  if nothing matches. */
const shortlistLeaves = (
  inv: ClassifyInput,
  leaves: SpHierarchyLeaf[]
): SpHierarchyLeaf[] => {
  const tokens = `${inv.name_he} ${inv.brand ?? ""} ${inv.current_category ?? ""}`
    .toLowerCase()
    .split(/[\s,;.\-/\\()|"'`]+/u)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return leaves.slice(0, MAX_CANDIDATE_LEAVES);
  const scored = leaves.map((l) => {
    const path = (l.full_path ?? l.label).toLowerCase();
    let score = 0;
    for (const t of tokens) if (path.includes(t)) score++;
    return { l, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored
    .filter((s) => s.score > 0)
    .slice(0, MAX_CANDIDATE_LEAVES)
    .map((s) => s.l);
  if (top.length >= 30) return top;
  // Pad with random leaves so the LLM still sees the wider catalogue.
  const padded = [...top];
  for (const { l } of scored) {
    if (padded.length >= MAX_CANDIDATE_LEAVES) break;
    if (!padded.includes(l)) padded.push(l);
  }
  return padded;
};

export interface ClassifyInput {
  name_he: string;
  description_he: string | null;
  brand: string | null;
  current_category: string | null;
}

export interface ClassifyResult {
  category_code: string | null;
  confidence: number;
  reasoning: string;
  considered: number;
}

const SYSTEM_PROMPT = [
  "אתה ממיין מוצרים ל-Super-Pharm marketplace.",
  "תוצא JSON תקין בלבד עם המפתחות:",
  "  category_code (string|null) – הקוד המדויק מבין המועמדים ש מתאים ביותר",
  "  confidence (number 0-1) – ביטחון בבחירה",
  "  reasoning (string) – שורה אחת בעברית",
  "אם אין מועמד מתאים החזר category_code=null וביטחון נמוך.",
  "ענה JSON בלבד, ללא הסברים נוספים, ללא markdown.",
].join("\n");

export const reclassifyCategory = async (
  inv: ClassifyInput
): Promise<ClassifyResult> => {
  const allLeaves = await getLeavesCached();
  const candidates = shortlistLeaves(inv, allLeaves);
  const candidatesText = candidates
    .map((c) => `${c.code}\t${c.full_path ?? c.label}`)
    .join("\n");

  const userPayload = {
    product: inv.name_he,
    description: (inv.description_he ?? "").slice(0, 500),
    brand: inv.brand,
    current_category_was_rejected: inv.current_category,
  };

  const result = await callOpenRouterJson<ClassifyResult>(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${JSON.stringify(userPayload, null, 2)}\n\nמועמדים (code\\tpath):\n${candidatesText}`,
      },
    ],
    { temperature: 0, max_tokens: 400 }
  );

  // Validate: code must exist in our shortlist (LLM occasionally hallucinates).
  const codeSet = new Set(candidates.map((c) => c.code));
  if (result.category_code && !codeSet.has(result.category_code)) {
    return {
      category_code: null,
      confidence: 0,
      reasoning: `LLM returned unknown code ${result.category_code}`,
      considered: candidates.length,
    };
  }
  return { ...result, considered: candidates.length };
};

/** Resolve the SP category code → our internal categories.id, so the
 *  caller can write inventory.category_id and PM01 picks it up. */
export const lookupCategoryIdForCode = async (
  spCode: string
): Promise<string | null> => {
  const sb = getServiceClient();
  const { data } = await sb
    .from("categories")
    .select("id")
    .eq("sp_category_code", spCode)
    .eq("is_leaf", true)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
};
