CREATE OR REPLACE FUNCTION public.trg_fn_valida_agendamento()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
DECLARE
    v_duracao  INTEGER;
    -- O Supabase roda em UTC; as regras de horário valem para Brasília.
    v_agora    TIMESTAMP := NOW() AT TIME ZONE 'America/Sao_Paulo';
    v_remarcou BOOLEAN;
BEGIN
    -- As regras de horário só valem ao CRIAR ou REMARCAR
    -- Mudar apenas o status (concluir, cancelar, confirmar) não pode ser barrado por "estar no passado"
    v_remarcou := TG_OP = 'INSERT'
        OR NEW.barbeiro_id IS DISTINCT FROM OLD.barbeiro_id
        OR NEW.servico_id  IS DISTINCT FROM OLD.servico_id
        OR NEW.data        IS DISTINCT FROM OLD.data
        OR NEW.horario     IS DISTINCT FROM OLD.horario;

    IF v_remarcou THEN
        -- Busca a duração do serviço escolhido.
        SELECT duracao
        INTO v_duracao
        FROM servicos
        WHERE id = NEW.servico_id;

        IF v_duracao IS NULL THEN
            RAISE EXCEPTION 'Serviço inexistente.';
        END IF;

        -- Calcula o término do atendimento
        NEW.fim_horario :=
            (NEW.horario + v_duracao * INTERVAL '1 minute')::TIME;

        -- Horário comercial: começa após 08:00 e termina até 20:00
        IF NEW.horario < TIME '08:00'
           OR NEW.fim_horario > TIME '20:00'
           OR NEW.fim_horario <= NEW.horario THEN

            RAISE EXCEPTION
                'O atendimento deve começar após 08:00 e terminar até 20:00.';
        END IF;

        -- Impede agendamento em data/horário passado (horário de Brasília)
        IF (NEW.data + NEW.horario) <= v_agora THEN
            RAISE EXCEPTION
                'Não é possível agendar no passado.';
        END IF;

        -- Verifica se o barbeiro oferece o serviço
        IF NOT EXISTS (
            SELECT 1
            FROM barbeiro_servicos
            WHERE barbeiro_id = NEW.barbeiro_id
              AND servico_id = NEW.servico_id
        ) THEN

            RAISE EXCEPTION
                'Este barbeiro não realiza este serviço.';
        END IF;
    END IF;

    -- Mantém o campo antigo compatível com o novo status
    NEW.confirmado :=
        NEW.status IN ('confirmado', 'concluido');

    RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."trg_fn_valida_agendamento"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."trg_fn_valida_agendamento"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_fn_valida_agendamento"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_fn_valida_agendamento"() TO "postgres";
