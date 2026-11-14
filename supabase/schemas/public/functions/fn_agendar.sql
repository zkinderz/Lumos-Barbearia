CREATE OR REPLACE FUNCTION public.fn_agendar (
  p_cliente  bigint,
  p_barbeiro bigint,
  p_servico  bigint,
  p_data     date,
  p_horario  time without time zone
)
  RETURNS bigint
  LANGUAGE plpgsql
  AS $function$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO agendamentos (
        cliente_id,
        barbeiro_id,
        servico_id,
        data,
        horario,
        status
    )
    VALUES (
        p_cliente,
        p_barbeiro,
        p_servico,
        p_data,
        p_horario,
        'pendente'
    )
    RETURNING id INTO v_id;

    RETURN v_id;

EXCEPTION
    WHEN exclusion_violation THEN
        RAISE EXCEPTION
            'Horário indisponível: o barbeiro já possui atendimento nesse período.';

    WHEN unique_violation THEN
        RAISE EXCEPTION
            'Esse registro já existe.';

    WHEN foreign_key_violation THEN
        RAISE EXCEPTION
            'Cliente, barbeiro ou serviço inexistente.';
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."fn_agendar"(bigint, bigint, bigint, date, time WITHOUT time zone) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."fn_agendar"(bigint, bigint, bigint, date, time WITHOUT time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."fn_agendar"(bigint, bigint, bigint, date, time WITHOUT time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."fn_agendar"(bigint, bigint, bigint, date, time WITHOUT time zone) TO "postgres";
