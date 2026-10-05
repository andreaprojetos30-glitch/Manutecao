-- A matriz na interface passou a ser só nome e ativo.
-- categoria, fabricante, modelo e observacoes ficam no banco para não
-- reescrever a migration já aplicada nem apagar dados existentes.
alter table public.equipamentos_matriz alter column categoria drop not null;
