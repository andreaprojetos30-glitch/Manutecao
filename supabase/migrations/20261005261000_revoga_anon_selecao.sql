-- A inclusão em lote fica só para quem está autenticado.
-- A função continua exigindo perfil ADM.

revoke all on function public.adicionar_equipamentos_contrato(uuid, jsonb) from public, anon;
revoke all on function public.definir_identificacao_equipamento(uuid, text) from public, anon;
grant execute on function public.adicionar_equipamentos_contrato(uuid, jsonb) to authenticated;
grant execute on function public.definir_identificacao_equipamento(uuid, text) to authenticated;
