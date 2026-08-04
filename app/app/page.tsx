import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { createClient } from "../../lib/supabase/server";
import AppWorkspace from "./workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AppPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="auth-main">
        <section className="auth-card" aria-labelledby="app-config-heading">
          <p className="eyebrow">Aplicación protegida</p>
          <h1 id="app-config-heading">Configura Supabase para entrar</h1>
          <p>Completa las variables públicas descritas en <code>.env.example</code> y aplica la migración antes de iniciar sesión.</p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (error || !userId) redirect("/login?next=/app");

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email ?? "";
  const fallbackName = email.split("@")[0] || "Tú";

  return <AppWorkspace currentUser={{ id: userId, email, fallbackName }} />;
}
