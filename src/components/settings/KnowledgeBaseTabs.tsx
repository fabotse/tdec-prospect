"use client";

/**
 * Knowledge Base Sub-Tabs
 * Story: 2.4 - Knowledge Base Editor - Company Profile
 *
 * AC: #1 - Sections: Empresa, Tom de Voz, Exemplos, ICP
 * AC: #1 - Empresa section functional, others show "Em breve"
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyProfileForm } from "./CompanyProfileForm";
import { ComingSoonCard } from "./ComingSoonCard";

export function KnowledgeBaseTabs() {
  return (
    <Tabs defaultValue="company" className="w-full">
      <TabsList className="grid w-full grid-cols-4 bg-background-secondary">
        <TabsTrigger value="company">Empresa</TabsTrigger>
        <TabsTrigger value="tone">Tom de Voz</TabsTrigger>
        <TabsTrigger value="examples">Exemplos</TabsTrigger>
        <TabsTrigger value="icp">ICP</TabsTrigger>
      </TabsList>

      <TabsContent value="company" className="mt-4">
        <Card className="bg-background-secondary border-border">
          <CardHeader>
            <CardTitle className="text-h3">Informações da Empresa</CardTitle>
            <CardDescription className="text-body-small text-foreground-muted">
              Estas informações serão usadas pela IA para personalizar os textos gerados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyProfileForm />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tone" className="mt-4">
        <ComingSoonCard
          title="Tom de Voz"
          description="Configure o estilo e tom de comunicação da sua empresa para os emails gerados."
        />
      </TabsContent>

      <TabsContent value="examples" className="mt-4">
        <ComingSoonCard
          title="Exemplos de Email"
          description="Adicione exemplos de emails bem-sucedidos para a IA aprender o seu estilo."
        />
      </TabsContent>

      <TabsContent value="icp" className="mt-4">
        <ComingSoonCard
          title="ICP - Perfil de Cliente Ideal"
          description="Defina as características do seu cliente ideal para melhorar a segmentação."
        />
      </TabsContent>
    </Tabs>
  );
}
