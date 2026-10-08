-- =============================================================================
-- 24 · Tipos dos eventos
-- =============================================================================
-- Num arquivo só deles, como nas migrations 16 e 22: um valor novo de enum não
-- pode ser usado na mesma transação em que foi criado.
-- =============================================================================

alter type public.moderation_action_type add value if not exists 'ocultar_evento';

alter type public.notification_type add value if not exists 'evento_pedido';
alter type public.notification_type add value if not exists 'evento_aceito';
alter type public.notification_type add value if not exists 'evento_alterado';
alter type public.notification_type add value if not exists 'evento_cancelado';
alter type public.notification_type add value if not exists 'evento_lembrete';

create type public.event_modality as enum ('presencial', 'online');
-- aberto: confirmar basta. aprovacao: a pessoa pede e quem organiza decide.
create type public.event_kind as enum ('aberto', 'aprovacao');
create type public.event_participation as enum ('pendente', 'confirmado', 'recusado');
