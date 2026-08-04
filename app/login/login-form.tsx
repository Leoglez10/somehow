"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Heart, Mail } from "lucide-react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";

export default function LoginForm({ nextPath, initialError = "" }: { nextPath: string; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(initialError);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("somewhen-invite-token");
    channel.onmessage = (event) => {
      if (event.data?.type !== "request-token") return;
      const token = sessionStorage.getItem("somewhen:join-token");
      if (token) channel.postMessage({ type: "invite-token", token });
    };
    return () => channel.close();
  }, []);

  function callbackUrl() {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", nextPath);
    return url.toString();
  }

  async function signInWithGoogle() {
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callbackUrl(),
        shouldCreateUser: true,
      },
    });
    setBusy(false);
    setMessage(
      error
        ? error.message
        : "Te enviamos un enlace seguro. Revisa tu correo para continuar.",
    );
  }

  return (
    <main className="auth-main">
      <nav className="topbar landing-topbar" aria-label="Navegación principal">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true"><Heart size={16} fill="currentColor" /></span>
          somewhen
        </Link>
        <Link className="topbar-link" href="/">Volver a la portada</Link>
      </nav>

      <section className="auth-card" aria-labelledby="login-heading">
        <p className="eyebrow">Tu espacio privado</p>
        <h1 id="login-heading">Entra para organizar un plan</h1>
        <p>Tu disponibilidad solo la ves tú. El grupo recibe únicamente los horarios que coinciden.</p>

        <button className="auth-google-button" type="button" onClick={signInWithGoogle} disabled={busy}>
          Continuar con Google <ArrowRight size={18} aria-hidden="true" />
        </button>

        <div className="auth-divider"><span>o usa tu correo</span></div>

        <form className="auth-email-form" onSubmit={sendMagicLink} aria-busy={busy}>
          <label htmlFor="login-email">Correo electrónico</label>
          <div className="flow-input-with-icon">
            <Mail size={18} aria-hidden="true" />
            <input
              className="flow-input"
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <button className="secondary-button" type="submit" disabled={busy || !email.trim()}>
            Enviarme un enlace de acceso
          </button>
        </form>

        {message && <p className="form-status" role="status">{message}</p>}
      </section>
    </main>
  );
}
