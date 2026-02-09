import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Users, Award, Calendar, Building2, QrCode, MapPin, ChevronRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/contexts/TenantContext";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import PublicHeader from "@/components/PublicHeader";
import { LoadingState } from '@/components/ux/LoadingState';

interface Academy {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  sport_type: string | null;
}


export default function TenantLanding() {
  const { tenant } = useTenant();
  const { t } = useI18n();
  const [featuredAcademies, setFeaturedAcademies] = useState<Academy[]>([]);

  useEffect(() => {
    async function fetchFeaturedAcademies() {
      if (!tenant?.id) return;

      const { data } = await supabase
        .from("academies")
        .select("id, name, city, state, sport_type")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .order("name")
        .limit(6);

      if (data) {
        setFeaturedAcademies(data);
      }
    }

    fetchFeaturedAcademies();
  }, [tenant?.id]);

  if (!tenant) return <LoadingState titleKey="common.loading" />;

  const features = [
    { icon: Users, titleKey: "tenant.featureAffiliation" as const, descKey: "tenant.featureAffiliationDesc" as const },
    { icon: Award, titleKey: "tenant.featureGradings" as const, descKey: "tenant.featureGradingsDesc" as const },
    { icon: Calendar, titleKey: "tenant.featureEvents" as const, descKey: "tenant.featureEventsDesc" as const },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <PublicHeader tenant={tenant} />

      {/* Hero */}
      <section className="py-24 lg:py-32 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-10 blur-3xl"
            style={{ backgroundColor: tenant.primaryColor }}
          />
        </div>
        <div className="container mx-auto px-4 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto text-center"
          >
            <div
              className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm mb-6"
              style={{ color: tenant.primaryColor }}
            >
              {tenant.sportTypes.join(" • ")}
            </div>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              {t("tenant.welcome")} <span style={{ color: tenant.primaryColor }}>{tenant.name}</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">{tenant.description || t("tenant.portalDesc")}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="tenant" className="h-12 px-8" asChild>
                <Link to={`/${tenant.slug}/membership/new`}>
                  {t("tenant.joinNow")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="tenant-outline" className="h-12 px-8" asChild>
                <Link to={`/${tenant.slug}/app`}>{t("nav.myAccount")}</Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Sports */}
      <section className="py-12 border-t border-border bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-center font-display text-2xl font-bold mb-8">{t("tenant.sports")}</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {tenant.sportTypes.map((sport, index) => (
              <motion.div
                key={sport}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <Badge
                  variant="secondary"
                  className="text-lg px-6 py-3 rounded-full"
                  style={{
                    backgroundColor: `${tenant.primaryColor}15`,
                    color: tenant.primaryColor,
                    borderColor: tenant.primaryColor,
                  }}
                >
                  {sport}
                </Badge>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.titleKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="text-center"
              >
                <div
                  className="h-14 w-14 rounded-xl mx-auto flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${tenant.primaryColor}20` }}
                >
                  <feature.icon className="h-7 w-7" style={{ color: tenant.primaryColor }} />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{t(feature.titleKey)}</h3>
                <p className="text-muted-foreground text-sm">{t(feature.descKey)}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Academies */}
      {featuredAcademies.length > 0 && (
        <section className="py-16 border-t border-border bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="font-display text-2xl font-bold">{t("tenant.previewAcademies")}</h2>
                <p className="text-muted-foreground mt-1">{t("tenant.accreditedAcademies")}</p>
              </div>
              <Button variant="outline" asChild>
                <Link to={`/${tenant.slug}/academies`}>
                  {t("tenant.seeAllAcademies")}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {featuredAcademies.map((academy, index) => (
                <motion.div
                  key={academy.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Card className="h-full hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${tenant.primaryColor}15` }}
                          >
                            <Building2 className="h-5 w-5" style={{ color: tenant.primaryColor }} />
                          </div>
                          <CardTitle className="text-base">{academy.name}</CardTitle>
                        </div>
                        {academy.sport_type && (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {academy.sport_type}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {(academy.city || academy.state) && (
                        <CardDescription className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {[academy.city, academy.state].filter(Boolean).join(", ")}
                        </CardDescription>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Verification Section */}
      <section className="py-16 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div
              className="h-16 w-16 rounded-2xl mx-auto flex items-center justify-center mb-6"
              style={{ backgroundColor: `${tenant.primaryColor}15` }}
            >
              <QrCode className="h-8 w-8" style={{ color: tenant.primaryColor }} />
            </div>
            <h2 className="font-display text-2xl font-bold mb-4">{t("tenant.verifyCredentials")}</h2>
            <p className="text-muted-foreground mb-6">{t("tenant.verifyDesc")}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" asChild>
                <Link to={`/${tenant.slug}/verify/card`}>{t("tenant.verifyCard")}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to={`/${tenant.slug}/verify/diploma`}>{t("tenant.verifyDiploma")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 relative overflow-hidden" style={{ backgroundColor: tenant.primaryColor }}>
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="font-display text-3xl font-bold text-white mb-4">
            {t("tenant.joinCta")} {tenant.name}
          </h2>
          <p className="text-white/80 mb-8 max-w-xl mx-auto">{t("tenant.joinCtaDesc")}</p>
          <Button size="lg" variant="secondary" className="h-12 px-8" asChild>
            <Link to={`/${tenant.slug}/membership/new`}>
              {t("tenant.joinNow")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {tenant.name}. Powered by{" "}
            <Link to="/" className="text-primary hover:underline">
              TATAME
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
