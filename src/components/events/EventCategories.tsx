/**
 * E1.0 — EVENT CATEGORIES COMPONENT (SAFE GOLD)
 *
 * Manage event categories.
 * SAFE GOLD: deterministic, respects mutation boundary.
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Edit2, Trash2, Lock, Users } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { EventCategoryEntity, CategoryFormData } from '@/domain/events/types';
import type { SafeEventStatus } from '@/domain/events/safeEnums';
import { canModifyCategories } from '@/domain/events/guards';
import { CreateCategoryDialog } from './CreateCategoryDialog';

interface EventCategoriesProps {
  eventId: string;
  eventStatus: SafeEventStatus;
  categories: EventCategoryEntity[];
  onEditCategory?: (categoryId: string, data: CategoryFormData) => void;
  onDeleteCategory?: (categoryId: string) => void;
  registrationCounts?: Record<string, number>;
  isLoading?: boolean;
}

export function EventCategories({
  eventId,
  eventStatus,
  categories,
  onEditCategory,
  onDeleteCategory,
  registrationCounts = {},
  isLoading = false,
}: EventCategoriesProps) {
  const { t } = useI18n();
  const [editingCategory, setEditingCategory] = useState<EventCategoryEntity | null>(null);

  const canModify = canModifyCategories(eventStatus);

  const handleDelete = useCallback(
    (categoryId: string) => {
      if (onDeleteCategory) {
        onDeleteCategory(categoryId);
      }
    },
    [onDeleteCategory]
  );

  const formatGender = (gender: string | null) => {
    switch (gender) {
      case 'MALE':
        return t('events.categories.male');
      case 'FEMALE':
        return t('events.categories.female');
      case 'MIXED':
        return t('events.categories.mixed');
      default:
        return t('events.categories.any');
    }
  };

  const formatWeight = (min: number | null, max: number | null) => {
    if (min && max) return `${min}kg - ${max}kg`;
    if (min) return `≥ ${min}kg`;
    if (max) return `≤ ${max}kg`;
    return '-';
  };

  const formatAge = (min: number | null, max: number | null) => {
    if (min && max) return `${min} - ${max} anos`;
    if (min) return `≥ ${min} anos`;
    if (max) return `≤ ${max} anos`;
    return '-';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          {t('events.categories.title')}
          {!canModify && (
            <Badge variant="secondary" className="ml-2">
              <Lock className="h-3 w-3 mr-1" />
              {t('events.categories.locked')}
            </Badge>
          )}
        </CardTitle>
        {canModify && (
          <CreateCategoryDialog eventId={eventId} disabled={!canModify} />
        )}
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('events.categories.empty')}</p>
            {canModify && (
              <p className="text-sm mt-2">
                {t('events.categories.emptyHint')}
              </p>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('events.categories.name')}</TableHead>
                <TableHead>{t('events.categories.gender')}</TableHead>
                <TableHead>{t('events.categories.age')}</TableHead>
                <TableHead>{t('events.categories.weight')}</TableHead>
                <TableHead className="text-center">
                  {t('events.categories.registrations')}
                </TableHead>
                {canModify && (
                  <TableHead className="text-right">
                    {t('common.actions')}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>{formatGender(category.gender)}</TableCell>
                  <TableCell>{formatAge(category.minAge, category.maxAge)}</TableCell>
                  <TableCell>{formatWeight(category.minWeight, category.maxWeight)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline">
                      {registrationCounts[category.id] ?? 0}
                    </Badge>
                  </TableCell>
                  {canModify && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingCategory(category)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(category.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Edit Dialog - simplified since CreateCategoryDialog manages its own state */}
        <Dialog open={!!editingCategory} onOpenChange={() => setEditingCategory(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('events.categories.edit')}
              </DialogTitle>
            </DialogHeader>
            {editingCategory && (
              <div className="text-sm text-muted-foreground">
                <p>{t('events.categories.editHint')}</p>
                <p className="mt-2">
                  <strong>{t('events.categories.currentName')}:</strong> {editingCategory.name}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
