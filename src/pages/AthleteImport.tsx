import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, FileText, CheckCircle, AlertTriangle, X, ChevronLeft, Users } from 'lucide-react';
import { toast } from 'sonner';

import { AppShell } from '@/layouts/AppShell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useI18n } from '@/contexts/I18nContext';

interface AthleteRow {
  full_name: string;
  birth_date: string;
  email: string;
  gender: string;
  national_id?: string;
  phone?: string;
  city?: string;
  state?: string;
  country?: string;
  address_line1?: string;
  academy_slug?: string;
  // UI-only
  _rowIndex?: number;
  _errors?: string[];
  _isDuplicate?: boolean;
}

interface ValidationResult {
  valid: AthleteRow[];
  invalid: AthleteRow[];
  duplicates: AthleteRow[];
  preview: AthleteRow[];
  totalRows: number;
}

interface ImportResult {
  inserted: number;
  skipped: number;
}

const REQUIRED_HEADERS = ['full_name', 'birth_date', 'email', 'gender'];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ALL_HEADERS = [...REQUIRED_HEADERS, 'national_id', 'phone', 'city', 'state', 'country', 'address_line1', 'academy_slug'];

function parseCSV(text: string): AthleteRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const rawHeaders = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const rows: AthleteRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    const row: Record<string, string> = {};
    rawHeaders.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });

    const athleteRow: AthleteRow = {
      full_name: row['full_name'] || row['nome'] || row['name'] || '',
      birth_date: row['birth_date'] || row['data_nascimento'] || '',
      email: row['email'] || '',
      gender: (row['gender'] || row['genero'] || row['sexo'] || '').toUpperCase(),
      national_id: row['national_id'] || row['cpf'] || undefined,
      phone: row['phone'] || row['telefone'] || undefined,
      city: row['city'] || row['cidade'] || undefined,
      state: row['state'] || row['estado'] || undefined,
      country: row['country'] || row['pais'] || undefined,
      address_line1: row['address_line1'] || row['endereco'] || undefined,
      academy_slug: row['academy_slug'] || row['academia'] || undefined,
      _rowIndex: i,
    };

    rows.push(athleteRow);
  }

  return rows;
}

