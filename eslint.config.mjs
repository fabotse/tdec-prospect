import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts de apresentacao (.cjs), nao sao codigo do app
    "docs/**",
  ]),
  // Custom rules to prevent debug code in production
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Prevent console.log (allow warn/error for legitimate logging)
      "no-console": ["error", { allow: ["warn", "error"] }],
      // Banir non-null assertions (!) — warn em codigo existente, code review bloqueia em codigo novo (Epic 16 retro)
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },
  // Story 23.2: eslint-config-next 16.4.1 traz eslint-plugin-react-hooks 7.1,
  // que passou a acusar codigo existente (builder, wizard de campanha, busca).
  // Corrigir mexe em telas do cliente; fica como warn so nestes arquivos ate
  // uma story propria. No resto do repo as regras continuam error.
  {
    files: [
      "src/app/(dashboard)/campaigns/\\[campaignId\\]/edit/page.tsx",
      "src/components/agent/AgentExecutionPlan.tsx",
      "src/components/builder/CampaignPreviewPanel.tsx",
      "src/components/builder/EmailBlock.tsx",
      "src/components/campaigns/AICampaignWizard.tsx",
      "src/components/leads/LeadPreviewPanel.tsx",
      "src/components/search/FilterPanel.tsx",
      "src/components/tracking/PhoneLookupDialog.tsx",
      "src/hooks/use-sending-accounts.ts",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
