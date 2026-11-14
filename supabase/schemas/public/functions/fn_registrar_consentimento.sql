CREATE OR REPLACE FUNCTION public.fn_registrar_consentimento (
  p_finalidade   text,
  p_versao_termo text,
  p_consentiu    boolean,
  p_origem       text    DEFAULT 'aplicativo'::text
)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
    v_cliente BIGINT;
    v_id BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'É necessário estar autenticado.';
    END IF;

    IF NULLIF(trim(p_finalidade), '') IS NULL
       OR NULLIF(trim(p_versao_termo), '') IS NULL THEN
        RAISE EXCEPTION 'Informe a finalidade e a versão do termo.';
    END IF;

    IF p_origem NOT IN ('aplicativo', 'web', 'atendimento', 'administrativo') THEN
        RAISE EXCEPTION 'Origem inválida.';
    END IF;

    SELECT id INTO v_cliente
    FROM clientes
    WHERE auth_user_id = auth.uid();

    IF v_cliente IS NULL THEN
        RAISE EXCEPTION 'Perfil do cliente não encontrado.';
    END IF;

    INSERT INTO lgpd_consentimentos
        (cliente_id, finalidade, versao_termo, consentiu, origem)
    VALUES
        (v_cliente, trim(p_finalidade), trim(p_versao_termo), p_consentiu, p_origem)
    RETURNING id INTO v_id;

    -- Compatibilidade com a coluna existente, apenas para finalidade agendamento.
    IF p_finalidade = 'agendamento' THEN
        UPDATE clientes
        SET aceito_lgpd = p_consentiu
        WHERE id = v_cliente;
    END IF;

    RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."fn_registrar_consentimento"(text, text, boolean, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."fn_registrar_consentimento"(text, text, boolean, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."fn_registrar_consentimento"(text, text, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."fn_registrar_consentimento"(text, text, boolean, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."fn_registrar_consentimento"(text, text, boolean, text) FROM PUBLIC, "anon";
