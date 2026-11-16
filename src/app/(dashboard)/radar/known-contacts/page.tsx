import { KnownContactsList } from "@/components/radar/KnownContactsList";

/**
 * Radar → Contatos conhecidos
 * Story 25.1: pessoas com quem a TDec já tem relacionamento. Todos leem; só gestor/diretor
 * escreve (o servidor e o RLS barram o resto).
 */
export const metadata = {
  title: "Contatos conhecidos - tdec-prospect",
  description: "Clientes atuais, ex-clientes, parceiros e leads com reunião marcada",
};

export default function KnownContactsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 text-foreground">Contatos conhecidos</h1>
          <p className="text-body-small text-muted-foreground mt-1">
            Pessoas com quem a TDec já tem relacionamento: clientes atuais, ex-clientes,
            parceiros e leads com reunião marcada.
          </p>
        </div>
      </div>

      <KnownContactsList />
    </div>
  );
}
