import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { createClient } from "../../lib/supabase/server";
import { safeNextPath } from "../../lib/supabase/safe-next";
import LoginForm from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(next);

  if (!isSupabaseConfigured()) {
    return (
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="config-heading">
          <p className="eyebrow">Configuración pendiente</p>
          <h1 id="config-heading">Conecta las claves públicas de Supabase</h1>
          <p>Agrega las variables documentadas en <code>.env.example</code>. La aplicación nunca necesita una clave <code>service_role</code>.</p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect(nextPath);

  return <LoginForm nextPath={nextPath} initialError={error ? "No pudimos completar el acceso. Inténtalo de nuevo." : ""} />;
}
