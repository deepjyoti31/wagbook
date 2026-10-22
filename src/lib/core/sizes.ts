/** A file size for people: "820 KB", "18.4 MB", "1.2 GB", in the reader's locale. */
export function formatBytes(bytes: number, locale = "en-IN"): string {
  const units = [
    ["gigabyte", 1024 ** 3],
    ["megabyte", 1024 ** 2],
    ["kilobyte", 1024],
  ] as const;
  for (const [unit, size] of units) {
    if (bytes >= size) {
      return new Intl.NumberFormat(locale, { style: "unit", unit, maximumFractionDigits: bytes >= 10 * size ? 0 : 1 }).format(bytes / size);
    }
  }
  return new Intl.NumberFormat(locale, { style: "unit", unit: "byte" }).format(bytes);
}
