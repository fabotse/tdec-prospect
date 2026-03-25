/**
 * Company Results Table
 * Story: 15.3 - Resultados de Empresas: Tabela e Selecao
 *
 * AC: #1-#6 - Table with company info, confidence badges, selection, pagination, empty state
 */

"use client";

import { ExternalLink, Building2, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { TheirStackCompany } from "@/types/theirstack";

// ==============================================
// TYPES
// ==============================================

interface CompanyResultsTableProps {
  companies: TheirStackCompany[];
  totalResults: number;
  totalCompanies: number;
  isLoading: boolean;
  hasSearched: boolean;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  creditsUsed?: number;
  selectedDomains: string[];
  onSelectionChange: (domains: string[]) => void;
}

// ==============================================
// CONFIDENCE BADGE
// ==============================================

const confidenceConfig = {
  high: { label: "Alto", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  medium: { label: "Médio", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  low: { label: "Baixo", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
};

function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const config = confidenceConfig[confidence];
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${config.className}`}
      data-testid={`confidence-${confidence}`}
    >
      {config.label}
    </span>
  );
}

// ==============================================
// LOADING SKELETON
// ==============================================

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2" data-testid="table-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

// ==============================================
// EMPTY STATE
// ==============================================

function EmptyState({ hasSearched }: { hasSearched: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-md border bg-card py-12 text-center"
      data-testid="empty-state"
    >
      {hasSearched ? (
        <>
          <Search className="mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">
            Nenhuma empresa encontrada
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Tente ajustar as tecnologias ou filtros da busca.
          </p>
        </>
      ) : (
        <>
          <Building2 className="mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">
            Busque empresas por tecnologia
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Selecione tecnologias e clique em &ldquo;Buscar&rdquo; para
            encontrar empresas.
          </p>
        </>
      )}
    </div>
  );
}

// ==============================================
// MAIN COMPONENT
// ==============================================

export function CompanyResultsTable({
  companies,
  totalResults,
  totalCompanies,
  isLoading,
  hasSearched,
  page,
  limit,
  onPageChange,
  creditsUsed,
  selectedDomains,
  onSelectionChange,
}: CompanyResultsTableProps) {
  if (isLoading) {
    return <TableSkeleton />;
  }

  if (companies.length === 0) {
    return <EmptyState hasSearched={hasSearched} />;
  }

  const totalPages = Math.ceil(totalResults / limit);
  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  const companyDomains = new Set(companies.map((c) => c.domain));
  const selectedInPage = selectedDomains.filter((d) => companyDomains.has(d));
  const allSelected = companies.length > 0 && selectedInPage.length === companies.length;
  const someSelected = selectedInPage.length > 0 && selectedInPage.length < companies.length;

  const handleSelectAll = (checked: boolean) => {
    onSelectionChange(checked ? companies.map((c) => c.domain) : []);
  };

  const handleSelectRow = (domain: string, checked: boolean) => {
    onSelectionChange(
      checked
        ? [...selectedDomains, domain]
        : selectedDomains.filter((d) => d !== domain)
    );
  };

  return (
    <div className="flex flex-col gap-3" data-testid="company-results">
      {/* Results info */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            {totalCompanies.toLocaleString("pt-BR")} empresas encontradas
            {creditsUsed !== undefined && ` (${creditsUsed} credits consumidos)`}
          </span>
          {selectedDomains.length > 0 && (
            <>
              <span>|</span>
              <span data-testid="selection-counter">
                {selectedDomains.length} empresa{selectedDomains.length === 1 ? "" : "s"} selecionada{selectedDomains.length === 1 ? "" : "s"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-1 py-0 text-sm underline"
                onClick={() => onSelectionChange([])}
                data-testid="clear-selection"
              >
                Limpar
              </Button>
            </>
          )}
        </div>
        <span>
          Página {page + 1} de {Math.max(totalPages, 1)}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => handleSelectAll(checked === true)}
                  aria-label="Selecionar todas as empresas"
                  data-testid="select-all-checkbox"
                />
              </TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Domínio</TableHead>
              <TableHead>País</TableHead>
              <TableHead>Indústria</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Techs encontradas</TableHead>
              <TableHead className="text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.map((company) => (
              <TableRow key={company.domain}>
                <TableCell>
                  <Checkbox
                    checked={selectedDomains.includes(company.domain)}
                    onCheckedChange={(checked) => handleSelectRow(company.domain, checked === true)}
                    aria-label={`Selecionar ${company.name}`}
                    data-testid={`select-row-${company.domain}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    {company.name}
                    {company.url && /^https?:\/\//i.test(company.url) && (
                      <a
                        href={company.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Visitar ${company.name}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {company.domain}
                </TableCell>
                <TableCell>{company.country ?? "-"}</TableCell>
                <TableCell>{company.industry ?? "-"}</TableCell>
                <TableCell>{company.employee_count_range ?? "-"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {company.technologies_found.map((tf) => (
                      <div
                        key={tf.technology.slug}
                        className="flex items-center gap-1"
                      >
                        <span className="text-xs">
                          {tf.technology.name}
                        </span>
                        <ConfidenceBadge confidence={tf.confidence} />
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {company.technologies_found.length > 0
                    ? (
                      <div className="flex flex-col items-end gap-0.5">
                        {company.technologies_found.map((tf) => (
                          <span key={tf.technology.slug}>
                            {tf.theirstack_score.toFixed(2)}
                          </span>
                        ))}
                      </div>
                    )
                    : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrevPage}
            onClick={() => onPageChange(page - 1)}
            data-testid="prev-page"
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNextPage}
            onClick={() => onPageChange(page + 1)}
            data-testid="next-page"
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
