"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";

const TOKEN_KEY = "somewhen:join-token";

async function recoverTokenFromLoginTab() {
  if (!("BroadcastChannel" in window)) return null;
  return new Promise<string | null>((resolve) => {
    const channel = new BroadcastChannel("somewhen-invite-token");
    const timer = window.setTimeout(() => { channel.close(); resolve(null); }, 800);
    channel.onmessage = (event) => {
      if (event.data?.type !== "invite-token" || !/^[a-f0-9]{48}$/i.test(event.data.token)) return;
      window.clearTimeout(timer); channel.close(); resolve(event.data.token);
    };
    channel.postMessage({ type: "request-token" });
  });
}

export default function JoinClient() {
  const [status, setStatus] = useState("Validando invitación…");
  const [failed, setFailed] = useState(false);
  const [retryable, setRetryable] = useState(false);

  const join = useCallback(async () => {
    setFailed(false);
    setRetryable(false);
    const hashToken = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (hashToken && /^[a-f0-9]{48}$/i.test(hashToken)) sessionStorage.setItem(TOKEN_KEY, hashToken);
    if (window.location.hash) history.replaceState(null, "", `${location.pathname}${location.search}`);

    let token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      token = await recoverTokenFromLoginTab();
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
    }
    if (!token) {
      setFailed(true);
      setStatus("Abre de nuevo el enlace de invitación para continuar.");
      return;
    }

    const supabase = createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    if (!claimsData?.claims?.sub) {
      window.location.replace("/login?next=/join");
      return;
    }

    const { error } = await supabase.rpc("join_group", { p_token: token });
    if (error) {
      const transient = /fetch|network|timeout|temporar/i.test(error.message) || error.code?.startsWith("PGRST");
      setFailed(true);
      setRetryable(Boolean(transient));
      setStatus(transient ? "No pudimos contactar al servidor. Tu invitación sigue guardada." : "La invitación venció, fue revocada o ya no tiene usos disponibles.");
      return;
    }
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.replace("/app");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void join(); }, 0);
    return () => window.clearTimeout(timer);
  }, [join]);

  return (
    <main className="auth-main">
      <section className="auth-card" aria-live="polite" aria-busy={!failed}>
        <p className="eyebrow">Invitación al grupo</p>
        <h1>{failed ? "No pudimos unirte" : "Te estamos sumando"}</h1>
        <p>{status}</p>
        {retryable && <button className="secondary-button" type="button" onClick={() => void join()}>Intentar de nuevo</button>}
        {failed && !retryable && <Link className="secondary-button inline-button" href="/app">Ir a mis grupos</Link>}
      </section>
    </main>
  );
}
