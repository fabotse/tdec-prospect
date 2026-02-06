// Base entity types will be defined here as the project grows
// Following the naming convention: PascalCase for types

// Re-export all types
export * from "./api";
export * from "./database";
export * from "./integration";
export * from "./knowledge-base";
export * from "./lead";
export * from "./apollo";
export * from "./ai-search";
export * from "./ai-provider";
export * from "./ai-prompt";
export * from "./saved-filter";
export * from "./segment";
export * from "./interaction";
export * from "./signalhire";
export * from "./campaign";
export * from "./email-block";
export * from "./delay-block";
export * from "./campaign-template";
export * from "./apify";
export * from "./api-usage";
export * from "./export";
// Note: team.ts exports UserRole which conflicts with database.ts
// Import directly from "./team" when needed
