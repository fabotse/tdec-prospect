import { Card, CardContent } from "@/components/ui/card";

/**
 * Team settings placeholder page
 * Story: 2.1 - Settings Page Structure & API Configuration UI
 * AC: #1 - Settings page with tab for Equipe
 */
export default function TeamPage() {
  return (
    <Card className="bg-background-secondary border-border">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <span className="text-4xl mb-4">👥</span>
        <h2 className="text-h2 text-foreground mb-2">Gestão de Equipe</h2>
        <p className="text-body text-foreground-muted text-center max-w-md">
          Em breve você poderá convidar e gerenciar membros da equipe,
          definindo permissões e papéis.
        </p>
      </CardContent>
    </Card>
  );
}
