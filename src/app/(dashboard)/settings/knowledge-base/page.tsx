import { Card, CardContent } from "@/components/ui/card";

/**
 * Knowledge Base settings placeholder page
 * Story: 2.1 - Settings Page Structure & API Configuration UI
 * AC: #1 - Settings page with tab for Base de Conhecimento
 */
export default function KnowledgeBasePage() {
  return (
    <Card className="bg-background-secondary border-border">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <span className="text-4xl mb-4">📚</span>
        <h2 className="text-h2 text-foreground mb-2">Base de Conhecimento</h2>
        <p className="text-body text-foreground-muted text-center max-w-md">
          Em breve você poderá configurar o perfil da empresa, tom de voz e definição de ICP
          para personalizar a geração de conteúdo.
        </p>
      </CardContent>
    </Card>
  );
}