export default function AthleteImport() {
  const { tenant } = useTenant();
  const { t: _t } = useI18n();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<AthleteRow[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Selecione um arquivo CSV válido.');
      return;
    }

    setFileName(file.name);
    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      toast.error('Arquivo CSV vazio ou sem linhas de dados.');
      return;
    }

    if (rows.length > 500) {
      toast.error('Máximo de 500 atletas por importação.');
      return;
    }

    setParsedRows(rows);
    await runValidation(rows);
  };

  const runValidation = async (rows: AthleteRow[]) => {
    setIsValidating(true);
    setStep('preview');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-athletes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            mode: 'validate',
            tenant_id: tenant?.id,
            rows,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro na validação');
      }

      setValidation(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(`Erro na validação: ${msg}`);
      setStep('upload');
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirm = async () => {
    if (!validation || validation.valid.length === 0) return;

    setIsConfirming(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-athletes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            mode: 'confirm',
            tenant_id: tenant?.id,
            rows: parsedRows,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro na importação');
      }

      setImportResult(result);
      setStep('done');
      toast.success(`${result.inserted} atletas importados com sucesso!`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error(`Erro na importação: ${msg}`);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setFileName('');
    setParsedRows([]);
    setValidation(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6 max-w-5xl mx-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('../athletes')}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Upload className="h-6 w-6" />
              Importar Atletas em Massa
            </h1>
            <p className="text-muted-foreground text-sm">
              Importe múltiplos atletas de uma vez via arquivo CSV
            </p>
          </div>
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-6">
            {/* Drop zone */}
            <Card
              className="border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFileSelect(file);
              }}
            >
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <div className="rounded-full bg-muted p-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Arraste um arquivo CSV ou clique para selecionar</p>
                  <p className="text-sm text-muted-foreground mt-1">Máximo 500 atletas por importação</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </CardContent>
            </Card>

            {/* CSV format guide */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Formato do CSV</CardTitle>
                <CardDescription>
                  A primeira linha deve conter os cabeçalhos (case-insensitive). Campos obrigatórios marcados com *.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Coluna</TableHead>
                        <TableHead>Obrigatório</TableHead>
                        <TableHead>Formato / Valores</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-mono text-sm">full_name</TableCell>
                        <TableCell><Badge variant="destructive">Sim</Badge></TableCell>
                        <TableCell>Nome completo do atleta</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-sm">email</TableCell>
                        <TableCell><Badge variant="destructive">Sim</Badge></TableCell>
                        <TableCell>E-mail válido</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-sm">birth_date</TableCell>
                        <TableCell><Badge variant="destructive">Sim</Badge></TableCell>
                        <TableCell>AAAA-MM-DD (ex: 1990-05-25)</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-sm">gender</TableCell>
                        <TableCell><Badge variant="destructive">Sim</Badge></TableCell>
                        <TableCell>MASCULINO | FEMININO | OUTRO</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-sm">national_id</TableCell>
                        <TableCell><Badge variant="outline">Não</Badge></TableCell>
                        <TableCell>CPF (apenas números)</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-sm">phone</TableCell>
                        <TableCell><Badge variant="outline">Não</Badge></TableCell>
                        <TableCell>Telefone com DDD</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-mono text-sm">academy_slug</TableCell>
                        <TableCell><Badge variant="outline">Não</Badge></TableCell>
                        <TableCell>Slug da academia (ex: academia-brasil)</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <p className="text-xs font-mono text-muted-foreground">
                    Exemplo: full_name,email,birth_date,gender<br />
                    João Silva,joao@email.com,1990-05-25,MASCULINO
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* Summary cards */}
            {isValidating ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Validando {parsedRows.length} linhas...
                </CardContent>
              </Card>
            ) : validation && (
              <>
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">Total de linhas</p>
                      <p className="text-2xl font-bold">{validation.totalRows}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">Válidos</p>
                      <p className="text-2xl font-bold text-green-600">{validation.valid.length}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">Duplicados</p>
                      <p className="text-2xl font-bold text-amber-600">{validation.duplicates.length}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">Inválidos</p>
                      <p className="text-2xl font-bold text-red-600">{validation.invalid.length}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Preview table */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Preview — {fileName}</CardTitle>
                      <CardDescription>
                        Linhas com problema são marcadas. Apenas as linhas válidas serão importadas.
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                      <X className="h-4 w-4 mr-1" />
                      Trocar arquivo
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>E-mail</TableHead>
                            <TableHead>Nascimento</TableHead>
                            <TableHead>Gênero</TableHead>
                            <TableHead>Academia</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {validation.preview.map((row) => {
                            const isDup = row._isDuplicate;
                            const hasErrors = (row._errors || []).length > 0;
                            return (
                              <TableRow
                                key={row._rowIndex}
                                className={
                                  hasErrors
                                    ? 'bg-red-50 dark:bg-red-950/20'
                                    : isDup
                                    ? 'bg-amber-50 dark:bg-amber-950/20'
                                    : ''
                                }
                              >
                                <TableCell className="text-muted-foreground text-xs">{row._rowIndex}</TableCell>
                                <TableCell>
                                  {hasErrors ? (
                                    <Badge variant="destructive" className="text-xs">
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      Inválido
                                    </Badge>
                                  ) : isDup ? (
                                    <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">
                                      Duplicado
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      OK
                                    </Badge>
                                  )}
                                  {hasErrors && (
                                    <p className="text-xs text-red-600 mt-1">{(row._errors || []).join(', ')}</p>
                                  )}
                                </TableCell>
                                <TableCell className="font-medium">{row.full_name || '—'}</TableCell>
                                <TableCell className="text-sm">{row.email || '—'}</TableCell>
                                <TableCell className="text-sm">{row.birth_date || '—'}</TableCell>
                                <TableCell className="text-sm">{row.gender || '—'}</TableCell>
                                <TableCell className="text-sm">{row.academy_slug || '—'}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <Button variant="outline" onClick={handleReset}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={isConfirming || validation.valid.length === 0}
                  >
                    {isConfirming
                      ? 'Importando...'
                      : `Confirmar importação de ${validation.valid.length} atleta${validation.valid.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && importResult && (
          <Card>
            <CardContent className="py-16 flex flex-col items-center gap-6 text-center">
              <div className="rounded-full bg-green-100 p-5">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Importação concluída!</h2>
                <p className="text-muted-foreground mt-2">
                  <span className="text-green-600 font-semibold">{importResult.inserted} atletas</span> importados
                  {importResult.skipped > 0 && (
                    <span className="text-amber-600"> · {importResult.skipped} ignorados (duplicados)</span>
                  )}
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleReset}>
                  Importar mais
                </Button>
                <Button onClick={() => navigate('../athletes')}>
                  <Users className="h-4 w-4 mr-2" />
                  Ver atletas
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </AppShell>
  );
}
