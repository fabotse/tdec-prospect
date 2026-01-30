"use client";

import { Card, CardContent } from "@/components/ui/card";

interface ComingSoonCardProps {
  title: string;
  description?: string;
}

/**
 * Placeholder card for features not yet implemented
 * Story: 2.4 - Knowledge Base Editor - Company Profile
 * AC: #1 - Other sections show "Em breve"
 */
export function ComingSoonCard({ title, description }: ComingSoonCardProps) {
  return (
    <Card className="bg-background-secondary border-border">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <span className="text-4xl mb-4">🚧</span>
        <h3 className="text-h3 text-foreground mb-2">{title}</h3>
        <p className="text-body text-foreground-muted text-center max-w-md">
          {description || "Esta funcionalidade estará disponível em breve."}
        </p>
      </CardContent>
    </Card>
  );
}
