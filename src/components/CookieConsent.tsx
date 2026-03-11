import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/contexts/I18nContext';
import { Button } from '@/components/ui/button';

const COOKIE_CONSENT_KEY = 'tatame-cookie-consent';

export default function CookieConsent() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t border-border shadow-lg">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 max-w-4xl">
        <p className="text-sm text-muted-foreground text-center sm:text-left">
          {t('cookie.message')}{' '}
          <Link to="/privacy" className="underline hover:text-foreground transition-colors">
            {t('cookie.learnMore')}
          </Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={decline}>
            {t('cookie.decline')}
          </Button>
          <Button size="sm" onClick={accept}>
            {t('cookie.accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
