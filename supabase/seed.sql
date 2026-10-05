-- =============================================================================
-- Seed · instituição do beta, allowlist de domínio e vocabulário de tags
-- =============================================================================
-- Roda em `supabase db reset` (local). Idempotente.
-- A lista de tags é uma PROPOSTA para revisão: edite à vontade antes do beta.
-- =============================================================================

insert into public.institutions (name, slug)
values ('UNISAGRADO', 'unisagrado')
on conflict (slug) do nothing;

insert into private.institution_domains (domain, institution_id)
select 'alunos.unisagrado.edu.br', i.id
from public.institutions i
where i.slug = 'unisagrado'
on conflict (domain) do nothing;

insert into public.tags (category, slug, name, is_sensitive)
values
  -- jogos (10)
  ('jogos', 'fps', 'FPS', false),
  ('jogos', 'moba', 'MOBA', false),
  ('jogos', 'jogos-de-luta', 'Jogos de luta', false),
  ('jogos', 'jogos-indie', 'Jogos indie', false),
  ('jogos', 'jrpg', 'JRPG', false),
  ('jogos', 'soulslike', 'Soulslike', false),
  ('jogos', 'minecraft', 'Minecraft', false),
  ('jogos', 'nintendo', 'Nintendo', false),
  ('jogos', 'jogos-de-tabuleiro', 'Jogos de tabuleiro', false),
  ('jogos', 'card-games', 'Card games (Magic, Pokémon TCG, Yu-Gi-Oh!)', false),

  -- rpg (6)
  ('rpg', 'rpg-de-mesa', 'RPG de mesa', false),
  ('rpg', 'dungeons-and-dragons', 'Dungeons & Dragons', false),
  ('rpg', 'ordem-paranormal', 'Ordem Paranormal', false),
  ('rpg', 'tormenta', 'Tormenta', false),
  ('rpg', 'call-of-cthulhu', 'Call of Cthulhu', false),
  ('rpg', 'mestre-de-rpg', 'Mestre de RPG', false),

  -- anime e mangá (7)
  ('anime-e-manga', 'anime', 'Anime', false),
  ('anime-e-manga', 'manga', 'Mangá', false),
  ('anime-e-manga', 'shonen', 'Shonen', false),
  ('anime-e-manga', 'seinen', 'Seinen', false),
  ('anime-e-manga', 'slice-of-life', 'Slice of life', false),
  ('anime-e-manga', 'studio-ghibli', 'Studio Ghibli', false),
  ('anime-e-manga', 'cosplay', 'Cosplay', false),

  -- música (10)
  ('musica', 'rock', 'Rock', false),
  ('musica', 'metal', 'Metal', false),
  ('musica', 'mpb', 'MPB', false),
  ('musica', 'sertanejo', 'Sertanejo', false),
  ('musica', 'rap-e-trap', 'Rap e trap', false),
  ('musica', 'funk', 'Funk', false),
  ('musica', 'pop', 'Pop', false),
  ('musica', 'k-pop', 'K-pop', false),
  ('musica', 'musica-eletronica', 'Música eletrônica', false),
  ('musica', 'toco-instrumento', 'Toco um instrumento', false),

  -- cinema e séries (6)
  ('cinema-e-series', 'cinema', 'Cinema', false),
  ('cinema-e-series', 'series', 'Séries', false),
  ('cinema-e-series', 'terror', 'Terror', false),
  ('cinema-e-series', 'ficcao-cientifica', 'Ficção científica', false),
  ('cinema-e-series', 'documentarios', 'Documentários', false),
  ('cinema-e-series', 'doramas', 'Doramas', false),

  -- livros (6)
  ('livros', 'fantasia', 'Fantasia', false),
  ('livros', 'literatura-brasileira', 'Literatura brasileira', false),
  ('livros', 'classicos', 'Clássicos', false),
  ('livros', 'poesia', 'Poesia', false),
  ('livros', 'quadrinhos', 'Quadrinhos e HQs', false),
  ('livros', 'escrita-criativa', 'Escrita criativa', false),

  -- cursos (10)
  ('cursos', 'ciencia-da-computacao', 'Ciência da Computação', false),
  ('cursos', 'engenharias', 'Engenharias', false),
  ('cursos', 'psicologia', 'Psicologia', false),
  ('cursos', 'direito', 'Direito', false),
  ('cursos', 'enfermagem', 'Enfermagem', false),
  ('cursos', 'odontologia', 'Odontologia', false),
  ('cursos', 'arquitetura-e-urbanismo', 'Arquitetura e Urbanismo', false),
  ('cursos', 'design', 'Design', false),
  ('cursos', 'jornalismo-e-publicidade', 'Jornalismo e Publicidade', false),
  ('cursos', 'pedagogia-e-licenciaturas', 'Pedagogia e licenciaturas', false),

  -- esportes (8)
  ('esportes', 'futebol', 'Futebol', false),
  ('esportes', 'volei', 'Vôlei', false),
  ('esportes', 'basquete', 'Basquete', false),
  ('esportes', 'musculacao', 'Musculação', false),
  ('esportes', 'corrida', 'Corrida', false),
  ('esportes', 'artes-marciais', 'Artes marciais', false),
  ('esportes', 'skate', 'Skate', false),
  ('esportes', 'e-sports', 'E-sports', false),

  -- filosofia e ideias (6)
  ('filosofia', 'filosofia-antiga', 'Filosofia antiga', false),
  ('filosofia', 'estoicismo', 'Estoicismo', false),
  ('filosofia', 'existencialismo', 'Existencialismo', false),
  ('filosofia', 'etica', 'Ética', false),
  ('filosofia', 'filosofia-da-mente', 'Filosofia da mente', false),
  ('filosofia', 'divulgacao-cientifica', 'Divulgação científica', false),

  -- tecnologia (5)
  ('tecnologia', 'programacao', 'Programação', false),
  ('tecnologia', 'inteligencia-artificial', 'Inteligência artificial', false),
  ('tecnologia', 'desenvolvimento-de-jogos', 'Desenvolvimento de jogos', false),
  ('tecnologia', 'linux', 'Linux', false),
  ('tecnologia', 'hardware-e-pc-gamer', 'Hardware e PC gamer', false),

  -- arte e criação (4)
  ('arte', 'desenho-e-ilustracao', 'Desenho e ilustração', false),
  ('arte', 'fotografia', 'Fotografia', false),
  ('arte', 'teatro', 'Teatro', false),
  ('arte', 'danca', 'Dança', false),

  -- estilo de vida (5)
  ('estilo-de-vida', 'culinaria', 'Culinária', false),
  ('estilo-de-vida', 'cafe', 'Café', false),
  ('estilo-de-vida', 'pets', 'Pets', false),
  ('estilo-de-vida', 'viagens', 'Viagens', false),
  ('estilo-de-vida', 'voluntariado', 'Voluntariado', false),

  -- SENSÍVEIS: só vão em profile_sensitive_tags, visíveis só para mutuals.

  -- orientação sexual (6)
  ('orientacao-sexual', 'heterossexual', 'Heterossexual', true),
  ('orientacao-sexual', 'gay', 'Gay', true),
  ('orientacao-sexual', 'lesbica', 'Lésbica', true),
  ('orientacao-sexual', 'bissexual', 'Bissexual', true),
  ('orientacao-sexual', 'pansexual', 'Pansexual', true),
  ('orientacao-sexual', 'assexual', 'Assexual', true),

  -- identidade de gênero (5)
  ('identidade-de-genero', 'mulher-cis', 'Mulher cis', true),
  ('identidade-de-genero', 'homem-cis', 'Homem cis', true),
  ('identidade-de-genero', 'mulher-trans', 'Mulher trans', true),
  ('identidade-de-genero', 'homem-trans', 'Homem trans', true),
  ('identidade-de-genero', 'nao-binarie', 'Não binárie', true),

  -- religião (8)
  ('religiao', 'catolicismo', 'Catolicismo', true),
  ('religiao', 'evangelico', 'Evangélico', true),
  ('religiao', 'espiritismo', 'Espiritismo', true),
  ('religiao', 'umbanda-e-candomble', 'Umbanda e Candomblé', true),
  ('religiao', 'judaismo', 'Judaísmo', true),
  ('religiao', 'islamismo', 'Islamismo', true),
  ('religiao', 'budismo', 'Budismo', true),
  ('religiao', 'ateismo-e-agnosticismo', 'Ateísmo e agnosticismo', true),

  -- posição política (5)
  ('posicao-politica', 'esquerda', 'Esquerda', true),
  ('posicao-politica', 'centro-esquerda', 'Centro-esquerda', true),
  ('posicao-politica', 'centro', 'Centro', true),
  ('posicao-politica', 'centro-direita', 'Centro-direita', true),
  ('posicao-politica', 'direita', 'Direita', true)
on conflict (slug) do nothing;
