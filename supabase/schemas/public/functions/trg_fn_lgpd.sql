CREATE OR REPLACE FUNCTION public.trg_fn_lgpd()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.data_aceite_lgpd := CASE
            WHEN NEW.aceito_lgpd THEN COALESCE(NEW.data_aceite_lgpd, NOW())
            ELSE NULL
        END;
    ELSIF NEW.aceito_lgpd IS DISTINCT FROM OLD.aceito_lgpd THEN
        NEW.data_aceite_lgpd := CASE
            WHEN NEW.aceito_lgpd THEN NOW()
            ELSE NULL
        END;
    END IF;

    RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."trg_fn_lgpd"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."trg_fn_lgpd"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_fn_lgpd"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_fn_lgpd"() TO "postgres";
