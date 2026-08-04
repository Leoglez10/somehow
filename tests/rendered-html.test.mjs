import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildMonthCalendar,
  getPrototypeAvailability,
  mondayFirstWeekdays,
} from "../app/calendar.ts";
import {
  addSuggestion,
  canContinue,
  createProposalSnapshot,
  hasUnanimousAcceptance,
  nextStepIndex,
  previousStepIndex,
  proposalSteps,
  slotForSelectedDate,
} from "../app/proposal-flow.ts";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(pathname, "http://localhost"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

const slot = {
  id: "fri-1930",
  isoDate: "2026-08-07",
  day: "Viernes",
  date: "7 ago",
  time: "7:30 p. m.",
  note: "Una tarde tranquila",
};

test("renderiza la portada explicativa separada de la aplicación", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Somewhen — tiempo para tu gente<\/title>/i);
  assert.match(html, /Hacer planes debería sentirse como algo entre amigos\./);
  assert.match(html, /Del “hay que vernos” a un plan aceptado por todos\./);
  assert.match(html, /href="\/app"/);
  assert.doesNotMatch(html, /Paso 1 de 4: Plan/i);
  assert.doesNotMatch(html, /¿Qué plan quieres proponer\?/);
  assert.doesNotMatch(html, /Escribe una idea e invita al menos a una persona para continuar\./);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("renderiza el primer paso de la experiencia guiada en la aplicación", async () => {
  const response = await render("/app");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Somewhen — tiempo para tu gente<\/title>/i);
  assert.match(html, /Arma una propuesta/);
  assert.match(html, /Paso 1 de 4: Plan/i);
  assert.match(html, /¿Qué plan quieres proponer\?/);
  assert.match(html, /Necesito inspiración/);
  assert.match(html, /¿A quién quieres invitar\?/);
  assert.match(html, /Duración o detalles/);
  assert.match(html, /Escribe una idea e invita al menos a una persona para continuar\./);
  assert.match(html, /aria-describedby="invitees-help"/);
  assert.match(html, /aria-describedby="step-requirement"/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("mantiene visible la explicación del botón bloqueado en pantallas pequeñas", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const mobileStyles = styles.slice(styles.indexOf("@media (max-width: 640px)"));

  assert.doesNotMatch(
    mobileStyles,
    /\.flow-actions p\s*\{[^}]*display:\s*none/s,
  );
  assert.match(
    mobileStyles,
    /\.flow-actions p\s*\{[^}]*display:\s*block/s,
  );
});

test("construye meses gregorianos con semanas que empiezan en lunes", () => {
  assert.deepEqual(mondayFirstWeekdays, ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);

  const august2026 = buildMonthCalendar(2026, 7, "2026-08-04");
  assert.equal(august2026.length, 42);
  assert.equal(august2026[0].isoDate, "2026-07-27");
  assert.equal(august2026[5].isoDate, "2026-08-01");
  assert.equal(august2026.at(-1).isoDate, "2026-09-06");
  assert.equal(august2026.find((day) => day.isoDate === "2026-08-04").isToday, true);

  const february2028 = buildMonthCalendar(2028, 1, "2028-01-15");
  assert.equal(february2028[0].isoDate, "2028-01-31");
  assert.equal(
    february2028.some((day) => day.isoDate === "2028-02-29" && day.isCurrentMonth),
    true,
  );
});

test("asocia disponibilidad de ejemplo con fechas ISO reales y futuras", () => {
  const availability = getPrototypeAvailability(2028, 1, "2028-02-10");
  const dates = Object.keys(availability);

  assert.ok(dates.length > 0);
  assert.equal(dates.every((date) => /^2028-02-\d{2}$/.test(date)), true);
  assert.equal(dates.every((date) => date > "2028-02-10"), true);
  assert.ok(availability["2028-02-12"]?.length > 0);
});

test("ordena los pasos y bloquea el avance hasta completar cada decisión", () => {
  assert.deepEqual(proposalSteps, ["plan", "place", "time", "review"]);
  assert.equal(nextStepIndex(0), 1);
  assert.equal(nextStepIndex(3), 3);
  assert.equal(previousStepIndex(2), 1);
  assert.equal(previousStepIndex(0), 0);

  const emptyDraft = {
    idea: "",
    place: "",
    details: "",
    organizer: "Leo",
    invitees: [],
    slot: null,
  };
  assert.equal(canContinue("plan", emptyDraft), false);

  const withIdea = { ...emptyDraft, idea: "Tomar un café" };
  assert.equal(canContinue("plan", withIdea), false);
  assert.equal(canContinue("plan", { ...withIdea, invitees: [" "] }), false);

  const withInvitee = { ...withIdea, invitees: ["Rodo"] };
  assert.equal(canContinue("plan", withInvitee), true);
  assert.equal(canContinue("place", withInvitee), true);
  assert.equal(canContinue("time", withInvitee), false);
  assert.equal(createProposalSnapshot(withInvitee), null);

  const completeDraft = { ...withInvitee, slot };
  assert.equal(canContinue("time", completeDraft), true);
  assert.equal(canContinue("review", completeDraft), true);
  assert.equal(slotForSelectedDate(slot, "2026-08-07"), slot);
  assert.equal(slotForSelectedDate(slot, "2026-08-08"), null);
});

test("crea la propuesta solo después de revisar y conserva una instantánea inmutable", () => {
  const draft = {
    idea: "Cenar sin prisas",
    place: "Nuestro café de siempre",
    details: "Tenemos unas dos horas",
    organizer: "Leo",
    invitees: ["Rodo"],
    slot: { ...slot },
  };
  const proposal = createProposalSnapshot(draft);

  assert.ok(proposal);
  assert.equal(Object.isFrozen(proposal), true);
  assert.equal(Object.isFrozen(proposal.slot), true);
  assert.equal(Object.isFrozen(proposal.participants), true);

  draft.idea = "Salir a caminar";
  draft.place = "El parque";
  draft.details = "Sin límite de tiempo";
  draft.invitees.push("Fer");
  draft.slot.time = "9:00 p. m.";

  assert.deepEqual(proposal, {
    name: "Cenar sin prisas",
    place: "Nuestro café de siempre",
    details: "Tenemos unas dos horas",
    participants: ["Leo", "Rodo"],
    slot,
  });
});

test("permite dejar el lugar abierto sin bloquear ni perder la instantánea", () => {
  const proposal = createProposalSnapshot({
    idea: "Ver una película",
    place: "",
    details: "",
    organizer: "Leo",
    invitees: ["Fer"],
    slot,
  });

  assert.ok(proposal);
  assert.equal(proposal.place, "Lo decidimos después");
  assert.deepEqual(proposal.participants, ["Leo", "Fer"]);
});

test("confirma el plan únicamente cuando todas las personas aceptan", () => {
  const participants = ["Leo", "Rodo"];
  assert.equal(
    hasUnanimousAcceptance(participants, { Leo: true, Rodo: false, Fer: true }),
    false,
  );
  assert.equal(
    hasUnanimousAcceptance(participants, { Leo: true, Rodo: true, Fer: false }),
    true,
  );
  assert.equal(hasUnanimousAcceptance([], {}), false);
});

test("mantiene las sugerencias separadas de la propuesta enviada", () => {
  const proposal = createProposalSnapshot({
    idea: "Salir a caminar",
    place: "",
    details: "",
    organizer: "Leo",
    invitees: ["Rodo"],
    slot,
  });
  const suggestions = addSuggestion([], "  También podría ser más tarde  ");

  assert.ok(proposal);
  assert.deepEqual(suggestions, ["También podría ser más tarde"]);
  assert.equal(proposal.name, "Salir a caminar");
  assert.equal(proposal.place, "Lo decidimos después");
});
