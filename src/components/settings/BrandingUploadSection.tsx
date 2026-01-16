import React, { useState, useRef } from 'react';
import { Upload, Image, FileImage, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useI18n } from '@/contexts/I18nContext';

interface BrandingUploadSectionProps {
  tenantId: string;
  logoUrl: string | null;
  cardTemplateUrl: string | null;
  diplomaTemplateUrl: string | null;
  onUpdate: (field: string, url: string | null) => void;
}

interface UploadItemProps {
  label: string;
  description: string;
  currentUrl: string | null;
  uploadPath: string;
  onUploaded: (url: string | null) => void;
  aspectHint?: string;
}

function UploadItem({ label, description, currentUrl, uploadPath, onUploaded, aspectHint }: UploadItemProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Tipo de arquivo não suportado. Use PNG, JPG ou WebP.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 5MB.');
      return;
    }

    setUploading(true);
    try {
      // Upload to branding bucket
      const { error: uploadError } = await supabase.storage
        .from('branding')
        .upload(uploadPath, file, { 
          contentType: file.type, 
          upsert: true 
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from('branding').getPublicUrl(uploadPath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`; // Cache busting
      
      onUploaded(publicUrl);
      toast.success('Imagem enviada com sucesso!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erro ao enviar imagem.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from('branding')
        .remove([uploadPath]);

      if (error) throw error;

      onUploaded(null);
      toast.success('Imagem removida.');
    } catch (error) {
      console.error('Remove error:', error);
      toast.error('Erro ao remover imagem.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
        {aspectHint && (
          <p className="text-xs text-muted-foreground mt-1">{aspectHint}</p>
        )}
      </div>

      <div className="flex items-start gap-4">
        {/* Preview */}
        <div className="w-32 h-24 rounded-lg border border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30 overflow-hidden">
          {currentUrl ? (
            <img 
              src={currentUrl} 
              alt={label} 
              className="w-full h-full object-contain"
            />
          ) : (
            <FileImage className="h-8 w-8 text-muted-foreground/50" />
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
            id={`upload-${uploadPath}`}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {currentUrl ? 'Substituir' : 'Enviar'}
          </Button>
          {currentUrl && (
            <Button
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={handleRemove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Remover
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function BrandingUploadSection({
  tenantId,
  logoUrl,
  cardTemplateUrl,
  diplomaTemplateUrl,
  onUpdate,
}: BrandingUploadSectionProps) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />
          {t('settings.brandingAssets')}
        </CardTitle>
        <CardDescription>{t('settings.brandingAssetsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <UploadItem
          label={t('settings.organizationLogo')}
          description={t('settings.logoDesc')}
          aspectHint="Recomendado: 200x200px, formato quadrado"
          currentUrl={logoUrl}
          uploadPath={`${tenantId}/logo.png`}
          onUploaded={(url) => onUpdate('logo_url', url)}
        />

        <div className="border-t pt-6">
          <UploadItem
            label={t('settings.cardTemplate')}
            description={t('settings.cardTemplateDesc')}
            aspectHint="Recomendado: 856x1400px (proporção cartão de crédito vertical)"
            currentUrl={cardTemplateUrl}
            uploadPath={`${tenantId}/card-template.png`}
            onUploaded={(url) => onUpdate('card_template_url', url)}
          />
        </div>

        <div className="border-t pt-6">
          <UploadItem
            label={t('settings.diplomaTemplate')}
            description={t('settings.diplomaTemplateDesc')}
            aspectHint="Recomendado: 2970x2100px (A4 paisagem)"
            currentUrl={diplomaTemplateUrl}
            uploadPath={`${tenantId}/diploma-template.png`}
            onUploaded={(url) => onUpdate('diploma_template_url', url)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
