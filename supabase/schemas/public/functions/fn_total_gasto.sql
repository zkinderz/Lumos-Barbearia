CREATE OR REPLACE FUNCTION public.fn_total_gasto (
  p_cliente bigint
)
  RETURNS numeric
  LANGUAGE sql
  STABLE
  AS $function$
    SELECT COALESCE(SUM(s.preco), 0)
    FROM agendamentos a
    JOIN servicos s ON s.id = a.servico_id
    WHERE a.cliente_id = p_cliente
      AND a.status = 'concluido';
$function$;

GRANT EXECUTE ON FUNCTION "public"."fn_total_gasto"(bigint) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."fn_total_gasto"(bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."fn_total_gasto"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."fn_total_gasto"(bigint) TO "postgres";
