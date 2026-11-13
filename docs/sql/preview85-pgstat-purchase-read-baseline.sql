-- Preview #85 — diagnóstico READ ONLY de consultas PostgREST nas quatro relações de Compras.
-- Requer extensão pg_stat_statements e autorização administrativa para a visão.
-- Sem EXECUTE de funções de negócio, EXPLAIN ANALYZE, alterações de RLS ou dados.
-- As métricas são ACUMULADAS desde o último reset de estatísticas, não representam
-- uma janela de tempo nem uma versão específica do frontend. Capturar snapshots
-- antes/depois do release e avaliar deltas por queryid, após validar resets.
-- DEV e PROD têm massa diferente; suas médias não comprovam paridade de desempenho.
WITH target_queries AS (
  SELECT CASE
    WHEN query ILIKE '%"public"."supply_purchase_attachment_stores"%' THEN 'supply_purchase_attachment_stores'
    WHEN query ILIKE '%"public"."supply_purchase_attachments"%' THEN 'supply_purchase_attachments'
    WHEN query ILIKE '%"public"."supply_purchase_destinations"%' THEN 'supply_purchase_destinations'
    WHEN query ILIKE '%"public"."supply_purchase_items"%' THEN 'supply_purchase_items'
  END AS table_name,
  calls, total_exec_time, max_exec_time, queryid
  FROM pg_stat_statements
  WHERE query LIKE 'WITH pgrst_source AS (%'
    AND (
      query ILIKE '%"public"."supply_purchase_attachment_stores"%'
      OR query ILIKE '%"public"."supply_purchase_attachments"%'
      OR query ILIKE '%"public"."supply_purchase_destinations"%'
      OR query ILIKE '%"public"."supply_purchase_items"%'
    )
)
SELECT table_name,
       count(*) AS statement_patterns,
       sum(calls) AS total_calls,
       round(sum(total_exec_time)::numeric / nullif(sum(calls), 0), 2) AS weighted_mean_ms,
       round(max(max_exec_time)::numeric, 1) AS worst_ms,
       round(sum(total_exec_time)::numeric, 1) AS cumulative_ms
FROM target_queries
GROUP BY table_name
ORDER BY cumulative_ms DESC;
