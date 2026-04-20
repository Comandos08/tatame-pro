import React, { useState, useRef } from 'react';
import { logger } from '@/lib/logger';
import { Upload, Calendar, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

interface EventImageUploadProps {
  tenantId: string;
  eventId?: string;
  currentUrl: string | null;
  onUploaded: (url: string | null) => void;
  disabled?: boolean;
}

export function EventImageUpload({
  tenantId,
  eventId,
  currentUrl,
  onUploaded,
  disabled = false,
}: EventImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  // Generate a temporary ID once per mount. Date.now() is impure, so the
  // useState initializer (runs exactly once) is the safe place for it —
  // useMemo's callback can re-run and the React Compiler flags impure calls
  // inside it.
  const [fallbackId] = useState(() => `temp-${Date.now()}`);
  const uploadId = eventId || fallbackId;
  const uploadPath = `${tenantId}/${uploadId}/cover.jpg`;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('events.imageTypeError'));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('events.imageSizeError'));
      return;
    }

    setUploading(true);
    try {
      // Create local preview immediately
      const localPreview = URL.createObjectURL(file);
      setPreviewUrl(localPreview);

      // Upload to events bucket
      const { error: uploadError } = await supabase.storage
        .from('events')
        .upload(uploadPath, file, {
          contentType: file.type,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('events')
        .getPublicUrl(uploadPath);
      
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`; // Cache busting

      setPreviewUrl(publicUrl);
      onUploaded(publicUrl);
      toast.success(t('events.imageUploadSuccess'));
    } catch (error) {
      logger.error('Upload error:', error);
      setPreviewUrl(currentUrl);
      toast.error(t('events.imageUploadError'));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from('events')
        .remove([uploadPath]);

      if (error) throw error;

      setPreviewUrl(null);
      onUploaded(null);
      toast.success(t('events.imageRemoveSuccess'));
    } catch (error) {
      logger.error('Remove error:', error);
      toast.error(t('events.imageRemoveError'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">
          {t('events.coverImage')}
        </Label>
        <p className="text-xs text-muted-foreground">
          {t('events.coverImageDesc')}
        </p>
      </div>

      <div className="flex items-start gap-4">
        {/* Preview */}
        <div 
          className={cn(
            'w-40 aspect-video rounded-lg border border-dashed flex items-center justify-center overflow-hidden',
            previewUrl 
              ? 'border-muted-foreground/30 bg-muted/30' 
              : 'border-muted-foreground/30 bg-muted/50'
          )}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={t('events.coverImage')}
              className="w-full h-full object-cover"
            />
          ) : (
            <Calendar className="h-8 w-8 text-muted-foreground/40" />
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            onChange={handleUpload}
            className="hidden"
            id="event-image-upload"
            disabled={disabled || uploading}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {previewUrl ? t('events.replaceImage') : t('events.uploadImage')}
          </Button>
          {previewUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || uploading}
              onClick={handleRemove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('events.removeImage')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
