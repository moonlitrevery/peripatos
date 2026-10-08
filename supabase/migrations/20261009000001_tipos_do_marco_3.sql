-- =============================================================================
-- 16 · Tipos do marco 3 (notificações e conquistas)
-- =============================================================================
-- Ficam num arquivo só deles: um valor novo de enum não pode ser usado na
-- mesma transação em que foi criado, e a migration seguinte usa os dois.
-- =============================================================================

alter type public.moderation_action_type add value if not exists 'conceder_conquista';

create type public.notification_type as enum (
  'novo_seguidor',
  'mutuo',
  'avatar_aprovado',
  'avatar_recusado',
  'denuncia_analisada',
  'termos_atualizados',
  'conquista'
);
