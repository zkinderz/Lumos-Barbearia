CREATE OR REPLACE FUNCTION public.tf_agenda_barbeiro (
  p_barbeiro bigint,
  p_data     date   DEFAULT CURRENT_DATE
)
  RETURNS TABLE (
    horario      time without time zone,
    fim_previsto time without time zone,
    cliente      text,
    servico      text,
    status       text
  )
  LANGUAGE sql
  STABLE
  AS $function$
    SELECT
        a.horario,
        a.fim_horario,
        c.nome,
        s.nome,
        a.status
    FROM agendamentos a
    JOIN clientes c ON c.id = a.cliente_id
    JOIN servicos s ON s.id = a.servico_id
    WHERE a.barbeiro_id = p_barbeiro
      AND a.data = p_data
      AND a.status <> 'cancelado'
    ORDER BY a.horario;
$function$;

GRANT EXECUTE ON FUNCTION "public"."tf_agenda_barbeiro"(bigint, date) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."tf_agenda_barbeiro"(bigint, date) TO "service_role";

REVOKE ALL ON FUNCTION "public"."tf_agenda_barbeiro"(bigint, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tf_agenda_barbeiro"(bigint, date) TO "postgres";
