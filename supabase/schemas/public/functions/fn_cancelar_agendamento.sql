CREATE OR REPLACE FUNCTION public.fn_cancelar_agendamento (
  p_agendamento bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
    UPDATE agendamentos a
    SET status = 'cancelado'
    WHERE a.id = p_agendamento
      AND a.status IN ('pendente', 'confirmado')
      AND EXISTS (
          SELECT 1
          FROM clientes c
          WHERE c.id = a.cliente_id
            AND c.auth_user_id = auth.uid()
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Agendamento não encontrado ou não pode ser cancelado.';
    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."fn_cancelar_agendamento"(bigint) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."fn_cancelar_agendamento"(bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."fn_cancelar_agendamento"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."fn_cancelar_agendamento"(bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."fn_cancelar_agendamento"(bigint) FROM PUBLIC, "anon";
