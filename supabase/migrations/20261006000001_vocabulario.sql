-- =============================================================================
-- 10 · Vocabulário: instituição do beta, allowlist de domínio e tags
-- =============================================================================
-- Antes isto vivia em seed.sql, que só roda em `supabase db reset` local. Como
-- migration, o projeto hospedado já sobe com a instituição, o domínio e as tags.
--
-- Idempotente: pode rodar sobre um banco que já tenha parte dos dados.
-- Para mudar o vocabulário depois, crie uma migration nova (nunca edite esta):
--   - tag nova:      insert ... on conflict (slug) do nothing
--   - renomear:      update public.tags set name = ... where slug = ...
--   - is_sensitive:  o banco recusa mudar em tag que já está em uso
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
  -- jogos
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

  -- rpg
  ('rpg', 'rpg-de-mesa', 'RPG de mesa', false),
  ('rpg', 'ordem-paranormal', 'Ordem Paranormal', false),

  -- anime e mangá
  ('anime-e-manga', 'anime', 'Anime', false),
  ('anime-e-manga', 'manga', 'Mangá', false),
  ('anime-e-manga', 'novel', 'Novels', false),
  ('anime-e-manga', 'manhwa', 'Manhwa', false),
  ('anime-e-manga', 'cosplay', 'Cosplay', false),

  -- música
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

  -- cinema e séries
  ('cinema-e-series', 'cinema', 'Cinema', false),
  ('cinema-e-series', 'series', 'Séries', false),
  ('cinema-e-series', 'terror', 'Terror', false),
  ('cinema-e-series', 'ficcao-cientifica', 'Ficção científica', false),
  ('cinema-e-series', 'documentarios', 'Documentários', false),
  ('cinema-e-series', 'doramas', 'Doramas', false),

  -- livros
  ('livros', 'fantasia', 'Fantasia', false),
  ('livros', 'literatura-brasileira', 'Literatura brasileira', false),
  ('livros', 'classicos', 'Clássicos', false),
  ('livros', 'poesia', 'Poesia', false),
  ('livros', 'quadrinhos', 'Quadrinhos e HQs', false),
  ('livros', 'escrita-criativa', 'Escrita criativa', false),

  -- cursos
  ('cursos', 'administracao', 'Administração', false),
  ('cursos', 'arquitetura-e-urbanismo', 'Arquitetura e Urbanismo', false),
  ('cursos', 'artes', 'Artes', false),
  ('cursos', 'biomedicina', 'Biomedicina', false),
  ('cursos', 'ciencia-da-computacao', 'Ciência da Computação', false),
  ('cursos', 'ciencias-biologicas', 'Ciências Biológicas', false),
  ('cursos', 'ciencias-contabeis', 'Ciências Contábeis', false),
  ('cursos', 'design', 'Design', false),
  ('cursos', 'design-de-moda', 'Design de Moda', false),
  ('cursos', 'educacao-fisica', 'Educação Física', false),
  ('cursos', 'enfermagem', 'Enfermagem', false),
  ('cursos', 'engenharias', 'Engenharias', false),
  ('cursos', 'estetica-e-cosmetica', 'Estética e Cosmética', false),
  ('cursos', 'farmacia', 'Farmácia', false),
  ('cursos', 'fisioterapia', 'Fisioterapia', false),
  ('cursos', 'gastronomia', 'Gastronomia', false),
  ('cursos', 'historia', 'História', false),
  ('cursos', 'jornalismo-e-publicidade', 'Jornalismo e Publicidade', false),
  ('cursos', 'letras', 'Letras', false),
  ('cursos', 'nutricao', 'Nutrição', false),
  ('cursos', 'odontologia', 'Odontologia', false),
  ('cursos', 'pedagogia-e-licenciaturas', 'Pedagogia e licenciaturas', false),
  ('cursos', 'psicologia', 'Psicologia', false),
  ('cursos', 'relacoes-internacionais', 'Relações Internacionais', false),
  ('cursos', 'curso-teatro', 'Teatro', false),

  -- esportes
  ('esportes', 'futebol', 'Futebol', false),
  ('esportes', 'volei', 'Vôlei', false),
  ('esportes', 'basquete', 'Basquete', false),
  ('esportes', 'musculacao', 'Musculação', false),
  ('esportes', 'corrida', 'Corrida', false),
  ('esportes', 'artes-marciais', 'Artes marciais', false),
  ('esportes', 'skate', 'Skate', false),

  -- filosofia e ideias
  ('filosofia', 'filosofia-antiga', 'Filosofia antiga', false),
  ('filosofia', 'estoicismo', 'Estoicismo', false),
  ('filosofia', 'existencialismo', 'Existencialismo', false),
  ('filosofia', 'etica', 'Ética', false),
  ('filosofia', 'filosofia-da-mente', 'Filosofia da mente', false),
  ('filosofia', 'divulgacao-cientifica', 'Divulgação científica', false),

  -- tecnologia
  ('tecnologia', 'desenvolvimento-de-software', 'Desenvolvimento de software', false),
  ('tecnologia', 'dados', 'Engenharia/Ciência/Análise de Dados', false),
  ('tecnologia', 'gamedev', 'Gamedev', false),
  ('tecnologia', 'hardware', 'Hardware', false),
  ('tecnologia', 'redes', 'Redes', false),

  -- arte e criação
  ('arte', 'desenho-e-ilustracao', 'Desenho e ilustração', false),
  ('arte', 'fotografia', 'Fotografia', false),
  ('arte', 'teatro', 'Teatro', false),
  ('arte', 'danca', 'Dança', false),

  -- estilo de vida
  ('estilo-de-vida', 'culinaria', 'Culinária', false),
  ('estilo-de-vida', 'cafe', 'Café', false),
  ('estilo-de-vida', 'pets', 'Pets', false),
  ('estilo-de-vida', 'viagens', 'Viagens', false),
  ('estilo-de-vida', 'voluntariado', 'Voluntariado', false),

  -- SENSÍVEIS: só vão em profile_sensitive_tags, visíveis só para mutuals.

  -- orientação sexual
  ('orientacao-sexual', 'heterossexual', 'Heterossexual', true),
  ('orientacao-sexual', 'gay', 'Gay', true),
  ('orientacao-sexual', 'lesbica', 'Lésbica', true),
  ('orientacao-sexual', 'bissexual', 'Bissexual', true),
  ('orientacao-sexual', 'pansexual', 'Pansexual', true),
  ('orientacao-sexual', 'assexual', 'Assexual', true),
  ('orientacao-sexual', 'queer', 'Queer', true),

  -- identidade de gênero
  ('identidade-de-genero', 'mulher-cis', 'Mulher cis', true),
  ('identidade-de-genero', 'homem-cis', 'Homem cis', true),
  ('identidade-de-genero', 'mulher-trans', 'Mulher trans', true),
  ('identidade-de-genero', 'homem-trans', 'Homem trans', true),
  ('identidade-de-genero', 'nao-binarie', 'Não binárie', true),

  -- religião
  ('religiao', 'catolicismo', 'Catolicismo', true),
  ('religiao', 'evangelico', 'Evangélico', true),
  ('religiao', 'espiritismo', 'Espiritismo', true),
  ('religiao', 'umbanda-e-candomble', 'Umbanda e Candomblé', true),
  ('religiao', 'judaismo', 'Judaísmo', true),
  ('religiao', 'islamismo', 'Islamismo', true),
  ('religiao', 'budismo', 'Budismo', true),
  ('religiao', 'ateismo-e-agnosticismo', 'Ateísmo e agnosticismo', true),
  ('religiao', 'sem-religiao', 'Sem religião', true)
on conflict (slug) do nothing;
