-- =============================================================================
-- 19 · Minotauro: fechado até a resposta de verdade ser definida
-- =============================================================================
-- O enigma ainda não foi escrito. Em vez de deixar o banco sem hash, guardamos
-- o hash de uma resposta aleatória de 256 bits, gerada aqui dentro e
-- descartada na mesma instrução: ela não é gravada em lugar nenhum, não
-- passa por nenhuma pessoa nem por nenhum arquivo, e não dá para adivinhar.
-- Até a resposta ser trocada, a conquista é impossível.
--
-- Para definir a resposta de verdade: docs/conquistas.md
--   select private.definir_resposta_do_enigma('...');
--
-- Só grava se ainda não houver hash: reaplicar esta migration (ou aplicá-la
-- num banco em que a resposta de verdade já foi definida) não desfaz nada.
do $$
begin
  if not exists (select 1 from private.config c where c.chave = 'enigma_hash') then
    perform private.definir_resposta_do_enigma(encode(extensions.gen_random_bytes(32), 'hex'));
  end if;
end
$$;
