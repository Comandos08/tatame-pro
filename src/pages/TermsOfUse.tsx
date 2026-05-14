import { Link } from 'react-router-dom';
import PublicHeader from '@/components/PublicHeader';
import { useI18n } from '@/contexts/I18nContext';
import iconLogo from '@/assets/iconLogo.png';
import { InstitutionalSeal } from '@/components/institutional';

export default function TermsOfUse() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight mb-8">
              {t('terms.title')}
            </h1>

            <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.acceptance.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.acceptance.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.service.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.service.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.account.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.account.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.acceptableUse.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.acceptableUse.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.payments.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.payments.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.refunds.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.refunds.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.intellectualProperty.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.intellectualProperty.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.tenantData.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.tenantData.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.availability.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.availability.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.liability.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.liability.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.termination.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.termination.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.changes.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.changes.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.law.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.law.text')}
                </p>
              </section>

              <section>
                <h2 className="font-display text-xl font-bold text-foreground/90 mb-3">
                  {t('terms.contact.title')}
                </h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {t('terms.contact.text')}
                </p>
              </section>

              <p className="text-sm text-muted-foreground pt-4">
                {t('terms.relatedPrivacy')}{' '}
                <Link to="/privacy" className="underline hover:text-foreground transition-colors">
                  {t('terms.relatedPrivacyLink')}
                </Link>
                .
              </p>

              <p className="text-xs text-muted-foreground/60 pt-8 border-t border-border">
                {t('terms.lastUpdated')}
              </p>
            </div>
          </div>
        </div>
      </section>

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
