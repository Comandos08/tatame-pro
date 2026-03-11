import { Link } from 'react-router-dom';
import PublicHeader from '@/components/PublicHeader';
import { useI18n } from '@/contexts/I18nContext';
import iconLogo from '@/assets/iconLogo.png';
import { InstitutionalSeal } from '@/components/institutional';

export default function PrivacyPolicy() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-8">
              {t('privacy.title')}
            </h1>

            <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
              {/* Data Controller */}
              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('privacy.controller.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t('privacy.controller.text')}
                </p>
              </section>

              {/* Data Collected */}
              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('privacy.dataCollected.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('privacy.dataCollected.text')}
                </p>
              </section>

              {/* Purpose */}
              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('privacy.purpose.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('privacy.purpose.text')}
                </p>
              </section>

              {/* Legal Basis (LGPD) */}
              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('privacy.legalBasis.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('privacy.legalBasis.text')}
                </p>
              </section>

              {/* Data Sharing */}
              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('privacy.sharing.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('privacy.sharing.text')}
                </p>
              </section>

              {/* Rights (LGPD) */}
              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('privacy.rights.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('privacy.rights.text')}
                </p>
              </section>

              {/* Cookies */}
              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('privacy.cookies.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('privacy.cookies.text')}
                </p>
              </section>

              {/* Data Retention */}
              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('privacy.retention.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t('privacy.retention.text')}
                </p>
              </section>

              {/* Contact */}
              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('privacy.contact.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {t('privacy.contact.text')}
                </p>
              </section>

              {/* Last Updated */}
              <p className="text-xs text-muted-foreground/60 pt-8 border-t border-border">
                {t('privacy.lastUpdated')}
              </p>
            </div>
          </div>
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
