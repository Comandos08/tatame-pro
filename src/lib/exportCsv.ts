/**
 * CSV Export Utility
 * 
 * Generates and downloads CSV files from structured data.
 */

export interface CsvColumn<T> {
  key: keyof T | string;
  label: string;
  format?: (value: any, row: T) => string;
}

/**
 * Sanitize a value for CSV format
 * - Wraps in quotes if contains comma, newline, or quote
 * - Escapes internal quotes by doubling them
 */
function sanitizeCsvValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // Check if value needs quoting
  const needsQuoting = str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"');

  if (needsQuoting) {
    // Escape internal quotes by doubling them
    str = str.replace(/"/g, '""');
    str = `"${str}"`;
  }

  return str;
}

/**
 * Export data to a CSV file and trigger download
 * 
 * @param filename - Name of the file (without .csv extension)
 * @param columns - Column definitions with keys and labels
 * @param rows - Array of data objects
 */
export function exportToCsv<T extends Record<string, any>>(
  filename: string,
  columns: CsvColumn<T>[],
  rows: T[]
): void {
  // Generate header row
  const header = columns.map((col) => sanitizeCsvValue(col.label)).join(',');

  // Generate data rows
  const dataRows = rows.map((row) => {
    return columns
      .map((col) => {
        const key = col.key as string;
        // Support nested keys like "athlete.full_name"
        const value = key.includes('.') 
          ? key.split('.').reduce((obj, k) => obj?.[k], row as any)
          : row[key];
        
        // Apply custom formatter if provided
        const formatted = col.format ? col.format(value, row) : value;
        return sanitizeCsvValue(formatted);
      })
      .join(',');
  });

  // Combine header and data
  const csvContent = [header, ...dataRows].join('\n');

  // Create blob with BOM for Excel compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  // Create download link and trigger
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format a date string for CSV export
 */
export function formatDateForCsv(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString('pt-BR');
  } catch {
    return dateString || '';
  }
}

/**
 * Format currency for CSV export
 */
export function formatCurrencyForCsv(cents: number | null | undefined, currency = 'BRL'): string {
  if (cents === null || cents === undefined) return '';
  const value = cents / 100;
  return `${currency} ${value.toFixed(2)}`;
}
