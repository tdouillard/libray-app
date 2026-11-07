/**
 * ISBN helpers: normalisation, checksum validation and ISBN-10 <-> ISBN-13 conversion.
 * Book barcodes are EAN-13 symbols whose value is the ISBN-13 (prefix 978 or 979).
 */

/** Strip spaces, dashes and other separators. Keeps digits and a trailing X (ISBN-10). */
export function cleanIsbn(value: string): string {
  return value.replace(/[^0-9xX]/g, "").toUpperCase();
}

export function isValidIsbn13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) {
    return false;
  }

  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(value[index]) * (index % 2 === 0 ? 1 : 3);
  }

  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

export function isValidIsbn10(value: string): boolean {
  if (!/^\d{9}[\dX]$/.test(value)) {
    return false;
  }

  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const digit = value[index] === "X" ? 10 : Number(value[index]);
    sum += digit * (10 - index);
  }

  return sum % 11 === 0;
}

export function isbn10To13(isbn10: string): string {
  const body = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < 12; index += 1) {
    sum += Number(body[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return `${body}${(10 - (sum % 10)) % 10}`;
}

export function isbn13To10(isbn13: string): string | null {
  if (!isbn13.startsWith("978")) {
    return null;
  }

  const body = isbn13.slice(3, 12);
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(body[index]) * (10 - index);
  }
  const check = (11 - (sum % 11)) % 11;
  return `${body}${check === 10 ? "X" : check}`;
}

/**
 * Returns a valid ISBN-13 (digits only) for any ISBN-10 / ISBN-13 input, or null when the
 * input is not a valid ISBN. Useful both for scanned barcodes and for manual entry.
 */
export function normalizeIsbn(value: string): string | null {
  const cleaned = cleanIsbn(value);

  if (cleaned.length === 13 && isValidIsbn13(cleaned) && /^97[89]/.test(cleaned)) {
    return cleaned;
  }

  if (cleaned.length === 10 && isValidIsbn10(cleaned)) {
    return isbn10To13(cleaned);
  }

  return null;
}
