-- Recálculos: débitos exigíveis do SIEF lidos do PDF da Situação Fiscal.
alter table situacao_fiscal add column if not exists debitos jsonb; comment on column situacao_fiscal.debitos is 'Débitos exigíveis do SIEF lidos do PDF (módulo Recálculos)';
