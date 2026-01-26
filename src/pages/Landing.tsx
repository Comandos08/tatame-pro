import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Zap, Users, Award, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PublicHeader from '@/components/PublicHeader';
import iconLogo from '@/assets/iconLogo.png';
import { useI18n } from '@/contexts/I18nContext';
import type { TranslationKey } from '@/locales/pt-BR';

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const featureItems: { icon: typeof Users; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  {
    icon: Users,
    titleKey: 'landing.featureAthletes',
    descKey: 'landing.featureAthletesDesc',
  },
  {
    icon: Award,
    titleKey: 'landing.featureGradings',
    descKey: 'landing.featureGradingsDesc',
  },
  {
    icon: Shield,
    titleKey: 'landing.featureMultiSport',
    descKey: 'landing.featureMultiSportDesc',
  },
  {
    icon: Zap,
    titleKey: 'landing.featurePayments',
    descKey: 'landing.featurePaymentsDesc',
  },
];

const ctaItems: TranslationKey[] = [
  'landing.ctaFreeSignup',
  'landing.ctaSupport',
  'landing.ctaStripe',
];

export default function Landing() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-glow opacity-50" />
        
        {/* Header */}
        <PublicHeader />

        {/* Hero content */}
        <div className="relative z-10 container mx-auto px-4 py-24 lg:py-32">
          <motion.div
            initial="initial"
            animate="animate"
            variants={stagger}
            className="max-w-4xl mx-auto text-center"
          >
            <motion.div variants={fadeInUp}>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm text-primary mb-6">
                <Zap className="h-4 w-4" />
                {t('landing.platformBadge')}
              </span>
            </motion.div>
            
            <motion.h1
              variants={fadeInUp}
              className="font-display text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6"
            >
              {t('landing.heroTitle')}{' '}
              <span className="text-gradient-primary">{t('landing.heroTitleHighlight')}</span>
              <br />
              {t('landing.heroTitleEnd')}
            </motion.h1>
            
            <motion.p
              variants={fadeInUp}
              className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8"
            >
              {t('landing.heroDescription')}
            </motion.p>
            
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="text-lg h-12 px-8" asChild>
                <Link to="/login">
                  {t('landing.accessPlatform')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="tenant-outline" className="text-lg h-12 px-8" asChild>
                <Link to="/help">{t('landing.learnMore')}</Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>

        {/* Decorative elements */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </section>

      {/* Features Section */}
      <section className="py-24 lg:py-32">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.h2
              variants={fadeInUp}
              className="font-display text-3xl md:text-4xl font-bold mb-4"
            >
              {t('landing.featuresTitle')}
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="text-muted-foreground text-lg max-w-2xl mx-auto"
            >
              {t('landing.featuresDescription')}
            </motion.p>
          </motion.div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {featureItems.map((feature) => (
              <motion.div
                key={feature.titleKey}
                variants={fadeInUp}
                className="group p-6 rounded-2xl bg-card border border-border card-hover"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-display text-lg font-semibold mb-2">{t(feature.titleKey)}</h3>
                <p className="text-muted-foreground text-sm">{t(feature.descKey)}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 lg:py-32 border-t border-border">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={stagger}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.h2
              variants={fadeInUp}
              className="font-display text-3xl md:text-4xl font-bold mb-6"
            >
              {t('landing.ctaTitle')}
            </motion.h2>
            <motion.div variants={fadeInUp} className="flex flex-col gap-3 mb-8 text-left max-w-md mx-auto">
              {ctaItems.map((itemKey) => (
                <div key={itemKey} className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded-full bg-success/20 flex items-center justify-center">
                    <Check className="h-3 w-3 text-success" />
                  </div>
                  <span className="text-muted-foreground">{t(itemKey)}</span>
                </div>
              ))}
            </motion.div>
            <motion.div variants={fadeInUp}>
              <Button size="lg" className="text-lg h-12 px-8" asChild>
                <Link to="/login">
                  {t('landing.createFreeAccount')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
              <span className="font-display font-bold">TATAME</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('landing.copyright').replace('{year}', new Date().getFullYear().toString())}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
