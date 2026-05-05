import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { he } from 'date-fns/locale';

/**
 * Phone Number Formatting
 */

/**
 * Normalizes Israeli phone numbers to international format
 * Examples:
 *   050-1234567 -> 972501234567
 *   972501234567 -> 972501234567
 *   +972-50-123-4567 -> 972501234567
 */
export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';

  // Remove all non-digit characters
  const digitsOnly = phone.replace(/\D/g, '');

  // Handle different Israeli phone formats
  if (digitsOnly.startsWith('972')) {
    // Already in international format
    return digitsOnly;
  } else if (digitsOnly.startsWith('0')) {
    // Local format (e.g., 050-1234567) -> remove leading 0 and add 972
    return '972' + digitsOnly.substring(1);
  } else if (digitsOnly.length === 9) {
    // Missing country code and leading 0
    return '972' + digitsOnly;
  }

  return digitsOnly;
}

/**
 * Formats Israeli phone numbers for display
 * Format: 972-XX-XXX-XXXX
 * Example: 972-50-123-4567
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';

  const normalized = normalizePhone(phone);

  // Israeli phone format: 972-XX-XXX-XXXX (12 digits total)
  if (normalized.length === 12 && normalized.startsWith('972')) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3, 5)}-${normalized.slice(5, 8)}-${normalized.slice(8)}`;
  }

  // Fallback: return as-is if format doesn't match
  return phone;
}

/**
 * Formats phone for clickable tel: link
 * Example: +972-50-123-4567
 */
export function formatPhoneLink(phone: string | null | undefined): string {
  if (!phone) return '';

  const normalized = normalizePhone(phone);
  return `+${normalized}`;
}

/**
 * Date & Time Formatting
 */

/**
 * Formats date with Hebrew locale
 * Format: DD/MM/YYYY HH:mm
 * Example: 25/12/2025 14:30
 */
export function formatDate(
  date: string | Date | null | undefined,
  formatStr: string = 'dd/MM/yyyy HH:mm'
): string {
  if (!date) return '';

  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;

    if (!isValid(dateObj)) {
      return '';
    }

    return format(dateObj, formatStr, { locale: he });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
}

/**
 * Formats date as short Hebrew format
 * Format: DD/MM/YYYY
 * Example: 25/12/2025
 */
export function formatDateShort(date: string | Date | null | undefined): string {
  return formatDate(date, 'dd/MM/yyyy');
}

/**
 * Formats time only
 * Format: HH:mm
 * Example: 14:30
 */
export function formatTime(date: string | Date | null | undefined): string {
  return formatDate(date, 'HH:mm');
}

/**
 * Formats date with relative time in Hebrew
 * Examples:
 *   - "לפני 2 דקות" (2 minutes ago)
 *   - "לפני שעה" (1 hour ago)
 *   - "לפני 3 ימים" (3 days ago)
 * Falls back to formatted date if more than 7 days old
 */
export function formatDateRelative(date: string | Date | null | undefined): string {
  if (!date) return '';

  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;

    if (!isValid(dateObj)) {
      return '';
    }

    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24));

    // If more than 7 days old, show formatted date instead
    if (diffInDays > 7) {
      return formatDateShort(dateObj);
    }

    // Use date-fns for relative time with Hebrew locale
    return formatDistanceToNow(dateObj, {
      addSuffix: true,
      locale: he,
    });
  } catch (error) {
    console.error('Error formatting relative date:', error);
    return '';
  }
}

/**
 * Address Formatting
 */

export interface AddressComponents {
  street?: string | null;
  houseNumber?: string | number | null;
  city?: string | null;
  addressExtra?: string | null;
}

/**
 * Formats Israeli address in Hebrew format
 * Format: "רחוב מספר, עיר"
 * Example: "דיזנגוף 100, תל אביב"
 */
export function formatAddress(components: AddressComponents): string {
  const parts: string[] = [];

  // Street and house number
  if (components.street) {
    if (components.houseNumber) {
      parts.push(`${components.street} ${components.houseNumber}`);
    } else {
      parts.push(components.street);
    }
  }

  // City
  if (components.city) {
    parts.push(components.city);
  }

  // Join with comma and space (Hebrew format)
  const mainAddress = parts.join(', ');

  // Add extra details (apartment, floor, etc.) on new line if present
  if (components.addressExtra) {
    return `${mainAddress}\n${components.addressExtra}`;
  }

  return mainAddress;
}

/**
 * Formats address in single line (no line breaks)
 * Format: "רחוב מספר, עיר (פרטים נוספים)"
 */
export function formatAddressSingleLine(components: AddressComponents): string {
  const mainAddress = formatAddress(components).split('\n')[0];

  if (components.addressExtra) {
    return `${mainAddress} (${components.addressExtra})`;
  }

  return mainAddress;
}

/**
 * Currency Formatting
 */

/**
 * Formats currency in Israeli Shekel (ILS)
 * Format: ₪123.45
 * Example: ₪1,234.56
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options: Intl.NumberFormatOptions = {}
): string {
  if (amount === null || amount === undefined || amount === '') return '';

  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numericAmount)) return '';

  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(numericAmount);
}

/**
 * Formats currency without decimals
 * Format: ₪123
 */
export function formatCurrencyWhole(amount: number | string | null | undefined): string {
  return formatCurrency(amount, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/**
 * Number Formatting
 */

/**
 * Formats number with thousand separators (Hebrew locale)
 * Example: 21612 -> 21,612
 */
export function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined || num === '') return '';

  const numericValue = typeof num === 'string' ? parseFloat(num) : num;

  if (isNaN(numericValue)) return '';

  return new Intl.NumberFormat('he-IL').format(numericValue);
}

/**
 * Status & Enum Formatting
 */

/**
 * Maps status code to Hebrew translation
 * Should be used with translations from locales/he.ts
 */
export function formatStatusCode(
  statusCode: string | number | null | undefined,
  statusMap: Record<string, string>
): string {
  if (!statusCode) return '';

  const code = statusCode.toString();
  return statusMap[code] || code;
}

/**
 * Formats boolean values to Hebrew
 */
export function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value ? 'כן' : 'לא';
}

/**
 * String Utilities
 */

/**
 * Truncates text with ellipsis
 */
export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return '';

  if (text.length <= maxLength) return text;

  return text.substring(0, maxLength) + '...';
}

/**
 * Capitalizes first letter (useful for names)
 * Note: Hebrew doesn't have uppercase, but useful for mixed content
 */
export function capitalizeFirst(text: string | null | undefined): string {
  if (!text) return '';

  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Validation Helpers
 */

/**
 * Validates Israeli phone number format
 */
export function isValidIsraeliPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;

  const normalized = normalizePhone(phone);

  // Israeli mobile numbers: 972 + 5X (where X is 0-9) + 7 digits
  // Israeli landline: 972 + area code (1-4 digits) + remaining digits (total 9-10 digits after 972)
  return /^972[1-9]\d{7,8}$/.test(normalized);
}

/**
 * Validates Israeli email format
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
