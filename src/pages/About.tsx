import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PublicHeader from '@/components/PublicHeader';
import iconLogo from '@/assets/iconLogo.png';
import { useI18n } from '@/contexts/I18nContext';
import { InstitutionalSeal } from '@/components/institutional';

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

export default function About() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <PublicHeader />

      {/* Hero Section */}
      <section className="py-24 lg:py-32 border-b border-border">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            animate="animate"
            variants={stagger}
            className="max-w-4xl mx-auto text-center"
          >
            <motion.h1
              variants={fadeInUp}
              className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
            >
              {t('about.heroTitle')}
            </motion.h1>
            <motion.p
              variants={fadeInUp}
              className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
            >
              {t('about.heroSubtitle')}
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Content Sections */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={stagger}
            className="max-w-3xl mx-auto space-y-16"
          >
            {/* Role in Sport */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.role.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {t('about.role.text')}
              </p>
            </motion.div>

            {/* Limits */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.limits.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {t('about.limits.text')}
              </p>
            </motion.div>

            {/* Ecosystem Structure */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.ecosystem.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                {t('about.ecosystem.text')}
              </p>
              <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">Instituições</span>
                  <span className="text-muted-foreground"> — {t('about.ecosystem.layer1').split(' — ')[1]}</span>
                </div>
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">Organizações</span>
                  <span className="text-muted-foreground"> — {t('about.ecosystem.layer2').split(' — ')[1]}</span>
                </div>
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">Indivíduos</span>
                  <span className="text-muted-foreground"> — {t('about.ecosystem.layer3').split(' — ')[1]}</span>
                </div>
              </div>
              <p className="text-muted-foreground leading-relaxed mt-6">
                {t('about.ecosystem.conclusion')}
              </p>
            </motion.div>

            {/* Governance */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.governance.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {t('about.governance.text')}
              </p>
            </motion.div>

            {/* Neutrality */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.neutrality.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {t('about.neutrality.text')}
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 lg:py-24 border-t border-border">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="text-center"
          >
            <Button size="lg" className="text-lg h-12 px-8" asChild>
              <Link to="/login">
                {t('about.cta')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <img src={iconLogo} alt="TATAME" className="h-8 w-8 rounded-lg object-contain" />
                <span className="font-display font-bold">TATAME</span>
              </div>
              <InstitutionalSeal />
              <Link 
                to="/about" 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('nav.about')}
              </Link>
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
