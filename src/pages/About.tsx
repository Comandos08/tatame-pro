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
            {/* Section 1 */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.section1.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('about.section1.text')}
              </p>
            </motion.div>

            {/* Section 2 */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.section2.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('about.section2.text')}
              </p>
            </motion.div>

            {/* Section 3 */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.section3.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('about.section3.text')}
              </p>
            </motion.div>

            {/* Section 4 */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.section4.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('about.section4.text')}
              </p>
            </motion.div>

            {/* Section 5 */}
            <motion.div variants={fadeInUp}>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-4">
                {t('about.section5.title')}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('about.section5.text')}
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
