/**
 * 🔐 AccessDenied — Permission Error Screen
 * 
 * Displayed when a user is authenticated but lacks the required roles.
 * Does NOT redirect - just displays an error message.
 */

import React from 'react';
import { ShieldX, ArrowLeft, Home } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/contexts/I18nContext';

interface AccessDeniedProps {
  /** Custom title (optional) */
  title?: string;
  /** Custom description (optional) */
  description?: string;
}

export function AccessDenied({ title, description }: AccessDeniedProps) {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle>{title || t('auth.accessDenied')}</CardTitle>
          <CardDescription>
            {description || t('auth.accessDeniedDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button 
            variant="outline" 
            onClick={() => navigate(-1)}
            className="w-full"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.goBack')}
          </Button>
          <Button asChild className="w-full">
            <Link to="/portal">
              <Home className="h-4 w-4 mr-2" />
              {t('common.goHome')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default AccessDenied;
