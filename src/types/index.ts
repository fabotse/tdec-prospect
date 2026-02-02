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
export * from "./saved-filter";
export * from "./segment";
export * from "./interaction";
export * from "./signalhire";
export * from "./campaign";
export * from "./email-block";
// Note: team.ts exports UserRole which conflicts with database.ts
// Import directly from "./team" when needed
