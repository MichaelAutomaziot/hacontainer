/**
 * Client-side image dimension + MIME validator for the single-product
 * upload form. Runs before the file is uploaded to Storage so the user
 * sees per-image issues before they consume bandwidth.
 *
 * No-background / no-text content checks are out of scope (would require
 * an ML model client-side); those remain user attestation.
 */

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
const MIN_DIM = 300;

export interface ImageValidationResult {
  ok: boolean;
  width: number;
  height: number;
  mime: string;
  error?: string;
}

export const validateImageDimensions = (file: File): Promise<ImageValidationResult> => {
  return new Promise((resolve) => {
    const mime = file.type;
    if (!ALLOWED_MIME.includes(mime as (typeof ALLOWED_MIME)[number])) {
      resolve({
        ok: false,
        width: 0,
        height: 0,
        mime,
        error: "פורמט לא נתמך: JPG / PNG / WEBP בלבד",
      });
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      if (width < MIN_DIM || height < MIN_DIM) {
        resolve({
          ok: false,
          width,
          height,
          mime,
          error: `תמונה קטנה מדי (${width}×${height}). מינימום ${MIN_DIM}×${MIN_DIM}`,
        });
        return;
      }
      resolve({ ok: true, width, height, mime });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        ok: false,
        width: 0,
        height: 0,
        mime,
        error: "טעינת התמונה נכשלה. קובץ פגום או לא נתמך",
      });
    };
    img.src = url;
  });
};
