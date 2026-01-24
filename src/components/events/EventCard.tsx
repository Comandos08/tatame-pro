import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, MapPin, Users, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EventStatusBadge } from './EventStatusBadge';
import { Event, EventStatus, canRegisterForEvent } from '@/types/event';
import { useI18n } from '@/contexts/I18nContext';
import { cn } from '@/lib/utils';

interface EventCardProps {
  event: Event;
  tenantSlug: string;
  isAdmin?: boolean;
  registrationCount?: number;
  className?: string;
}

export function EventCard({ 
  event, 
  tenantSlug, 
  isAdmin = false, 
  registrationCount,
  className 
}: EventCardProps) {
  const { t } = useI18n();
  
  const startDate = new Date(event.start_date);
  const endDate = new Date(event.end_date);
  const isSameDay = format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd');
  
  const dateDisplay = isSameDay
    ? format(startDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : `${format(startDate, "dd MMM", { locale: ptBR })} - ${format(endDate, "dd MMM yyyy", { locale: ptBR })}`;

  const detailsLink = isAdmin 
    ? `/${tenantSlug}/app/events/${event.id}`
    : `/${tenantSlug}/events/${event.id}`;

  const showRegistrationCta = !isAdmin && canRegisterForEvent(event.status as EventStatus);

  return (
    <Card className={cn('overflow-hidden hover:shadow-md transition-shadow', className)}>
      {/* Banner */}
      {event.banner_url && (
        <div className="aspect-video w-full overflow-hidden">
          <img 
            src={event.banner_url} 
            alt={event.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display font-semibold text-lg line-clamp-2">{event.name}</h3>
          <EventStatusBadge status={event.status as EventStatus} size="sm" />
        </div>
        {event.sport_type && (
          <span className="text-xs text-muted-foreground">{event.sport_type}</span>
        )}
      </CardHeader>
      
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 flex-shrink-0" />
          <span>{dateDisplay}</span>
        </div>
        
        {event.location && (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="line-clamp-1">{event.location}</span>
          </div>
        )}
        
        {isAdmin && registrationCount !== undefined && (
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 flex-shrink-0" />
            <span>{registrationCount} {t('events.registrations' as any)}</span>
          </div>
        )}
        
        {event.description && (
          <p className="line-clamp-2 pt-1">{event.description}</p>
        )}
      </CardContent>
      
      <CardFooter className="pt-2">
        {showRegistrationCta ? (
          <Button asChild className="w-full">
            <Link to={detailsLink}>
              {t('events.registerNow' as any) || 'Inscrever-se'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" asChild className="w-full">
            <Link to={detailsLink}>
              {t('common.view')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
