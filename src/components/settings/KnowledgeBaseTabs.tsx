"use client";

/**
 * Knowledge Base Sub-Tabs
 * Story: 2.4, 2.5, 2.6 - Knowledge Base Editor
 *
 * AC: #1 - Sections: Empresa, Tom de Voz, Exemplos, ICP
 * Story 2.4: Empresa section
 * Story 2.5: Tom de Voz, Exemplos sections
 * Story 2.6: ICP section
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompanyProfileForm } from "./CompanyProfileForm";
import { ToneOfVoiceForm } from "./ToneOfVoiceForm";
import { EmailExamplesForm } from "./EmailExamplesForm";
import { ICPDefinitionForm } from "./ICPDefinitionForm";

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
        <Card className="bg-background-secondary border-border">
          <CardHeader>
            <CardTitle className="text-h3">Tom de Voz</CardTitle>
            <CardDescription className="text-body-small text-foreground-muted">
              Configure o estilo e tom de comunicação da sua empresa para os emails gerados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ToneOfVoiceForm />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="examples" className="mt-4">
        <Card className="bg-background-secondary border-border">
          <CardHeader>
            <CardTitle className="text-h3">Exemplos de Email</CardTitle>
            <CardDescription className="text-body-small text-foreground-muted">
              Adicione exemplos de emails bem-sucedidos para a IA aprender o seu estilo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmailExamplesForm />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="icp" className="mt-4">
        <Card className="bg-background-secondary border-border">
          <CardHeader>
            <CardTitle className="text-h3">ICP (Ideal Customer Profile)</CardTitle>
            <CardDescription className="text-body-small text-foreground-muted">
              Defina o perfil do seu cliente ideal para personalização de conteúdo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ICPDefinitionForm />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
