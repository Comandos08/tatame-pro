import React from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PortalEmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  action?: {
    label: string;
    href: string;
  };
}

export function PortalEmptyState({
  title,
  description,
  icon: Icon = FileText,
  action,
}: PortalEmptyStateProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {action && (
          <Link to={action.href}>
            <Button variant="outline" size="sm">
              {action.label}
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
