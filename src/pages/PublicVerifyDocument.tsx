import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle, AlertCircle, Search, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type VerifyResponse =
  | {
      valid: true;
      document_type: "digital_card" | "diploma";
      holder_name: string;
      issuer_name: string;
      status_label: "VALID";
      issued_at: string;
      sport_type?: string;
      grading_level?: string;
      valid_until?: string | null;
    }
  | {
      valid: false;
      status_label: "INVALID" | "REVOKED" | "NOT_FOUND";
    };

type VerifyState = "loading" | "valid" | "invalid" | "revoked" | "not_found";

export default function PublicVerifyDocument() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<VerifyState>("loading");
  const [data, setData] = useState<VerifyResponse | null>(null);

  useEffect(() => {
    async function verifyDocument() {
      if (!token) {
        setState("not_found");
        return;
      }

      try {
        const { data: response, error } = await supabase.functions.invoke<VerifyResponse>(
          "verify-document",
          { body: { token } }
        );

        if (error || !response) {
          setState("not_found");
          return;
        }

        setData(response);

        if (response.valid) {
          setState("valid");
        } else {
          switch (response.status_label) {
            case "REVOKED":
              setState("revoked");
              break;
            case "INVALID":
              setState("invalid");
              break;
            default:
              setState("not_found");
          }
        }
      } catch (err) {
        console.error("Verification error:", err);
        setState("not_found");
      }
    }

    verifyDocument();
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md overflow-hidden">
        {state === "loading" && <LoadingState />}
        {state === "valid" && data?.valid && <ValidState data={data} />}
        {state === "invalid" && <InvalidState />}
        {state === "revoked" && <RevokedState />}
        {state === "not_found" && <NotFoundState />}
      </Card>
    </div>
  );
}

function LoadingState() {
  return (
    <CardContent className="py-12 text-center">
      <Search className="h-12 w-12 mx-auto text-muted-foreground animate-pulse mb-4" />
      <p className="text-muted-foreground">Verificando documento...</p>
    </CardContent>
  );
}

interface ValidData {
  valid: true;
  document_type: "digital_card" | "diploma";
  holder_name: string;
  issuer_name: string;
  status_label: "VALID";
  issued_at: string;
  sport_type?: string;
  grading_level?: string;
  valid_until?: string | null;
}

function ValidState({ data }: { data: ValidData }) {
  const documentLabel = data.document_type === "digital_card" ? "Carteirinha Digital" : "Diploma";

  return (
    <>
      {/* Success Banner */}
      <div className="bg-primary py-6 px-4 text-center">
        <CheckCircle2 className="h-16 w-16 mx-auto text-primary-foreground mb-2" />
        <h1 className="text-2xl font-bold text-primary-foreground">Documento Válido</h1>
      </div>

      <CardContent className="py-6 space-y-4">
        {/* Document Type Badge */}
        <div className="flex justify-center">
          <Badge variant="secondary" className="text-sm">
            {documentLabel}
          </Badge>
        </div>

        {/* Holder Info */}
        <div className="text-center space-y-1">
          <p className="text-2xl font-bold">{data.holder_name}</p>
          {data.grading_level && (
            <p className="text-lg text-muted-foreground">{data.grading_level}</p>
          )}
        </div>

        {/* Issuer */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Instituição</span>
            <span className="font-medium">{data.issuer_name}</span>
          </div>
          {data.sport_type && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Modalidade</span>
              <span className="font-medium">{data.sport_type}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Emitido em</span>
            <span className="font-medium">{formatDisplayDate(data.issued_at)}</span>
          </div>
          {data.valid_until && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Válido até</span>
              <span className="font-medium">{formatDisplayDate(data.valid_until)}</span>
            </div>
          )}
        </div>

        {/* Trust Seal */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Documento válido conforme registros oficiais.</span>
          </div>
        </div>
      </CardContent>
    </>
  );
}

function InvalidState() {
  return (
    <>
      <div className="bg-destructive py-6 px-4 text-center">
        <XCircle className="h-16 w-16 mx-auto text-destructive-foreground mb-2" />
        <h1 className="text-2xl font-bold text-destructive-foreground">Documento Inválido</h1>
      </div>
      <CardContent className="py-8 text-center">
        <p className="text-muted-foreground">
          Este documento não pôde ser validado. Ele pode estar suspenso, expirado ou a
          instituição emissora não está ativa.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>Verificação realizada em tempo real.</span>
        </div>
      </CardContent>
    </>
  );
}

function RevokedState() {
  return (
    <>
      <div className="bg-accent py-6 px-4 text-center">
        <AlertCircle className="h-16 w-16 mx-auto text-accent-foreground mb-2" />
        <h1 className="text-2xl font-bold text-accent-foreground">Documento Revogado</h1>
      </div>
      <CardContent className="py-8 text-center">
        <p className="text-muted-foreground">
          Este documento foi revogado pela instituição emissora e não é mais válido.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>Verificação realizada em tempo real.</span>
        </div>
      </CardContent>
    </>
  );
}

function NotFoundState() {
  return (
    <>
      <div className="bg-muted py-6 px-4 text-center">
        <Search className="h-16 w-16 mx-auto text-muted-foreground mb-2" />
        <h1 className="text-2xl font-bold text-foreground">Documento Não Encontrado</h1>
      </div>
      <CardContent className="py-8 text-center">
        <p className="text-muted-foreground">
          Não foi possível encontrar um documento com este código. Verifique se o link está
          correto ou se o QR Code foi escaneado corretamente.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>Verificação realizada em tempo real.</span>
        </div>
      </CardContent>
    </>
  );
}

// Use formatDate from centralized formatters
// Note: This public page uses pt-BR as default since it doesn't have i18n context
import { formatDate as formatDateUtil } from '@/lib/i18n/formatters';
function formatDisplayDate(dateStr: string): string {
  return formatDateUtil(dateStr, 'pt-BR');
}
