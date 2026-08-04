import { isSupabaseConfigured } from "../../lib/supabase/config";
import JoinClient from "./join-client";

export const dynamic = "force-dynamic";

export default function JoinPage() {
  if (!isSupabaseConfigured()) {
    return <main className="auth-main"><section className="auth-card"><h1>Configura Supabase para continuar</h1></section></main>;
  }
  return <JoinClient />;
}
