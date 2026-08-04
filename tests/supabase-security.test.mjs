import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260804231023_create_somewhen_mvp.sql",
  import.meta.url,
);

async function migration() {
  return readFile(migrationUrl, "utf8");
}

test("habilita RLS en todas las tablas expuestas del MVP", async () => {
  const sql = await migration();
  const tables = [
    "profiles",
    "groups",
    "group_memberships",
    "group_invites",
    "availability_windows",
    "proposals",
    "proposal_snapshots",
    "proposal_participants",
    "proposal_suggestions",
  ];

  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`, "i"));
  }
});

test("mantiene disponibilidad cruda e invitaciones fuera de lecturas compartidas", async () => {
  const sql = await migration();
  assert.match(sql, /create policy availability_select_owner[\s\S]*auth\.uid\(\)\) = user_id/i);
  assert.doesNotMatch(sql, /grant select[^;]*group_invites/i);
  assert.match(sql, /extensions\.digest\(raw_token, 'sha256'\)/i);
  assert.match(sql, /extensions\.gen_random_bytes\(24\)/i);
  assert.match(sql, /No direct policy exists for group_invites/i);
});

test("aísla los security definer y revoca su ejecución pública", async () => {
  const sql = await migration();
  const definerFunctions = [...sql.matchAll(/create function (private\.[a-z_]+)\([\s\S]*?security definer[\s\S]*?set search_path = ''/gi)];
  assert.ok(definerFunctions.length >= 8);
  assert.doesNotMatch(sql, /create function public\.[a-z_]+\([\s\S]{0,400}?security definer/i);
  assert.match(sql, /revoke all on function private\.create_proposal[\s\S]*from public, anon;/i);
  assert.match(sql, /revoke all on function private\.get_common_availability[\s\S]*from public, anon;/i);
});

test("solo publica estados y sugerencias en Realtime", async () => {
  const sql = await migration();
  assert.match(sql, /alter publication supabase_realtime add table public\.proposal_participants/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.proposal_suggestions/i);
  assert.doesNotMatch(sql, /alter publication supabase_realtime add table public\.availability_windows/i);
});

test("serializa respuestas e impide actualizaciones directas de participantes", async () => {
  const sql = await migration();
  assert.match(sql, /create function private\.respond_to_proposal[\s\S]*for update[\s\S]*responded_at = now\(\)/i);
  assert.match(sql, /create function public\.respond_to_proposal/i);
  assert.doesNotMatch(sql, /grant update \(response\)/i);
  assert.doesNotMatch(sql, /create policy proposal_participants_update_self/i);
});

test("hace la creación idempotente y valida el horario común en el servidor", async () => {
  const sql = await migration();
  assert.match(sql, /client_request_id uuid not null/i);
  assert.match(sql, /unique index proposals_organizer_request_idx/i);
  assert.match(sql, /on conflict \(organizer_id, client_request_id\) do nothing/i);
  assert.match(sql, /private\.get_common_availability[\s\S]*proposal slot is no longer common availability/i);
  assert.match(sql, /date_bin\(interval '15 minutes'/i);
});

test("requiere consentimiento y limita la inferencia de disponibilidad", async () => {
  const sql = await migration();
  assert.match(sql, /availability_sharing_enabled boolean not null default false/i);
  assert.match(sql, /every participant must enable availability sharing/i);
  assert.match(sql, /p_to > now\(\) \+ interval '62 days'/i);
  assert.match(sql, /p_min_duration < interval '30 minutes'/i);
});

test("mantiene tokens de invitación fuera de query strings", async () => {
  const workspace = await readFile(new URL("../app/app/workspace.tsx", import.meta.url), "utf8");
  const join = await readFile(new URL("../app/join/join-client.tsx", import.meta.url), "utf8");
  assert.match(workspace, /url\.hash = `token=/);
  assert.doesNotMatch(workspace, /searchParams\.set\("token"/);
  assert.match(join, /sessionStorage\.setItem\(TOKEN_KEY/);
  assert.match(join, /history\.replaceState/);
  assert.match(join, /recoverTokenFromLoginTab/);
  assert.match(join, /BroadcastChannel\("somewhen-invite-token"\)/);
  assert.match(join, /login\?next=\/join/);
});

test("no introduce una clave de servicio en el código de la aplicación", async () => {
  const files = [
    "../lib/supabase/config.ts",
    "../lib/supabase/client.ts",
    "../lib/supabase/server.ts",
    "../app/app/page.tsx",
    "../app/app/workspace.tsx",
    "../proxy.ts",
  ];
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
  assert.doesNotMatch(source, /service[_-]?role/i);
  assert.doesNotMatch(source, /SUPABASE_SECRET/i);
});
