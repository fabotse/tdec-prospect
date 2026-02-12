# Story 12.4: Suporte a Importação Excel (.xlsx)

Status: done

## Story

As a usuário do sistema,
I want importar leads a partir de arquivos Excel (.xlsx),
so that possa usar planilhas nativas do Excel para importar contatos, sem precisar converter manualmente para CSV.

## Acceptance Criteria

1. **AC #1 - Upload de arquivo .xlsx**: O dialog de importação deve aceitar arquivos `.xlsx` além de `.csv`. O dropzone e o file input devem aceitar ambos os formatos. A mensagem do dropzone deve indicar "CSV ou Excel".

2. **AC #2 - Parsing de .xlsx para headers + rows**: Ao fazer upload de um arquivo `.xlsx`, o sistema deve extrair headers (primeira linha) e rows (linhas subsequentes) da **primeira planilha** do workbook, produzindo a mesma estrutura `ParsedCSVData` usada pelo CSV parser.

3. **AC #3 - Auto-detecção de colunas funciona com .xlsx**: Após parsing do `.xlsx`, a função `detectLeadColumnMappings()` existente deve funcionar normalmente (recebe headers string[] — agnóstico à origem).

4. **AC #4 - Fluxo completo pós-parse idêntico ao CSV**: Após o parsing, todo o fluxo (mapping → segment → processing → summary → enrichment) deve funcionar exatamente como para CSV, sem nenhuma mudança.

5. **AC #5 - Validação de arquivo**: Validar extensão `.xlsx` e MIME type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Rejeitar outros formatos de Excel antigos (`.xls`) com mensagem clara: "Apenas arquivos .csv ou .xlsx são aceitos".

6. **AC #6 - Limite de tamanho**: Manter o mesmo limite de 5MB (`MAX_FILE_SIZE_BYTES`) para arquivos `.xlsx`.

7. **AC #7 - Tratamento de planilha vazia**: Se a planilha não tiver dados (apenas header ou nenhuma linha), exibir erro equivalente ao CSV: "Nenhuma linha de dados encontrada".

8. **AC #8 - Testes unitários**: Cobertura completa: parser xlsx, integração no dialog (upload .xlsx, validação, parsing), rejeição de formatos inválidos.

## Tasks / Subtasks

