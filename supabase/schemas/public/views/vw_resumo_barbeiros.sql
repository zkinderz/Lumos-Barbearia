CREATE VIEW "public"."vw_resumo_barbeiros" WITH (security_invoker=true) AS  SELECT id,
    nome,
    ( SELECT count(*) AS count
           FROM public.agendamentos a
          WHERE ((a.barbeiro_id = b.id) AND (a.status <> 'cancelado'::text))) AS total_agendamentos,
    ( SELECT count(*) AS count
           FROM public.agendamentos a
          WHERE ((a.barbeiro_id = b.id) AND (a.status = 'confirmado'::text))) AS confirmados,
    ( SELECT COALESCE(sum(s.preco), (0)::numeric) AS "coalesce"
           FROM (public.agendamentos a
             JOIN public.servicos s ON ((s.id = a.servico_id)))
          WHERE ((a.barbeiro_id = b.id) AND (a.status = 'concluido'::text))) AS faturamento
   FROM public.barbeiros b;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vw_resumo_barbeiros" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vw_resumo_barbeiros" TO "service_role";

REVOKE ALL ON TABLE "public"."vw_resumo_barbeiros" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vw_resumo_barbeiros" TO "postgres";
