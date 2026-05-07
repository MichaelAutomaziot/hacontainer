/**
 * Electronics-tree detection for Super-Pharm category codes.
 *
 * Business rules from Peri (SP marketing) require electronics products to
 * carry a valid international barcode AND a warranty string. Hand-curated
 * prefix list — refresh from `categories` table when SP publishes a tree
 * update.
 */

const ELECTRONICS_PREFIXES = [
  // Major-appliances + small kitchen
  "5517",
  // Audio / video
  "5518",
  // TV
  "5519",
  // Mobile / accessories
  "5520",
  // Cameras / optics
  "5521",
  // Computers + peripherals
  "5522",
] as const;

export const isElectronicsCategory = (
  spCategoryCode: string | null | undefined
): boolean => {
  if (!spCategoryCode) return false;
  const code = spCategoryCode.trim();
  return ELECTRONICS_PREFIXES.some((p) => code.startsWith(p));
};

export const ELECTRONICS_BRANDS_REQUIRE_PICK = ["dyson", "sharp", "ninja"] as const;

export const isImportPickRequiredBrand = (brand: string | null | undefined): boolean => {
  if (!brand) return false;
  const norm = brand.trim().toLowerCase().replace(/\s+/g, "");
  return ELECTRONICS_BRANDS_REQUIRE_PICK.some((b) => norm.includes(b));
};

export const deriveImportType = (
  brand: string | null | undefined,
  importerText: string | null | undefined
): { importType: "official" | "parallel" | null; reason: string } => {
  const text = (importerText ?? "").trim();
  const requiresPick = isImportPickRequiredBrand(brand);

  if (requiresPick) {
    if (/יבואן\s*רשמי/.test(text)) return { importType: "official", reason: "matched 'יבואן רשמי'" };
    if (/מובייל|ברוכין/.test(text)) return { importType: "parallel", reason: "matched 'מובייל'/'ברוכין'" };
    return { importType: null, reason: "user must pick explicitly" };
  }
  return { importType: "official", reason: "default for non-restricted brand" };
};
