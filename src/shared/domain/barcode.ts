/**
 * Keyboard-wedge scanners type the code as fast keystrokes and may add control
 * characters or whitespace around it. Keep only the printable, non-space part.
 */
export function normalizeBarcode(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f\s]+/g, "");
}
