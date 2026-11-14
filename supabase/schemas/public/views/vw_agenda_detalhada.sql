CREATE VIEW "public"."vw_agenda_detalhada" WITH (security_invoker=true) AS  SELECT a.id,
    a.data,
    a.horario,
    a.fim_horario AS fim_previsto,
    a.status,
    a.confirmado,
    c.nome AS cliente,
    c.telefone AS telefone_cliente,
    b.nome AS barbeiro,
    s.nome AS servico,
    s.preco
   FROM (((public.agendamentos a
     JOIN public.clientes c ON ((c.id = a.cliente_id)))
     JOIN public.barbeiros b ON ((b.id = a.barbeiro_id)))
     JOIN public.servicos s ON ((s.id = a.servico_id)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vw_agenda_detalhada" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vw_agenda_detalhada" TO "service_role";

REVOKE ALL ON TABLE "public"."vw_agenda_detalhada" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vw_agenda_detalhada" TO "postgres";
