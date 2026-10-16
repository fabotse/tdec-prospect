import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // next dev (16.4+) adds a "nextjs-agent-rules" block to AGENTS.md, leaving
  // the tree dirty (bmad-loop preflight). The project rules live in CLAUDE.md.
  agentRules: false,
};

export default nextConfig;
