-- Enable Supabase Realtime for agent_messages table
-- Required for postgres_changes subscriptions in Story 16.2
-- Story 16.2: Sistema de Mensagens do Chat

ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages;
