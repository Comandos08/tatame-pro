import React, { useState, useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';

const STORAGE_KEY = 'tatame:postlogin_institutional_seen';

export function PostLoginInstitutionalBanner() {
  const { t } = useI18n();
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    // Check if already seen this session
    const alreadySeen = sessionStorage.getItem(STORAGE_KEY) === 'true';
    
    if (!alreadySeen) {
      setShouldShow(true);
      // Mark as seen
      sessionStorage.setItem(STORAGE_KEY, 'true');
    }
  }, []);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-6">
      <h2 className="font-display text-xl font-bold mb-2">
        {t('postlogin.institutional.title')}
      </h2>
      <p className="text-muted-foreground mb-4 max-w-2xl">
        {t('postlogin.institutional.description')}
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {t('postlogin.institutional.point1')}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {t('postlogin.institutional.point2')}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {t('postlogin.institutional.point3')}
        </span>
      </div>
    </div>
  );
}
