import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle, AlertCircle, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/contexts/I18nContext";
import { formatDate } from "@/lib/i18n/formatters";
import { TrustSeal } from "@/components/trust/TrustSeal";
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
  const { t, locale } = useI18n();
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
        {state === "loading" && <LoadingState t={t} />}
        {state === "valid" && data?.valid && <ValidState data={data} t={t} locale={locale} />}
        {state === "invalid" && <InvalidState t={t} />}
        {state === "revoked" && <RevokedState t={t} />}
        {state === "not_found" && <NotFoundState t={t} />}
      </Card>
    </div>
  );
}

type TFunction = (key: string, params?: Record<string, string>) => string;

function LoadingState({ t }: { t: TFunction }) {
  return (
    <CardContent className="py-12 text-center">
      <Search className="h-12 w-12 mx-auto text-muted-foreground animate-pulse mb-4" />
      <p className="text-muted-foreground">{t('publicVerify.loading')}</p>
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

function ValidState({ data, t, locale }: { data: ValidData; t: TFunction; locale: string }) {
  const documentLabel = t(`publicVerify.documentType.${data.document_type}`);

  return (
    <>
      {/* Success Banner */}
      <div className="bg-primary py-6 px-4 text-center">
        <CheckCircle2 className="h-16 w-16 mx-auto text-primary-foreground mb-2" />
        <h1 className="text-2xl font-bold text-primary-foreground">{t('publicVerify.valid.title')}</h1>
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
            <span className="text-muted-foreground">{t('publicVerify.institution')}</span>
            <span className="font-medium">{data.issuer_name}</span>
          </div>
          {data.sport_type && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('publicVerify.sport')}</span>
              <span className="font-medium">{data.sport_type}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('publicVerify.issuedAt')}</span>
            <span className="font-medium">{formatDate(data.issued_at, locale)}</span>
          </div>
          {data.valid_until && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('publicVerify.validUntil')}</span>
              <span className="font-medium">{formatDate(data.valid_until, locale)}</span>
            </div>
          )}
        </div>

        {/* Trust Seal */}
        <div className="border-t pt-4">
          <TrustSeal 
            message={t('trust.verifiedRecord')}
            source={t('trust.sourceOfTruth')}
            variant="verified"
          />
        </div>
      </CardContent>
    </>
  );
}

function InvalidState({ t }: { t: TFunction }) {
  return (
    <>
      <div className="bg-destructive py-6 px-4 text-center">
        <XCircle className="h-16 w-16 mx-auto text-destructive-foreground mb-2" />
        <h1 className="text-2xl font-bold text-destructive-foreground">{t('publicVerify.invalid.title')}</h1>
      </div>
      <CardContent className="py-8 text-center">
        <p className="text-muted-foreground">
          {t('publicVerify.invalid.desc')}
        </p>
        <div className="mt-6">
          <TrustSeal 
            message={t('publicVerify.realTimeVerification')}
            variant="info"
          />
        </div>
      </CardContent>
    </>
  );
}

function RevokedState({ t }: { t: TFunction }) {
  return (
    <>
      <div className="bg-accent py-6 px-4 text-center">
        <AlertCircle className="h-16 w-16 mx-auto text-accent-foreground mb-2" />
        <h1 className="text-2xl font-bold text-accent-foreground">{t('publicVerify.revoked.title')}</h1>
      </div>
      <CardContent className="py-8 text-center">
        <p className="text-muted-foreground">
          {t('publicVerify.revoked.desc')}
        </p>
        <div className="mt-6">
          <TrustSeal 
            message={t('publicVerify.realTimeVerification')}
            variant="info"
          />
        </div>
      </CardContent>
    </>
  );
}

function NotFoundState({ t }: { t: TFunction }) {
  return (
    <>
      <div className="bg-muted py-6 px-4 text-center">
        <Search className="h-16 w-16 mx-auto text-muted-foreground mb-2" />
        <h1 className="text-2xl font-bold text-foreground">{t('publicVerify.notFound.title')}</h1>
      </div>
      <CardContent className="py-8 text-center">
        <p className="text-muted-foreground">
          {t('publicVerify.notFound.desc')}
        </p>
        <div className="mt-6">
          <TrustSeal 
            message={t('publicVerify.realTimeVerification')}
            variant="info"
          />
        </div>
      </CardContent>
    </>
  );
}
