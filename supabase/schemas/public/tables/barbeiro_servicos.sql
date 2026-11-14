CREATE TABLE "public"."barbeiro_servicos" (
  "barbeiro_id" bigint NOT NULL,
  "servico_id"  bigint NOT NULL,
  CONSTRAINT "barbeiro_servicos_pkey" PRIMARY KEY (barbeiro_id, servico_id),
  CONSTRAINT "barbeiro_servicos_barbeiro_id_fkey" FOREIGN KEY (barbeiro_id) REFERENCES public.barbeiros(id),
  CONSTRAINT "barbeiro_servicos_servico_id_fkey" FOREIGN KEY (servico_id) REFERENCES public.servicos(id)
);

ALTER TABLE "public"."barbeiro_servicos"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalogo_vinculos_leitura" ON "public"."barbeiro_servicos"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."barbeiro_servicos" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."barbeiro_servicos" TO "service_role";

REVOKE ALL ON TABLE "public"."barbeiro_servicos" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."barbeiro_servicos" TO "postgres";