- [x] Task 1 — Instalar dependência SheetJS (AC: #2)
  - [x] 1.1 Executar `npm install xlsx` para adicionar SheetJS Community Edition
  - [x] 1.2 Verificar que o build (`npm run build`) continua passando

- [x] Task 2 — Criar xlsx-parser utility (AC: #2, #7)
  - [x] 2.1 Criar `src/lib/utils/xlsx-parser.ts` com função `parseXlsxData(buffer: ArrayBuffer): ParsedCSVData`
  - [x] 2.2 Usar `XLSX.read(buffer, { type: "array" })` para ler o workbook
  - [x] 2.3 Extrair primeira planilha: `wb.Sheets[wb.SheetNames[0]]`
  - [x] 2.4 Converter para array 2D: `XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" })`
  - [x] 2.5 Separar primeira linha como headers, restante como rows
  - [x] 2.6 Retornar `ParsedCSVData` (mesma interface do csv-parser)
  - [x] 2.7 Testes unitários do parser (workbook válido, planilha vazia, apenas headers)

- [x] Task 3 — Adaptar ImportLeadsDialog para aceitar .xlsx (AC: #1, #5, #6)
  - [x] 3.1 Adicionar MIME type xlsx a `ALLOWED_MIME_TYPES`: `"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`
  - [x] 3.2 Renomear `isValidCSVFile` → `isValidImportFile` e aceitar `.xlsx` na verificação de extensão
  - [x] 3.3 Alterar `<input accept=".csv">` para `accept=".csv,.xlsx"`
  - [x] 3.4 Em `processFile`: detectar extensão e chamar parser correto:
    - `.csv` → `FileReader.readAsText()` → `parseCSVData(text)` (fluxo existente)
    - `.xlsx` → `FileReader.readAsArrayBuffer()` → `parseXlsxData(buffer)` (novo fluxo)
  - [x] 3.5 Atualizar mensagem do dropzone: "Clique ou arraste um arquivo CSV ou Excel"
  - [x] 3.6 Atualizar mensagem de erro de validação: "Apenas arquivos .csv ou .xlsx são aceitos"
  - [x] 3.7 Atualizar `DialogTitle`: "Importar Leads" (remover "via CSV" — agora aceita ambos)
  - [x] 3.8 Atualizar `DialogDescription`: "Importe uma lista de leads a partir de um arquivo CSV, Excel (.xlsx), TSV ou ponto-e-vírgula."
  - [x] 3.9 Testes unitários: upload de .xlsx, rejeição de .xls, validação de extensão/MIME

- [x] Task 4 — Atualizar testes existentes (AC: #8)
  - [x] 4.1 Atualizar testes do `ImportLeadsDialog.test.tsx` que verificam texto "via CSV" no título
  - [x] 4.2 Adicionar testes de upload .xlsx mockando `parseXlsxData`
  - [x] 4.3 Adicionar testes de rejeição de formatos inválidos (.xls, .txt, .pdf)

## Dev Notes

### Contexto Técnico Crítico

**INSIGHT PRINCIPAL**: Esta story estende a infraestrutura de importação CSV (story 12-2) para suportar arquivos Excel. A chave é converter o .xlsx para a mesma estrutura `ParsedCSVData` que o CSV parser produz — o restante do pipeline (mapping, segment, processing, summary, enrichment) é 100% reutilizado sem modificação.

**Ponto de interceptação**: A mudança ocorre SOMENTE na camada de input/parsing do `ImportLeadsDialog`. O `processFile()` atualmente lê o arquivo como texto e chama `parseCSVData()`. Para .xlsx, deve ler como `ArrayBuffer` e chamar `parseXlsxData()`.

### Biblioteca: SheetJS (xlsx)

**Pacote**: `xlsx` (SheetJS Community Edition)
**NPM**: https://www.npmjs.com/package/xlsx
**Docs**: https://docs.sheetjs.com/

**Por que SheetJS**:
- Biblioteca mais estabelecida para parsing de Excel em JS (browser + Node)
- Suporta leitura de .xlsx com `XLSX.read(buffer, { type: "array" })`
- Método `sheet_to_json` com `header: 1` retorna array 2D (perfeito para converter em ParsedCSVData)
- Build mini disponível para bundle menor
- Não precisamos de escrita — apenas leitura (read-only use case)

**Uso mínimo no projeto**:
```typescript
import * as XLSX from "xlsx";

export function parseXlsxData(buffer: ArrayBuffer): ParsedCSVData {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = wb.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  if (data.length === 0) return { headers: [], rows: [] };

  const headers = data[0].map((h) => String(h).trim());
  const rows = data.slice(1).map((row) =>
    row.map((cell) => String(cell).trim())
  );

  return { headers, rows };
}
```

**Opções importantes de `sheet_to_json`**:
- `header: 1` — retorna array de arrays (não objetos com chaves)
- `raw: false` — converte todos os valores para string (datas, números → string)
- `defval: ""` — células vazias viram string vazia (evita undefined)

### Adaptação do processFile — Pseudocódigo

```typescript
const processFile = useCallback(
  (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`Arquivo muito grande. Limite: ${MAX_FILE_SIZE_MB}MB`);
      return;
    }
    if (!isValidImportFile(file)) {
      setError("Apenas arquivos .csv ou .xlsx são aceitos");
      return;
    }
    setFileName(file.name);
    setError(null);

    const isExcel = file.name.toLowerCase().endsWith(".xlsx");

    if (isExcel) {
      // XLSX: ler como ArrayBuffer → parseXlsxData
      const reader = new FileReader();
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        processDataFromParsed(parseXlsxData(buffer));
      };
      reader.onerror = () => setError("Erro ao ler arquivo");
      reader.readAsArrayBuffer(file);
    } else {
      // CSV: ler como texto → parseCSVData (fluxo existente)
      const reader = new FileReader();
      reader.onload = (event) => {
        processData(event.target?.result as string);
      };
      reader.onerror = () => setError("Erro ao ler arquivo");
      reader.readAsText(file);
    }
  },
  [isValidImportFile, processData]
);
```

**Nota**: O `processData()` existente faz parse + validation + auto-detect. Para xlsx, o parse já foi feito pelo `parseXlsxData()`, então precisamos de uma função que aceite `ParsedCSVData` diretamente. Opções:
1. **Extrair a validação de `processData`** para uma nova `processDataFromParsed(data: ParsedCSVData)` que valida e avança para mapping
2. **Ou** manter `processData` como está e criar `processXlsxFile` separado

**Recomendação**: Extrair `processDataFromParsed()` (DRY — o `processData` atual faria `processDataFromParsed(parseCSVData(text))`).

```typescript
// Função extraída (aceita dados já parseados)
const processDataFromParsed = useCallback((data: ParsedCSVData) => {
  if (data.headers.length === 0) {
    setError("Nenhum dado encontrado");
    return;
  }
  if (data.rows.length === 0) {
    setError("Nenhuma linha de dados encontrada (apenas cabeçalho?)");
    return;
  }
  setParsedData(data);
  const detected = detectLeadColumnMappings(data.headers);
  setMappings(detected);
  setStep("mapping");
}, []);

// processData existente agora delega
const processData = useCallback((text: string) => {
  processDataFromParsed(parseCSVData(text));
}, [processDataFromParsed]);
```

### Infraestrutura existente a reutilizar

| O que | Arquivo | Como usar |
|---|---|---|
| CSV Parser | [csv-parser.ts](src/lib/utils/csv-parser.ts) | `ParsedCSVData` interface — reutilizar como output do xlsx parser |
| Lead Column Detection | [csv-parser.ts](src/lib/utils/csv-parser.ts) | `detectLeadColumnMappings()` — funciona com qualquer `headers: string[]` |
| Import Dialog | [ImportLeadsDialog.tsx](src/components/leads/ImportLeadsDialog.tsx) | Modificar input/processFile — pipeline pós-parse inalterado |
| Import Types | [lead-import.ts](src/types/lead-import.ts) | `ImportLeadRow`, `ImportLeadsResponse` — inalterado |
| Import Hook | [use-import-leads-csv.ts](src/hooks/use-import-leads-csv.ts) | `useImportLeadsCsv()` — inalterado (recebe ImportLeadRow[]) |
| Import API Route | [route.ts](src/app/api/leads/import-csv/route.ts) | POST `/api/leads/import-csv` — inalterado (recebe JSON) |
| File Size Constants | [campaign-import.ts](src/types/campaign-import.ts) | `MAX_FILE_SIZE_MB`, `MAX_FILE_SIZE_BYTES` — reutilizar |
| Enrichment Hook | [use-enrich-persisted-lead.ts](src/hooks/use-enrich-persisted-lead.ts) | `useBulkEnrichPersistedLeads()` — inalterado |
| Dialog Tests | [ImportLeadsDialog.test.tsx](__tests__/unit/components/leads/ImportLeadsDialog.test.tsx) | Padrão de mocks (Tabs, hooks, csv-parser) — estender com mock do xlsx-parser |

### O que NÃO fazer

- NÃO modificar a rota `/api/leads/import-csv` — ela recebe JSON (já parseado), não o arquivo raw
- NÃO modificar o hook `useImportLeadsCsv` — transparente ao formato de origem
- NÃO modificar `detectLeadColumnMappings` — funciona com qualquer headers[]
- NÃO suportar `.xls` (formato legado do Excel 97-2003) — apenas `.xlsx`
- NÃO adicionar seletor de planilha — sempre usar a primeira planilha
- NÃO fazer download de template .xlsx — manter o template CSV existente (funcional no Excel)
- NÃO renomear a rota de API de "import-csv" para "import" — breaking change desnecessária
- NÃO fazer tree-shaking manual do xlsx — o bundler do Next.js cuida disso

### Validação de arquivo atualizada

```typescript
const ALLOWED_MIME_TYPES = [
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
];

const isValidImportFile = useCallback((file: File): boolean => {
  const lowerName = file.name.toLowerCase();
  const hasValidExtension = lowerName.endsWith(".csv") || lowerName.endsWith(".xlsx");
  const hasValidMimeType = ALLOWED_MIME_TYPES.some(
    (type) => file.type === type || file.type === ""
  );
  return hasValidExtension || hasValidMimeType;
}, []);
```

### Testes a criar

| Arquivo | O que testar |
|---|---|
| `__tests__/unit/lib/utils/xlsx-parser.test.ts` | `parseXlsxData()`: workbook válido com headers + rows, planilha vazia, workbook sem planilhas, células com tipos mistos (number, date → string), células vazias retornam "" |
| `__tests__/unit/components/leads/ImportLeadsDialog.test.tsx` | Upload de .xlsx aceito, rejeição de .xls, texto do dialog atualizado, parsing via `parseXlsxData` mock, fluxo completo .xlsx → mapping → import |

**Mock do SheetJS para testes**:
```typescript
// Mock do xlsx para testes do xlsx-parser
vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}));
```

**Mock do xlsx-parser para testes do dialog**:
```typescript
// Mock do xlsx-parser para testes do ImportLeadsDialog
const mockParseXlsxData = vi.fn();
vi.mock("@/lib/utils/xlsx-parser", () => ({
  parseXlsxData: (...args: unknown[]) => mockParseXlsxData(...args),
}));
```

### Git Intelligence (Stories 12-2 e 12-3)

As stories anteriores estabeleceram:
- Dialog multi-step com tabs e steps progressivos
- Mocking de `@/components/ui/tabs` para testes (Radix UI Tabs não funciona em happy-dom)
- Mocking de csv-parser para isolar testes do dialog
- Padrão de hooks mockados: `useCreateSegment`, `useImportLeadsCsv`, `useSegments`
- Response da importação retorna `{ imported, existing, errors, leads: string[] }`
- Testes usam `setupCSVParsing()` e `goToMapping()` helpers — estender com `setupXlsxParsing()`
- A `isValidCSVFile` verifica extensão `.csv` OU MIME type — adaptar para `.csv` e `.xlsx`

### Impacto no Bundle

SheetJS adiciona ~250-300KB ao bundle (minificado). Para mitigar:
- O Next.js faz code splitting automático — o xlsx só será carregado na página que usa o ImportLeadsDialog
- O `import * as XLSX from "xlsx"` pode ser feito no `xlsx-parser.ts` que só é importado pelo dialog
- Se necessário futuramente, pode-se usar `dynamic import` para lazy-load

### Project Structure Notes

**Arquivo NOVO:**
- `src/lib/utils/xlsx-parser.ts` — Parser de .xlsx → ParsedCSVData

**Arquivos modificados:**
- `src/components/leads/ImportLeadsDialog.tsx` — Aceitar .xlsx, detectar formato, chamar parser correto

**Testes novos/modificados:**
- `__tests__/unit/lib/utils/xlsx-parser.test.ts` — Novo
- `__tests__/unit/components/leads/ImportLeadsDialog.test.tsx` — Estender com cenários .xlsx

**Arquivos NÃO modificados:**
- `src/lib/utils/csv-parser.ts` — Inalterado
- `src/types/lead-import.ts` — Inalterado
- `src/hooks/use-import-leads-csv.ts` — Inalterado
- `src/app/api/leads/import-csv/route.ts` — Inalterado
- `src/hooks/use-enrich-persisted-lead.ts` — Inalterado

### References

- [Source: src/components/leads/ImportLeadsDialog.tsx] — Dialog de importação a adaptar
- [Source: src/lib/utils/csv-parser.ts] — Interface `ParsedCSVData` e `detectLeadColumnMappings()`
- [Source: src/types/lead-import.ts] — `ImportLeadRow`, `ImportLeadsResponse`
- [Source: src/hooks/use-import-leads-csv.ts] — Hook de importação (inalterado)
- [Source: src/app/api/leads/import-csv/route.ts] — Rota de importação (inalterada)
- [Source: src/types/campaign-import.ts] — `MAX_FILE_SIZE_MB`, `MAX_FILE_SIZE_BYTES`
- [Source: _bmad-output/implementation-artifacts/12-2-importacao-leads-csv.md] — Story de referência (CSV import)
- [Source: _bmad-output/implementation-artifacts/12-3-enriquecimento-apollo-leads-importados.md] — Story anterior (enrichment)
- [SheetJS Docs: Reading Files](https://docs.sheetjs.com/docs/api/parse-options/) — API de leitura
- [SheetJS Docs: sheet_to_json](https://docs.sheetjs.com/docs/api/utilities/array/) — Conversão para array 2D
- [NPM: xlsx](https://www.npmjs.com/package/xlsx) — SheetJS Community Edition

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum issue encontrado durante implementação.

### Completion Notes List

- Task 1: SheetJS (`xlsx`) instalado via npm. Build verificado OK.
- Task 2: Criado `src/lib/utils/xlsx-parser.ts` com `parseXlsxData(buffer)` que retorna `ParsedCSVData`. 8 testes unitários cobrindo: workbook válido, sem sheets, sheet vazia, apenas headers, trim, conversão de tipos, múltiplas planilhas (usa primeira), células vazias.
- Task 3: `ImportLeadsDialog.tsx` adaptado:
  - MIME xlsx adicionado ao `ALLOWED_MIME_TYPES`
  - `isValidCSVFile` → `isValidImportFile` com suporte a `.csv` e `.xlsx`, rejeição explícita de `.xls`
  - `processFile` detecta extensão e usa `readAsArrayBuffer` + `parseXlsxData` para `.xlsx`, `readAsText` + `parseCSVData` para CSV
  - Refatorado `processDataFromParsed()` extraído de `processData()` (DRY)
  - Input accept: `.csv,.xlsx`
  - Dropzone: "CSV ou Excel"
  - DialogTitle: "Importar Leads" (removido "via CSV")
  - DialogDescription: inclui "Excel (.xlsx)"
  - Mensagem de erro: "Apenas arquivos .csv ou .xlsx são aceitos"
- Task 4: Testes atualizados:
  - `ImportLeadsDialog.test.tsx`: título atualizado, mock de xlsx-parser, 7 novos testes (.xlsx upload, .xls rejeição, .pdf rejeição, .txt comportamento, dropzone text, description text, accept attribute)
  - `MyLeadsPageContent.test.tsx`: título atualizado "Importar Leads via CSV" → "Importar Leads"
  - `xlsx-parser.test.ts`: 8 novos testes (arquivo novo)

### File List

**Novos:**
- `src/lib/utils/xlsx-parser.ts` — Parser .xlsx → ParsedCSVData
- `__tests__/unit/lib/utils/xlsx-parser.test.ts` — Testes do xlsx parser (8 testes)

**Modificados:**
- `src/components/leads/ImportLeadsDialog.tsx` — Aceitar .xlsx, routing de parser, textos atualizados
- `__tests__/unit/components/leads/ImportLeadsDialog.test.tsx` — Título atualizado, mock xlsx-parser, 7 novos testes
- `__tests__/unit/components/leads/MyLeadsPageContent.test.tsx` — Título atualizado
- `package.json` — Dependência `xlsx` adicionada
- `package-lock.json` — Lock file atualizado

## Senior Developer Review (AI)

**Reviewer:** Fabossi | **Date:** 2026-02-12 | **Model:** Claude Opus 4.6

### Issues Found: 1 High, 3 Medium, 2 Low

| # | Severity | Issue | Resolution |
|---|---|---|---|
| 1 | HIGH | Teste .xlsx não verificava parseXlsxData chamado nem transição mapping | FIXED — assertivas adicionadas + teste de fluxo completo |
| 2 | MEDIUM | Sem try/catch para .xlsx corrompido em processFile | FIXED — try/catch adicionado com mensagem amigável |
| 3 | MEDIUM | Tab label "Upload CSV" inconsistente com suporte Excel | FIXED — alterado para "Upload Arquivo" |
| 4 | MEDIUM | Teste .xlsx não assertava chamada a parseXlsxData | FIXED — merged com #1 |
| 5 | LOW | Mock xlsx-parser ausente em MyLeadsPageContent.test.tsx | NOT FIXED — acoplamento implícito, funcional |
| 6 | LOW | MIME `application/vnd.ms-excel` sem comentário explicativo | NOT FIXED — herdado de story 12.2 |

### Fixes Applied
- `ImportLeadsDialog.tsx`: try/catch para parsing .xlsx, tab label "Upload Arquivo"
- `ImportLeadsDialog.test.tsx`: teste .xlsx assertando parseXlsxData + mapping transition, novo teste para .xlsx corrompido (+2 testes)

### Test Results Post-Review
- Story tests: 59/59 passing (was 58, +1 corrupt .xlsx test)
- Full suite: 4575/4575 passing, 0 failures

### Change Log
- 2026-02-12: Code review fixes — error handling .xlsx, tab label consistency, test coverage improvements
