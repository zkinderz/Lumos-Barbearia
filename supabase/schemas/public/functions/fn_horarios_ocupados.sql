CREATE OR REPLACE FUNCTION public.fn_horarios_ocupados (
  p_barbeiro bigint,
  p_data     date
)
  RETURNS TABLE (
    inicio time without time zone,
    fim    time without time zone
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
    SELECT a.horario, a.fim_horario
    FROM agendamentos a
    WHERE a.barbeiro_id = p_barbeiro
      AND a.data = p_data
      AND a.status <> 'cancelado'
    ORDER BY a.horario;
$function$;

GRANT EXECUTE ON FUNCTION "public"."fn_horarios_ocupados"(bigint, date) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."fn_horarios_ocupados"(bigint, date) TO "service_role";

REVOKE ALL ON FUNCTION "public"."fn_horarios_ocupados"(bigint, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."fn_horarios_ocupados"(bigint, date) TO "postgres";

REVOKE ALL ON FUNCTION "public"."fn_horarios_ocupados"(bigint, date) FROM PUBLIC, "anon";
