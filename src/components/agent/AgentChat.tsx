"use client";

import { AgentMessageList } from "./AgentMessageList";
import { AgentInput } from "./AgentInput";

export function AgentChat() {
  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="agent-chat">
      <AgentMessageList />
      <AgentInput />
    </div>
  );
}
