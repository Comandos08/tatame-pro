import React, { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Edit2, Loader2, X, Phone, MapPin, Mail, Home } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { z } from 'zod';

interface AthleteData {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  birth_date: string;
  gender: string;
  national_id: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  current_academy: {
    id: string;
    name: string;
  } | null;
}

interface EditablePersonalDataProps {
  athlete: AthleteData;
  tenantId: string;
}

const phoneSchema = z.string().min(8, 'Telefone deve ter pelo menos 8 caracteres').max(20).optional().or(z.literal(''));
const addressSchema = z.string().max(200).optional().or(z.literal(''));
const citySchema = z.string().max(100).optional().or(z.literal(''));
const stateSchema = z.string().max(50).optional().or(z.literal(''));
const postalCodeSchema = z.string().max(20).optional().or(z.literal(''));

export function EditablePersonalData({ athlete, tenantId }: EditablePersonalDataProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [formData, setFormData] = useState({
    phone: athlete.phone || '',
    address_line1: athlete.address_line1 || '',
    address_line2: athlete.address_line2 || '',
    city: athlete.city || '',
    state: athlete.state || '',
    postal_code: athlete.postal_code || '',
  });

  // Reset form when athlete changes or editing is cancelled
  useEffect(() => {
    if (!isEditing) {
      setFormData({
        phone: athlete.phone || '',
        address_line1: athlete.address_line1 || '',
        address_line2: athlete.address_line2 || '',
        city: athlete.city || '',
        state: athlete.state || '',
        postal_code: athlete.postal_code || '',
      });
      setErrors({});
    }
  }, [athlete, isEditing]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('athletes')
        .update({
          phone: data.phone || null,
          address_line1: data.address_line1 || null,
          address_line2: data.address_line2 || null,
          city: data.city || null,
          state: data.state || null,
          postal_code: data.postal_code || null,
        })
        .eq('id', athlete.id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-athlete'] });
      toast.success(t('athleteArea.dataSaved'));
      setIsEditing(false);
    },
    onError: () => {
      toast.error(t('athleteArea.saveError'));
    },
  });

  const validateField = (field: string, value: string): string | null => {
    try {
      switch (field) {
        case 'phone':
          phoneSchema.parse(value);
          break;
        case 'address_line1':
        case 'address_line2':
          addressSchema.parse(value);
          break;
        case 'city':
          citySchema.parse(value);
          break;
        case 'state':
          stateSchema.parse(value);
          break;
        case 'postal_code':
          postalCodeSchema.parse(value);
          break;
      }
      return null;
    } catch (e) {
      if (e instanceof z.ZodError) {
        return e.errors[0]?.message || 'Invalid value';
      }
      return 'Invalid value';
    }
  };

  const handleChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    const error = validateField(field, value);
    setErrors(prev => {
      const newErrors = { ...prev };
      if (error) {
        newErrors[field] = error;
      } else {
        delete newErrors[field];
      }
      return newErrors;
    });
  }, []);

  const handleSave = () => {
    // Validate all fields
    const newErrors: Record<string, string> = {};
    Object.entries(formData).forEach(([field, value]) => {
      const error = validateField(field, value);
      if (error) {
        newErrors[field] = error;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    updateMutation.mutate(formData);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      phone: athlete.phone || '',
      address_line1: athlete.address_line1 || '',
      address_line2: athlete.address_line2 || '',
      city: athlete.city || '',
      state: athlete.state || '',
      postal_code: athlete.postal_code || '',
    });
    setErrors({});
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const maskNationalId = (id: string | null) => {
    if (!id) return '-';
    if (id.length <= 4) return '***' + id;
    return '***.' + id.slice(-4);
  };

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            {t('athleteArea.personalData')}
          </CardTitle>
          <CardDescription>{t('athleteArea.personalDataDesc')}</CardDescription>
        </div>
        {!isEditing ? (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Edit2 className="h-4 w-4 mr-2" />
            {t('common.edit')}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleCancel}
              disabled={updateMutation.isPending}
            >
              <X className="h-4 w-4 mr-1" />
              {t('common.cancel')}
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave}
              disabled={updateMutation.isPending || Object.keys(errors).length > 0}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {t('common.save')}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Read-only fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('membership.fullName')}</p>
            <p className="font-medium">{athlete.full_name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('membership.birthDate')}</p>
            <p className="font-medium">{formatDate(athlete.birth_date)}</p>
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{t('membership.nationalId')}</p>
            <p className="font-medium">{maskNationalId(athlete.national_id)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('membership.gender')}</p>
            <p className="font-medium capitalize">
              {athlete.gender === 'MALE' ? t('membership.male') : 
               athlete.gender === 'FEMALE' ? t('membership.female') : t('membership.other')}
            </p>
          </div>
        </div>
        <Separator />

        {/* Editable fields */}
        <div className="space-y-3">
          {/* Email - read only */}
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{athlete.email}</span>
          </div>

          {/* Phone - editable */}
          {isEditing ? (
            <div className="space-y-1">
              <Label htmlFor="phone" className="text-sm text-muted-foreground flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" />
                {t('common.phone')}
              </Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder={t('common.phone')}
                className={errors.phone ? 'border-destructive' : ''}
              />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone}</p>
              )}
            </div>
          ) : athlete.phone ? (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{athlete.phone}</span>
            </div>
          ) : null}

          {/* Address fields - editable */}
          {isEditing ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="address_line1" className="text-sm text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" />
                  {t('membership.addressLine1')}
                </Label>
                <Input
                  id="address_line1"
                  value={formData.address_line1}
                  onChange={(e) => handleChange('address_line1', e.target.value)}
                  placeholder={t('membership.addressLine1')}
                  className={errors.address_line1 ? 'border-destructive' : ''}
                />
                {errors.address_line1 && (
                  <p className="text-xs text-destructive">{errors.address_line1}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="address_line2" className="text-sm text-muted-foreground">
                  {t('membership.addressLine2')}
                </Label>
                <Input
                  id="address_line2"
                  value={formData.address_line2}
                  onChange={(e) => handleChange('address_line2', e.target.value)}
                  placeholder={t('membership.addressLine2')}
                  className={errors.address_line2 ? 'border-destructive' : ''}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="city" className="text-sm text-muted-foreground">
                    {t('membership.city')}
                  </Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    placeholder={t('membership.city')}
                    className={errors.city ? 'border-destructive' : ''}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="state" className="text-sm text-muted-foreground">
                    {t('membership.state')}
                  </Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => handleChange('state', e.target.value)}
                    placeholder={t('membership.state')}
                    className={errors.state ? 'border-destructive' : ''}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="postal_code" className="text-sm text-muted-foreground">
                  {t('membership.postalCode')}
                </Label>
                <Input
                  id="postal_code"
                  value={formData.postal_code}
                  onChange={(e) => handleChange('postal_code', e.target.value)}
                  placeholder={t('membership.postalCode')}
                  className={errors.postal_code ? 'border-destructive' : ''}
                />
              </div>
            </div>
          ) : (
            <>
              {(athlete.address_line1 || athlete.city || athlete.state) && (
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    {athlete.address_line1 && <p>{athlete.address_line1}</p>}
                    {athlete.address_line2 && <p>{athlete.address_line2}</p>}
                    <p>{[athlete.city, athlete.state, athlete.postal_code].filter(Boolean).join(', ')}</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {athlete.current_academy && (
          <>
            <Separator />
            <div className="flex items-center gap-2">
              <Home className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t('athleteArea.currentAcademy')}</p>
                <p className="font-medium">{athlete.current_academy.name}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
