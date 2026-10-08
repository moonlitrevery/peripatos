-- =============================================================================
-- 22 · Tipos dos cargos
-- =============================================================================
-- Num arquivo só deles, como na migration 16: um valor novo de enum não pode
-- ser usado na mesma transação em que foi criado.
-- =============================================================================

alter type public.moderation_action_type add value if not exists 'alterar_configuracao';
alter type public.notification_type add value if not exists 'cargo_concedido';
