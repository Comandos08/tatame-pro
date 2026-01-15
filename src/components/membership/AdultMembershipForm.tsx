import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Upload, Loader2, Check, CreditCard } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  AthleteFormData,
  GenderType,
  GENDER_LABELS,
  MEMBERSHIP_PRICE_CENTS,
  MEMBERSHIP_CURRENCY,
} from '@/types/membership';

const stepOneSchema = z.object({
  fullName: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  birthDate: z.string().min(1, 'Data de nascimento é obrigatória'),
  nationalId: z.string().min(1, 'Documento é obrigatório'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  email: z.string().email('E-mail inválido'),
  phone: z.string().min(10, 'Telefone inválido'),
  addressLine1: z.string().min(5, 'Endereço é obrigatório'),
  addressLine2: z.string().optional(),
  city: z.string().min(2, 'Cidade é obrigatória'),
  state: z.string().min(2, 'Estado é obrigatório'),
  postalCode: z.string().min(5, 'CEP é obrigatório'),
  country: z.string().default('BR'),
});

const STEPS = [
  { id: 1, title: 'Dados Pessoais' },
  { id: 2, title: 'Documentos' },
  { id: 3, title: 'Resumo e Pagamento' },
];

export function AdultMembershipForm() {
  const navigate = useNavigate();
  const { tenantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const { tenant } = useTenant();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [athleteData, setAthleteData] = useState<AthleteFormData | null>(null);
  const [documents, setDocuments] = useState<{ idDocument?: File; medicalCertificate?: File }>({});
  const [membershipId, setMembershipId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof stepOneSchema>>({
    resolver: zodResolver(stepOneSchema),
    defaultValues: {
      fullName: '',
      birthDate: '',
      nationalId: '',
      gender: 'MALE',
      email: '',
      phone: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'BR',
    },
  });

  const handleStepOneSubmit = async (data: z.infer<typeof stepOneSchema>) => {
    // Check if adult (18+)
    const birthDate = new Date(data.birthDate);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const isAdult = age > 18 || (age === 18 && monthDiff >= 0);

    if (!isAdult) {
      toast.error('Você deve ter 18 anos ou mais para se filiar como adulto.');
      return;
    }

    setAthleteData(data as AthleteFormData);
    setStep(2);
  };

  const handleDocumentUpload = (type: 'idDocument' | 'medicalCertificate', file: File | null) => {
    if (file) {
      setDocuments(prev => ({ ...prev, [type]: file }));
    }
  };

  const handleStepTwoSubmit = () => {
    if (!documents.idDocument) {
      toast.error('Por favor, envie o documento de identidade.');
      return;
    }
    setStep(3);
  };

  const handlePayment = async () => {
    if (!tenant || !athleteData) return;

    setIsLoading(true);

    try {
      // 1. Create athlete record
      const { data: athlete, error: athleteError } = await supabase
        .from('athletes')
        .insert({
          tenant_id: tenant.id,
          full_name: athleteData.fullName,
          birth_date: athleteData.birthDate,
          national_id: athleteData.nationalId,
          gender: athleteData.gender,
          email: athleteData.email,
          phone: athleteData.phone,
          address_line1: athleteData.addressLine1,
          address_line2: athleteData.addressLine2 || null,
          city: athleteData.city,
          state: athleteData.state,
          postal_code: athleteData.postalCode,
          country: athleteData.country,
        })
        .select()
        .single();

      if (athleteError) throw athleteError;

      // 2. Upload documents
      if (documents.idDocument) {
        const fileName = `${tenant.id}/${athlete.id}/id_document_${Date.now()}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, documents.idDocument);

        if (!uploadError) {
          const { data: publicUrl } = supabase.storage
            .from('documents')
            .getPublicUrl(fileName);

          await supabase.from('documents').insert({
            tenant_id: tenant.id,
            athlete_id: athlete.id,
            type: 'ID_DOCUMENT',
            file_url: publicUrl.publicUrl,
            file_type: documents.idDocument.type,
            file_size: documents.idDocument.size,
          });
        }
      }

      if (documents.medicalCertificate) {
        const fileName = `${tenant.id}/${athlete.id}/medical_${Date.now()}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, documents.medicalCertificate);

        if (!uploadError) {
          const { data: publicUrl } = supabase.storage
            .from('documents')
            .getPublicUrl(fileName);

          await supabase.from('documents').insert({
            tenant_id: tenant.id,
            athlete_id: athlete.id,
            type: 'MEDICAL_CERTIFICATE',
            file_url: publicUrl.publicUrl,
            file_type: documents.medicalCertificate.type,
            file_size: documents.medicalCertificate.size,
          });
        }
      }

      // 3. Create membership
      const { data: membership, error: membershipError } = await supabase
        .from('memberships')
        .insert({
          tenant_id: tenant.id,
          athlete_id: athlete.id,
          status: 'DRAFT',
          type: 'FIRST_MEMBERSHIP',
          price_cents: MEMBERSHIP_PRICE_CENTS,
          currency: MEMBERSHIP_CURRENCY,
          payment_status: 'NOT_PAID',
        })
        .select()
        .single();

      if (membershipError) throw membershipError;

      setMembershipId(membership.id);

      // 4. Create Stripe checkout session
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
        'create-membership-checkout',
        {
          body: {
            membershipId: membership.id,
            tenantSlug: tenantSlug,
            successUrl: `${window.location.origin}/${tenantSlug}/membership/success`,
            cancelUrl: `${window.location.origin}/${tenantSlug}/membership/adult`,
          },
        }
      );

      if (checkoutError) throw checkoutError;

      if (checkoutData?.url) {
        window.location.href = checkoutData.url;
      } else {
        throw new Error('Erro ao criar sessão de pagamento');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Ocorreu um erro. Por favor, tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => step > 1 ? setStep(step - 1) : navigate(`/${tenantSlug}/membership/new`)}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          
          <h1 className="font-display text-2xl md:text-3xl font-bold mb-2">
            Filiação de Atleta Adulto
          </h1>
          <p className="text-muted-foreground">
            {tenant?.name}
          </p>
        </motion.div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, index) => (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                    step >= s.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step > s.id ? <Check className="h-5 w-5" /> : s.id}
                </div>
                <span className="text-xs mt-2 text-muted-foreground hidden sm:block">
                  {s.title}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${step > s.id ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Form Steps */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Dados Pessoais</CardTitle>
                  <CardDescription>
                    Preencha suas informações para a filiação
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleStepOneSubmit)} className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="fullName"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>Nome Completo</FormLabel>
                              <FormControl>
                                <Input placeholder="João da Silva" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="birthDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Data de Nascimento</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="gender"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Gênero</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecione" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.entries(GENDER_LABELS).map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="nationalId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CPF / Documento</FormLabel>
                              <FormControl>
                                <Input placeholder="000.000.000-00" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>E-mail</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="joao@email.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Telefone</FormLabel>
                              <FormControl>
                                <Input placeholder="(11) 99999-9999" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="sm:col-span-2 pt-4">
                          <h3 className="text-sm font-medium mb-4">Endereço</h3>
                        </div>

                        <FormField
                          control={form.control}
                          name="addressLine1"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>Endereço</FormLabel>
                              <FormControl>
                                <Input placeholder="Rua, número" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="addressLine2"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2">
                              <FormLabel>Complemento</FormLabel>
                              <FormControl>
                                <Input placeholder="Apartamento, bloco, etc." {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cidade</FormLabel>
                              <FormControl>
                                <Input placeholder="São Paulo" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Estado</FormLabel>
                              <FormControl>
                                <Input placeholder="SP" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="postalCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>CEP</FormLabel>
                              <FormControl>
                                <Input placeholder="00000-000" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="pt-4">
                        <Button type="submit" className="w-full">
                          Continuar
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Documentos</CardTitle>
                  <CardDescription>
                    Envie os documentos necessários para a filiação
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Documento de Identidade (RG/CNH) *</Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        id="idDocument"
                        onChange={(e) => handleDocumentUpload('idDocument', e.target.files?.[0] || null)}
                      />
                      <label htmlFor="idDocument" className="cursor-pointer">
                        {documents.idDocument ? (
                          <div className="flex items-center justify-center gap-2 text-success">
                            <Check className="h-5 w-5" />
                            <span>{documents.idDocument.name}</span>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                              Clique para enviar ou arraste o arquivo
                            </p>
                          </>
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Atestado Médico (opcional)</Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        id="medicalCertificate"
                        onChange={(e) => handleDocumentUpload('medicalCertificate', e.target.files?.[0] || null)}
                      />
                      <label htmlFor="medicalCertificate" className="cursor-pointer">
                        {documents.medicalCertificate ? (
                          <div className="flex items-center justify-center gap-2 text-success">
                            <Check className="h-5 w-5" />
                            <span>{documents.medicalCertificate.name}</span>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                              Clique para enviar ou arraste o arquivo
                            </p>
                          </>
                        )}
                      </label>
                    </div>
                  </div>

                  <Button onClick={handleStepTwoSubmit} className="w-full">
                    Continuar
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle>Resumo e Pagamento</CardTitle>
                  <CardDescription>
                    Confira seus dados e finalize a filiação
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {athleteData && (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Nome</p>
                          <p className="font-medium">{athleteData.fullName}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">E-mail</p>
                          <p className="font-medium">{athleteData.email}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Documento</p>
                          <p className="font-medium">{athleteData.nationalId}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Telefone</p>
                          <p className="font-medium">{athleteData.phone}</p>
                        </div>
                      </div>

                      <div className="border-t border-border pt-4">
                        <p className="text-muted-foreground text-sm">Endereço</p>
                        <p className="font-medium">
                          {athleteData.addressLine1}
                          {athleteData.addressLine2 && `, ${athleteData.addressLine2}`}
                          <br />
                          {athleteData.city} - {athleteData.state}, {athleteData.postalCode}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-muted-foreground">Filiação Anual - {tenant?.name}</span>
                      <span className="font-display font-bold text-lg">
                        {formatCurrency(MEMBERSHIP_PRICE_CENTS)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Válida por 12 meses a partir da aprovação
                    </p>
                  </div>

                  <Button
                    onClick={handlePayment}
                    disabled={isLoading}
                    className="w-full"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Pagar e Finalizar Filiação
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    Você será redirecionado para o ambiente seguro de pagamento
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
