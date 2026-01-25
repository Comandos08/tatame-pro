import React, { useState, useRef } from 'react';
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

  // Generate a temporary ID for new events
  const uploadId = eventId || `temp-${Date.now()}`;
  const uploadPath = `${tenantId}/${uploadId}/cover.jpg`;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('events.imageTypeError' as any) || 'Use PNG, JPG ou WebP');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('events.imageSizeError' as any) || 'Máximo 5MB');
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
      toast.success(t('events.imageUploadSuccess' as any) || 'Imagem enviada!');
    } catch (error) {
      console.error('Upload error:', error);
      setPreviewUrl(currentUrl);
      toast.error(t('events.imageUploadError' as any) || 'Erro ao enviar imagem');
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
      toast.success(t('events.imageRemoveSuccess' as any) || 'Imagem removida');
    } catch (error) {
      console.error('Remove error:', error);
      toast.error(t('events.imageRemoveError' as any) || 'Erro ao remover');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">
          {t('events.coverImage' as any) || 'Imagem do Evento'}
        </Label>
        <p className="text-xs text-muted-foreground">
          {t('events.coverImageDesc' as any) || 'Imagem de capa (16:9)'}
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
              alt={t('events.coverImage' as any) || 'Imagem do Evento'}
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
            {previewUrl
              ? (t('events.replaceImage' as any) || 'Substituir')
              : (t('events.uploadImage' as any) || 'Enviar')}
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
              {t('events.removeImage' as any) || 'Remover'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
