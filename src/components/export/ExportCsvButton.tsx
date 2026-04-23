import { useState } from 'react';
import { logger } from '@/lib/logger';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportToCsv, CsvColumn } from '@/lib/exportCsv';
import { useI18n } from '@/contexts/I18nContext';
import { toast } from 'sonner';

interface ExportCsvButtonProps<T> {
  filename: string;
  columns: CsvColumn<T>[];
  data: T[];
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export function ExportCsvButton<T extends object>({
  filename,
  columns,
  data,
  isLoading = false,
  disabled = false,
  variant = 'outline',
  size = 'sm',
  className,
}: ExportCsvButtonProps<T>) {
  const { t } = useI18n();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!data || data.length === 0) {
      toast.error(t('export.noData'));
      return;
    }

    setIsExporting(true);
    try {
      // Add timestamp to filename
      const timestamp = new Date().toISOString().slice(0, 10);
      const fullFilename = `${filename}_${timestamp}`;
      
      exportToCsv(fullFilename, columns, data);
      toast.success(t('export.success', { count: String(data.length) }));
    } catch (error) {
      logger.error('Export error:', error);
      toast.error(t('export.error'));
    } finally {
      setIsExporting(false);
    }
  };

  const isDisabled = disabled || isLoading || isExporting || !data || data.length === 0;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleExport}
      disabled={isDisabled}
      className={className}
    >
      {isExporting ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Download className="h-4 w-4 mr-2" />
      )}
      {t('export.exportCsv')}
    </Button>
  );
}
