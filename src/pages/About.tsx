import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import PublicHeader from '@/components/PublicHeader';
import iconLogo from '@/assets/iconLogo.png';
import { useI18n } from '@/contexts/I18nContext';
import { InstitutionalSeal } from '@/components/institutional';

// Institutional animation - subtle and uniform
const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" },
};

export default function About() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <PublicHeader />

      {/* Hero Section */}
      <section className="py-20 lg:py-28 border-b border-border">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            animate="animate"
            className="max-w-4xl mx-auto text-center"
          >
            <motion.h1
              variants={fadeIn}
              className="font-display text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-6"
            >
              {t('about.heroTitle')}
            </motion.h1>
            <motion.p
              variants={fadeIn}
              className="text-lg md:text-xl text-muted-foreground font-light max-w-2xl mx-auto"
            >
              {t('about.heroSubtitle')}
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Content Sections */}
      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {/* Role in Sport */}
            <motion.div
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              variants={fadeIn}
            >
              <h2 className="font-display text-xl md:text-2xl font-bold text-foreground/90 mb-4">
                {t('about.role.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {t('about.role.text')}
              </p>
            </motion.div>

            {/* Limits */}
            <motion.div
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              variants={fadeIn}
              className="mt-12"
            >
              <h2 className="font-display text-xl md:text-2xl font-bold text-foreground/90 mb-4">
                {t('about.limits.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {t('about.limits.text')}
              </p>
            </motion.div>

            {/* Separator */}
            <div className="h-px w-16 bg-border mx-auto mt-16" />

            {/* Ecosystem Structure */}
            <motion.div
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              variants={fadeIn}
              className="mt-8"
            >
              <h2 className="font-display text-xl md:text-2xl font-bold text-foreground/90 mb-4">
                {t('about.ecosystem.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                {t('about.ecosystem.text')}
              </p>
              <div className="space-y-3 pl-5 border-l border-border">
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {t('about.ecosystem.layer1').split(' — ')[0]}
                  </span>
                  <span className="text-muted-foreground"> — {t('about.ecosystem.layer1').split(' — ')[1]}</span>
                </div>
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {t('about.ecosystem.layer2').split(' — ')[0]}
                  </span>
                  <span className="text-muted-foreground"> — {t('about.ecosystem.layer2').split(' — ')[1]}</span>
                </div>
                <div className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {t('about.ecosystem.layer3').split(' — ')[0]}
                  </span>
                  <span className="text-muted-foreground"> — {t('about.ecosystem.layer3').split(' — ')[1]}</span>
                </div>
              </div>
              <p className="text-muted-foreground leading-relaxed mt-6">
                {t('about.ecosystem.conclusion')}
              </p>
            </motion.div>

            {/* Separator */}
            <div className="h-px w-16 bg-border mx-auto mt-16" />

            {/* Governance */}
            <motion.div
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              variants={fadeIn}
              className="mt-8"
            >
              <h2 className="font-display text-xl md:text-2xl font-bold text-foreground/90 mb-4">
                {t('about.governance.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {t('about.governance.text')}
              </p>
            </motion.div>

            {/* Neutrality */}
            <motion.div
              initial="initial"
              whileInView="animate"
              viewport={{ once: true }}
              variants={fadeIn}
              className="mt-12"
            >
              <h2 className="font-display text-xl md:text-2xl font-bold text-foreground/90 mb-4">
                {t('about.neutrality.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {t('about.neutrality.text')}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 lg:py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true }}
            variants={fadeIn}
            className="text-center"
          >
            <Button 
              variant="outline" 
              size="lg" 
              className="text-base h-11 px-6 border-muted-foreground/30 hover:border-foreground/50 hover:bg-transparent"
              asChild
            >
              <Link to="/login">
                {t('about.cta')}
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
