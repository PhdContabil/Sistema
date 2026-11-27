-- Avaliação de experiência: campo livre (opcional) para o encarregado escrever o que desejar.
alter table public.avaliacoes_experiencia add column if not exists observacoes text;
