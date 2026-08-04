"use client";

import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Heart,
  Lightbulb,
  LockKeyhole,
  LogOut,
  MapPin,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildMonthCalendar,
  formatFullDate,
  formatMonthLabel,
  isoDateParts,
  localDateToIso,
  mondayFirstWeekdays,
  shiftMonth,
} from "../calendar";
import { createClient } from "../../lib/supabase/client";

const stepLabels = ["Plan", "Lugar", "Horario", "Revisión"] as const;
const activityIdeas = ["Tomar un café", "Cenar sin prisas", "Salir a caminar", "Noche de juegos"];
const avatarColors = ["peach", "lime", "lilac"] as const;

type CurrentUser = { id: string; email: string; fallbackName: string };
type Group = { id: string; name: string; owner_id: string; role: "owner" | "member" };
type Profile = { id: string; display_name: string; avatar_url: string | null };
type Member = Profile & { role: "owner" | "member"; availability_sharing_enabled: boolean };
type Availability = { id: string; starts_at: string; ends_at: string };
type CommonWindow = { starts_at: string; ends_at: string };
type ProposalRow = {
  id: string;
  idea: string;
  place: string | null;
  details: string | null;
  starts_at: string;
  ends_at: string;
  status: "pending" | "confirmed" | "declined" | "cancelled";
  created_at: string;
};
type Participant = {
  proposal_id: string;
  user_id: string;
  response: "pending" | "accepted" | "declined";
  responded_at: string | null;
};
type Suggestion = {
  id: string;
  proposal_id: string;
  user_id: string;
  message: string;
  created_at: string;
};
type Draft = {
  idea: string;
  place: string;
  details: string;
  inviteeIds: string[];
  durationMinutes: number;
  window: CommonWindow | null;
};

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)?.[0]}` : value.slice(0, 2)).toUpperCase();
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function endForDuration(window: CommonWindow, durationMinutes: number) {
  return new Date(new Date(window.starts_at).getTime() + durationMinutes * 60_000).toISOString();
}

function supportsDuration(window: CommonWindow | null, durationMinutes: number) {
  return Boolean(window && new Date(window.ends_at).getTime() - new Date(window.starts_at).getTime() >= durationMinutes * 60_000);
}

function errorMessage(error: { message?: string } | null, fallback: string) {
  return error?.message ? `${fallback}: ${error.message}` : fallback;
}

export default function AppWorkspace({ currentUser }: { currentUser: CurrentUser }) {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBusy, setGroupBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [realtimeError, setRealtimeError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const groupLoadGeneration = useRef(0);

  const [newGroupName, setNewGroupName] = useState("");
  const [joinToken, setJoinToken] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [availabilityStart, setAvailabilityStart] = useState("");
  const [availabilityEnd, setAvailabilityEnd] = useState("");

  const [stepIndex, setStepIndex] = useState(0);
  const [placeMode, setPlaceMode] = useState<"later" | "specific">("later");
  const [draft, setDraft] = useState<Draft>({
    idea: "",
    place: "",
    details: "",
    inviteeIds: [],
    durationMinutes: 60,
    window: null,
  });
  const [todayIso] = useState(() => localDateToIso(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [commonWindows, setCommonWindows] = useState<CommonWindow[]>([]);
  const [loadingCommon, setLoadingCommon] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [suggestionText, setSuggestionText] = useState("");
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const me = members.find((member) => member.id === currentUser.id);
  const displayName = me?.display_name ?? currentUser.fallbackName;
  const inviteableMembers = members.filter((member) => member.id !== currentUser.id);
  const activeProposal = proposals.find((proposal) => proposal.id === activeProposalId) ?? proposals[0] ?? null;
  const activeParticipants = activeProposal
    ? participants.filter((participant) => participant.proposal_id === activeProposal.id)
    : [];
  const activeSuggestions = activeProposal
    ? suggestions.filter((item) => item.proposal_id === activeProposal.id)
    : [];
  const myParticipant = activeParticipants.find((participant) => participant.user_id === currentUser.id);
  const acceptedCount = activeParticipants.filter((participant) => participant.response === "accepted").length;

  const todayParts = useMemo(() => isoDateParts(todayIso), [todayIso]);
  const calendarDays = useMemo(
    () => buildMonthCalendar(visibleMonth.year, visibleMonth.monthIndex, todayIso),
    [todayIso, visibleMonth],
  );
  const windowsByDay = useMemo(() => {
    const map: Record<string, CommonWindow[]> = {};
    commonWindows.forEach((window) => {
      const day = localDateToIso(new Date(window.starts_at));
      map[day] = [...(map[day] ?? []), window];
    });
    return map;
  }, [commonWindows]);
  const selectedWindows = selectedDayIso ? windowsByDay[selectedDayIso] ?? [] : [];
  const showingCurrentMonth =
    visibleMonth.year === todayParts.year && visibleMonth.monthIndex === todayParts.monthIndex;

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    const { data: membershipRows, error } = await supabase
      .from("group_memberships")
      .select("group_id,role")
      .eq("user_id", currentUser.id);

    if (error) {
      setStatusMessage(errorMessage(error, "No pudimos cargar tus grupos"));
      setLoading(false);
      return;
    }

    const ids = (membershipRows ?? []).map((row) => row.group_id as string);
    if (ids.length === 0) {
      setGroups([]);
      setSelectedGroupId(null);
      setLoading(false);
      return;
    }

    const { data: groupRows, error: groupsError } = await supabase
      .from("groups")
      .select("id,name,owner_id")
      .in("id", ids)
      .order("created_at");

    if (groupsError) {
      setStatusMessage(errorMessage(groupsError, "No pudimos cargar tus grupos"));
      setLoading(false);
      return;
    }

    const roleById = new Map((membershipRows ?? []).map((row) => [row.group_id, row.role]));
    const loadedGroups = (groupRows ?? []).map((group) => ({
      ...group,
      role: roleById.get(group.id) as "owner" | "member",
    }));
    setGroups(loadedGroups);
    setSelectedGroupId((current) =>
      current && loadedGroups.some((group) => group.id === current) ? current : loadedGroups[0]?.id ?? null,
    );
    setLoading(false);
  }, [currentUser.id, supabase]);

  const loadGroupData = useCallback(async (groupId: string) => {
    const generation = ++groupLoadGeneration.current;
    setGroupBusy(true);
    const [memberResult, availabilityResult, proposalResult] = await Promise.all([
      supabase.from("group_memberships").select("user_id,role,availability_sharing_enabled").eq("group_id", groupId),
      supabase
        .from("availability_windows")
        .select("id,starts_at,ends_at")
        .eq("user_id", currentUser.id)
        .order("starts_at"),
      supabase
        .from("proposals")
        .select("id,idea,place,details,starts_at,ends_at,status,created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (generation !== groupLoadGeneration.current) return;
    if (memberResult.error || availabilityResult.error || proposalResult.error) {
      setStatusMessage("No pudimos actualizar todos los datos del grupo.");
      setGroupBusy(false);
      return;
    }

    const memberRows = memberResult.data ?? [];
    const memberIds = memberRows.map((row) => row.user_id as string);
    const profileResult = memberIds.length
      ? await supabase.from("profiles").select("id,display_name,avatar_url").in("id", memberIds)
      : { data: [], error: null };
    if (generation !== groupLoadGeneration.current) return;
    if (profileResult.error) {
      setStatusMessage("No pudimos cargar los perfiles del grupo. Conservamos los datos anteriores.");
      setGroupBusy(false);
      return;
    }
    const roleByUser = new Map(memberRows.map((row) => [row.user_id, row.role]));
    setMembers(
      (profileResult.data ?? []).map((profile) => ({
        ...profile,
        role: roleByUser.get(profile.id) as "owner" | "member",
        availability_sharing_enabled: Boolean(memberRows.find((row) => row.user_id === profile.id)?.availability_sharing_enabled),
      })),
    );
    setAvailability((availabilityResult.data ?? []) as Availability[]);

    const loadedProposals = (proposalResult.data ?? []) as ProposalRow[];
    setProposals(loadedProposals);
    setActiveProposalId((current) =>
      current && loadedProposals.some((proposal) => proposal.id === current)
        ? current
        : loadedProposals[0]?.id ?? null,
    );

    const proposalIds = loadedProposals.map((proposal) => proposal.id);
    if (proposalIds.length === 0) {
      setParticipants([]);
      setSuggestions([]);
      setGroupBusy(false);
      return;
    }

    const [participantResult, suggestionResult] = await Promise.all([
      supabase
        .from("proposal_participants")
        .select("proposal_id,user_id,response,responded_at")
        .in("proposal_id", proposalIds),
      supabase
        .from("proposal_suggestions")
        .select("id,proposal_id,user_id,message,created_at")
        .in("proposal_id", proposalIds)
        .order("created_at"),
    ]);
    if (generation !== groupLoadGeneration.current) return;
    if (participantResult.error || suggestionResult.error) {
      setStatusMessage("No pudimos cargar respuestas o sugerencias. Conservamos el estado anterior.");
      setGroupBusy(false);
      return;
    }
    setParticipants((participantResult.data ?? []) as Participant[]);
    setSuggestions((suggestionResult.data ?? []) as Suggestion[]);
    setGroupBusy(false);
  }, [currentUser.id, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadWorkspace(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);
  useEffect(() => {
    if (!selectedGroupId) return;
    const timer = window.setTimeout(() => { void loadGroupData(selectedGroupId); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadGroupData, selectedGroupId]);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [stepIndex]);

  useEffect(() => {
    if (!selectedGroupId || draft.inviteeIds.length === 0) {
      return;
    }

    let active = true;
    async function loadCommonWindows() {
      setLoadingCommon(true);
      const monthStart = new Date(visibleMonth.year, visibleMonth.monthIndex, 1);
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const from = new Date(Math.max(monthStart.getTime(), todayStart.getTime()));
      const to = new Date(visibleMonth.year, visibleMonth.monthIndex + 1, 1);
      const { data, error } = await supabase.rpc("get_common_availability", {
        p_group_id: selectedGroupId,
        p_participant_ids: draft.inviteeIds,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
        p_min_duration: "30 minutes",
      });
      if (!active) return;
      setLoadingCommon(false);
      if (error) {
        setCommonWindows([]);
        setStatusMessage(errorMessage(error, "No pudimos calcular los horarios en común"));
        return;
      }
      setCommonWindows((data ?? []) as CommonWindow[]);
    }
    const timer = window.setTimeout(() => { void loadCommonWindows(); }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [draft.inviteeIds, selectedGroupId, supabase, visibleMonth]);

  useEffect(() => {
    if (!activeProposalId) return;
    const channel = supabase
      .channel(`proposal-${activeProposalId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "proposal_participants", filter: `proposal_id=eq.${activeProposalId}` },
        () => selectedGroupId && void loadGroupData(selectedGroupId),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "proposal_suggestions", filter: `proposal_id=eq.${activeProposalId}` },
        () => selectedGroupId && void loadGroupData(selectedGroupId),
      )
      .subscribe((state) => {
        if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") setRealtimeError("La actualización en vivo se interrumpió.");
        if (state === "SUBSCRIBED") setRealtimeError("");
      });
    return () => { void supabase.removeChannel(channel); };
  }, [activeProposalId, loadGroupData, selectedGroupId, supabase]);

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    const { error } = await supabase.rpc("create_group", { p_name: name });
    if (error) {
      setStatusMessage(errorMessage(error, "No pudimos crear el grupo"));
      return;
    }
    setNewGroupName("");
    setStatusMessage("Grupo creado.");
    await loadWorkspace();
  }

  async function joinGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = joinToken.trim().toLowerCase();
    if (!token) return;
    const { error } = await supabase.rpc("join_group", { p_token: token });
    if (error) {
      setStatusMessage(errorMessage(error, "No pudimos usar esa invitación"));
      return;
    }
    setJoinToken("");
    setStatusMessage("Ya formas parte del grupo.");
    await loadWorkspace();
  }

  async function createInvite() {
    if (!selectedGroup || groupBusy) return;
    const { data, error } = await supabase.rpc("create_group_invite", {
      p_group_id: selectedGroup.id,
      p_expires_in_hours: 168,
      p_max_uses: 20,
    });
    if (error || typeof data !== "string") {
      setStatusMessage(errorMessage(error, "No pudimos crear la invitación"));
      return;
    }
    const url = new URL("/join", window.location.origin);
    url.hash = `token=${encodeURIComponent(data)}`;
    setInviteUrl(url.toString());
    setStatusMessage("Invitación creada. Vence en 7 días.");
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setStatusMessage("Enlace copiado.");
    } catch {
      setStatusMessage("Selecciona y copia el enlace manualmente.");
    }
  }

  async function addAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (groupBusy) return;
    const startsAt = new Date(availabilityStart);
    const endsAt = new Date(availabilityEnd);
    if (!availabilityStart || !availabilityEnd || endsAt <= startsAt) {
      setStatusMessage("El final debe ser posterior al inicio.");
      return;
    }
    const { error } = await supabase.from("availability_windows").insert({
      user_id: currentUser.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    });
    if (error) {
      setStatusMessage(errorMessage(error, "No pudimos guardar tu disponibilidad"));
      return;
    }
    setAvailabilityStart("");
    setAvailabilityEnd("");
    setStatusMessage("Disponibilidad guardada. Solo tú puedes ver este registro.");
    if (selectedGroupId) await loadGroupData(selectedGroupId);
  }

  async function removeAvailability(id: string) {
    if (groupBusy) return;
    const { error } = await supabase.from("availability_windows").delete().eq("id", id);
    if (error) {
      setStatusMessage(errorMessage(error, "No pudimos eliminar el horario"));
      return;
    }
    if (selectedGroupId) await loadGroupData(selectedGroupId);
  }

  function toggleInvitee(userId: string) {
    setDraft((current) => ({
      ...current,
      inviteeIds: current.inviteeIds.includes(userId)
        ? current.inviteeIds.filter((id) => id !== userId)
        : [...current.inviteeIds, userId],
      window: null,
    }));
    setSelectedDayIso(null);
  }

  function changeMonth(offset: number) {
    setVisibleMonth((current) => shiftMonth(current.year, current.monthIndex, offset));
    setSelectedDayIso(null);
    setDraft((current) => ({ ...current, window: null }));
  }

  function returnToCurrentMonth() {
    setVisibleMonth({ year: todayParts.year, monthIndex: todayParts.monthIndex });
    setSelectedDayIso(null);
    setDraft((current) => ({ ...current, window: null }));
  }

  function mayContinue() {
    if (stepIndex === 0) return draft.idea.trim().length > 0 && draft.inviteeIds.length > 0 && Boolean(me?.availability_sharing_enabled) && draft.inviteeIds.every((id) => members.find((member) => member.id === id)?.availability_sharing_enabled);
    if (stepIndex === 2) return supportsDuration(draft.window, draft.durationMinutes);
    return true;
  }

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mayContinue() || submitting || groupBusy) return;
    if (stepIndex < 3) {
      setStepIndex((current) => current + 1);
      return;
    }
    if (!selectedGroup || !draft.window) return;

    setSubmitting(true);
    const { data, error } = await supabase.rpc("create_proposal", {
      p_request_id: requestId,
      p_group_id: selectedGroup.id,
      p_idea: draft.idea.trim(),
      p_place: placeMode === "specific" ? draft.place.trim() : "",
      p_details: draft.details.trim(),
      p_starts_at: draft.window.starts_at,
      p_ends_at: endForDuration(draft.window, draft.durationMinutes),
      p_participant_ids: draft.inviteeIds,
    });
    if (error || typeof data !== "string") {
      setStatusMessage(errorMessage(error, "No pudimos enviar la propuesta"));
      setSubmitting(false);
      return;
    }
    setStatusMessage("Propuesta enviada. Su contenido quedó congelado para todos.");
    setDraft({ idea: "", place: "", details: "", inviteeIds: [], durationMinutes: 60, window: null });
    setStepIndex(0);
    setRequestId(crypto.randomUUID());
    setSubmitting(false);
    setSelectedDayIso(null);
    setActiveProposalId(data);
    await loadGroupData(selectedGroup.id);
  }

  async function respond(response: "accepted" | "declined") {
    if (!activeProposal || groupBusy) return;
    const { error } = await supabase.rpc("respond_to_proposal", {
      p_proposal_id: activeProposal.id,
      p_response: response,
    });
    if (error) {
      setStatusMessage(errorMessage(error, "No pudimos guardar tu respuesta"));
      return;
    }
    setStatusMessage(response === "accepted" ? "Aceptaste la propuesta." : "Marcaste que no puedes.");
    if (selectedGroupId) await loadGroupData(selectedGroupId);
  }

  async function addSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeProposal || !suggestionText.trim() || groupBusy) return;
    const { error } = await supabase.from("proposal_suggestions").insert({
      proposal_id: activeProposal.id,
      user_id: currentUser.id,
      message: suggestionText.trim(),
    });
    if (error) {
      setStatusMessage(errorMessage(error, "No pudimos agregar tu sugerencia"));
      return;
    }
    setSuggestionText("");
    if (selectedGroupId) await loadGroupData(selectedGroupId);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.replace("/");
  }

  function switchGroup(groupId: string) {
    groupLoadGeneration.current += 1;
    setMembers([]); setAvailability([]); setProposals([]); setParticipants([]); setSuggestions([]);
    setActiveProposalId(null); setCommonWindows([]); setSelectedDayIso(null); setRealtimeError("");
    setInviteUrl(""); setSuggestionText("");
    setDraft({ idea: "", place: "", details: "", inviteeIds: [], durationMinutes: 60, window: null });
    setStepIndex(0); setRequestId(crypto.randomUUID()); setSelectedGroupId(groupId);
  }

  async function setAvailabilitySharing(enabled: boolean) {
    if (!selectedGroupId || groupBusy) return;
    const { error } = await supabase.from("group_memberships").update({ availability_sharing_enabled: enabled }).eq("group_id", selectedGroupId).eq("user_id", currentUser.id);
    if (error) setStatusMessage(errorMessage(error, "No pudimos cambiar el permiso de disponibilidad"));
    else await loadGroupData(selectedGroupId);
  }

  if (loading) {
    return <main className="auth-main"><p className="form-status" role="status">Cargando tu espacio…</p></main>;
  }

  return (
    <main className="app-main">
      <nav className="topbar" aria-label="Navegación principal">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true"><Heart size={16} fill="currentColor" /></span>
          somewhen
        </Link>
        <div className="demo-label"><LockKeyhole size={14} aria-hidden="true" />Espacio privado</div>
        <div className="app-topbar-actions">
          <span className="profile-chip"><span className="avatar avatar-peach">{initials(displayName)}</span><span>{displayName}</span></span>
          <button className="icon-text-button" type="button" onClick={signOut}><LogOut size={16} aria-hidden="true" />Salir</button>
        </div>
      </nav>

      {statusMessage && <p className="workspace-status" role="status">{statusMessage}</p>}

      {groups.length === 0 ? (
        <section className="group-section app-section onboarding-grid" aria-labelledby="first-group-heading">
          <div className="section-heading"><div><p className="eyebrow">Primer paso</p><h1 id="first-group-heading">Crea o únete a un grupo</h1></div></div>
          <p className="section-intro">Los grupos delimitan quién puede participar. Nadie fuera del grupo puede consultar propuestas ni coincidencias.</p>
          <div className="setup-panels">
            <form className="setup-panel" onSubmit={createGroup}>
              <UsersRound size={24} aria-hidden="true" />
              <h2>Crear un grupo</h2>
              <label htmlFor="new-group-name">Nombre del grupo</label>
              <input className="flow-input" id="new-group-name" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Por ejemplo, Amigos de siempre" required maxLength={80} />
              <button className="secondary-button" type="submit">Crear grupo</button>
            </form>
            <form className="setup-panel" onSubmit={joinGroup}>
              <UserPlus size={24} aria-hidden="true" />
              <h2>Usar una invitación</h2>
              <label htmlFor="join-token">Código de invitación</label>
              <input className="flow-input" id="join-token" value={joinToken} onChange={(event) => setJoinToken(event.target.value)} autoComplete="off" minLength={48} maxLength={48} required />
              <button className="secondary-button" type="submit">Unirme</button>
            </form>
          </div>
        </section>
      ) : (
        <>
          <section className="group-section app-section" aria-labelledby="group-heading">
            <header className="section-heading">
              <div><p className="eyebrow">Tu grupo</p><h1 id="group-heading">{selectedGroup?.name}</h1></div>
              <div className="group-switcher-wrap">
                {groups.length > 1 && (
                  <label>Grupo<select value={selectedGroupId ?? ""} onChange={(event) => switchGroup(event.target.value)} disabled={groupBusy}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
                )}
                <div className="member-stack" aria-label={`${members.length} integrantes`}>
                  {members.slice(0, 4).map((member, index) => <span className={`avatar avatar-${avatarColors[index % avatarColors.length]}`} title={member.display_name} key={member.id}>{initials(member.display_name)}</span>)}
                  <span className="member-count">{members.length} {members.length === 1 ? "persona" : "personas"}</span>
                </div>
              </div>
            </header>

            <div className="privacy-banner">
              <div className="privacy-icon" aria-hidden="true"><UsersRound size={21} /></div>
              <div><strong>Tu agenda completa nunca se comparte.</strong><p>La base de datos solo devuelve coincidencias calculadas para integrantes seleccionados.</p></div>
            </div>

            <div className="workspace-tools">
              <label className="sharing-consent"><input type="checkbox" checked={Boolean(me?.availability_sharing_enabled)} onChange={(event) => void setAvailabilitySharing(event.target.checked)} disabled={groupBusy} /><span><strong>Compartir coincidencias con este grupo</strong><small>Sin este permiso, el servidor no incluirá tu agenda en ningún cálculo.</small></span></label>
              <details className="workspace-tool">
                <summary><Clock3 size={18} aria-hidden="true" />Mi disponibilidad privada</summary>
                <form className="availability-form" onSubmit={addAvailability}>
                  <label htmlFor="available-from">Desde<input className="flow-input" id="available-from" type="datetime-local" value={availabilityStart} onChange={(event) => setAvailabilityStart(event.target.value)} required /></label>
                  <label htmlFor="available-to">Hasta<input className="flow-input" id="available-to" type="datetime-local" value={availabilityEnd} onChange={(event) => setAvailabilityEnd(event.target.value)} required /></label>
                  <button className="secondary-button" type="submit" disabled={groupBusy}><Plus size={16} aria-hidden="true" />Guardar horario</button>
                </form>
                <ul className="availability-list">
                  {availability.length === 0 && <li>Aún no agregaste horarios.</li>}
                  {availability.map((window) => <li key={window.id}><span>{dateTimeLabel(window.starts_at)} — {timeLabel(window.ends_at)}</span><button type="button" onClick={() => removeAvailability(window.id)} aria-label={`Eliminar disponibilidad del ${dateTimeLabel(window.starts_at)}`}><Trash2 size={16} aria-hidden="true" /></button></li>)}
                </ul>
              </details>

              {selectedGroup?.role === "owner" && (
                <details className="workspace-tool">
                  <summary><UserPlus size={18} aria-hidden="true" />Invitar personas</summary>
                  <p>El enlace vence en 7 días y el servidor guarda solo su hash.</p>
                  <button className="secondary-button" type="button" onClick={createInvite} disabled={groupBusy}>Crear enlace</button>
                  {inviteUrl && <div className="invite-output"><label htmlFor="invite-url">Enlace de invitación</label><div><input id="invite-url" readOnly value={inviteUrl} /><button type="button" onClick={copyInvite} aria-label="Copiar enlace de invitación"><Copy size={16} aria-hidden="true" /></button></div></div>}
                </details>
              )}
            </div>

            <section className="journey-shell" aria-labelledby="proposal-flow-heading">
              <header className="journey-header"><div><p className="tiny-label">ARMA EL PLAN PASO A PASO</p><h2 id="proposal-flow-heading">Una decisión a la vez</h2></div><p>La propuesta se vuelve inmutable cuando la envías.</p></header>
              <progress className="flow-progress" value={stepIndex + 1} max={4} aria-label={`Paso ${stepIndex + 1} de 4: ${stepLabels[stepIndex]}`} />
              <ol className="step-tracker" aria-label="Progreso de la propuesta">{stepLabels.map((label, index) => <li key={label} className={`${index === stepIndex ? "current" : ""}${index < stepIndex ? " completed" : ""}`} aria-current={index === stepIndex ? "step" : undefined}><span>{index < stepIndex ? <Check size={15} aria-hidden="true" /> : index + 1}</span><small>{label}</small></li>)}</ol>

              <form className="guided-form" onSubmit={submitProposal}>
                <div className="step-stage" aria-live="polite">
                  {stepIndex === 0 && <div className="step-content">
                    <div className="step-icon" aria-hidden="true"><Sparkles size={24} /></div><p className="step-count">PASO 1 DE 4 · PLAN E INVITADOS</p><h3 ref={stepHeadingRef} tabIndex={-1}>¿Qué plan quieres proponer?</h3><p>Cuéntalo con tus palabras. La idea la decides tú, no un catálogo.</p>
                    <label className="field-label" htmlFor="plan-idea">Tu idea</label><textarea className="flow-input flow-textarea plan-idea-input" id="plan-idea" value={draft.idea} onChange={(event) => setDraft((current) => ({ ...current, idea: event.target.value }))} placeholder="Por ejemplo, quiero que nos veamos para cocinar algo juntos" rows={4} maxLength={500} required />
                    <details className="inspiration-disclosure"><summary><Lightbulb size={16} aria-hidden="true" />Necesito inspiración</summary><div className="inspiration-options">{activityIdeas.map((idea) => <button key={idea} type="button" className="inspiration-chip" onClick={() => setDraft((current) => ({ ...current, idea }))}>{idea}</button>)}</div></details>
                    <fieldset className="invitee-picker" aria-describedby="invitees-help"><legend><UserPlus size={17} aria-hidden="true" />¿A quién quieres invitar?</legend><p id="invitees-help">Elige a personas que aceptaron compartir coincidencias con este grupo.</p><div>{inviteableMembers.map((member, index) => <label className="invitee-option" key={member.id}><input type="checkbox" checked={draft.inviteeIds.includes(member.id)} onChange={() => toggleInvitee(member.id)} disabled={!member.availability_sharing_enabled} /><span className={`avatar avatar-${avatarColors[index % avatarColors.length]}`} aria-hidden="true">{initials(member.display_name)}</span><span>{member.display_name}{!member.availability_sharing_enabled ? " · permiso pendiente" : ""}</span></label>)}</div></fieldset>
                    <label className="field-label optional-field-label" htmlFor="plan-details">Detalles <span>(opcional)</span></label><textarea className="flow-input flow-textarea" id="plan-details" value={draft.details} onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))} placeholder="Por ejemplo, podemos llevar algo" rows={3} maxLength={2000} />
                  </div>}

                  {stepIndex === 1 && <div className="step-content"><div className="step-icon" aria-hidden="true"><MapPin size={24} /></div><p className="step-count">PASO 2 DE 4 · LUGAR</p><h3 ref={stepHeadingRef} tabIndex={-1}>¿Quieren proponer un lugar?</h3><p>Pueden dejarlo abierto sin bloquear la propuesta.</p>
                    <fieldset className="place-mode-picker"><legend>¿Cómo quieren decidirlo?</legend><label><input type="radio" name="place-mode" checked={placeMode === "later"} onChange={() => { setPlaceMode("later"); setDraft((current) => ({ ...current, place: "" })); }} /><span><strong>Lo decidimos después</strong><small>La propuesta puede avanzar.</small></span></label><label><input type="radio" name="place-mode" checked={placeMode === "specific"} onChange={() => setPlaceMode("specific")} /><span><strong>Quiero proponer un lugar</strong><small>Escribe lo que ya sepan.</small></span></label></fieldset>
                    {placeMode === "specific" && <><label className="field-label" htmlFor="plan-place">Lugar propuesto</label><div className="flow-input-with-icon"><MapPin size={18} aria-hidden="true" /><input className="flow-input" id="plan-place" value={draft.place} onChange={(event) => setDraft((current) => ({ ...current, place: event.target.value }))} maxLength={300} /></div></>}
                  </div>}

                  {stepIndex === 2 && <div className="step-content wide-step"><div className="step-icon" aria-hidden="true"><CalendarDays size={24} /></div><p className="step-count">PASO 3 DE 4 · HORARIO EN COMÚN</p><h3 ref={stepHeadingRef} tabIndex={-1}>¿Cuándo pueden todos?</h3><p>Estas coincidencias vienen del RPC protegido. Los horarios individuales no salen de la base de datos.</p>
                    <div className="month-calendar" aria-labelledby="calendar-month-heading"><div className="calendar-toolbar"><button type="button" className="calendar-nav-button" onClick={() => changeMonth(-1)} aria-label="Ver el mes anterior"><ChevronLeft size={20} aria-hidden="true" /></button><h4 id="calendar-month-heading">{formatMonthLabel(visibleMonth.year, visibleMonth.monthIndex)}</h4><button type="button" className="calendar-nav-button" onClick={() => changeMonth(1)} aria-label="Ver el mes siguiente"><ChevronRight size={20} aria-hidden="true" /></button><button type="button" className="current-month-button" onClick={returnToCurrentMonth} disabled={showingCurrentMonth}><RotateCcw size={14} aria-hidden="true" />Mes actual</button></div>
                      {loadingCommon && <p className="form-status" role="status">Calculando coincidencias…</p>}
                      <div className="weekday-row" aria-hidden="true">{mondayFirstWeekdays.map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-days">{calendarDays.map((day) => { const windows = windowsByDay[day.isoDate] ?? []; const available = day.isCurrentMonth && !day.isPastOrToday && windows.length > 0; const selected = selectedDayIso === day.isoDate; return <button key={day.isoDate} type="button" className={`calendar-day${day.isCurrentMonth ? "" : " outside"}${available ? " available" : " unavailable"}${selected ? " selected" : ""}`} disabled={!available} aria-pressed={available ? selected : undefined} aria-label={`${formatFullDate(day.isoDate)}; ${available ? `${windows.length} coincidencias disponibles` : "sin coincidencias"}`} onClick={() => { setSelectedDayIso(day.isoDate); setDraft((current) => ({ ...current, window: null })); }}><span>{day.dayOfMonth}</span>{available && <i aria-hidden="true" />}</button>; })}</div>
                      {commonWindows.length === 0 && !loadingCommon && <p className="empty-common">No hay coincidencias este mes. Cada persona invitada debe agregar disponibilidad privada.</p>}
                    </div>
                    {selectedDayIso && <fieldset className="time-picker"><legend>Horarios del {formatFullDate(selectedDayIso)}</legend><div>{selectedWindows.map((window) => <label key={`${window.starts_at}-${window.ends_at}`} className="time-option"><input type="radio" name="common-window" checked={draft.window?.starts_at === window.starts_at} onChange={() => setDraft((current) => ({ ...current, window }))} /><span><Clock3 size={17} aria-hidden="true" /><strong>{timeLabel(window.starts_at)} — {timeLabel(window.ends_at)}</strong></span></label>)}</div></fieldset>}
                    <label className="field-label" htmlFor="duration">Duración propuesta</label><select className="flow-input" id="duration" value={draft.durationMinutes} onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: Number(event.target.value) }))}>{[30, 60, 90, 120, 180, 240].map((minutes) => <option key={minutes} value={minutes} disabled={Boolean(draft.window) && !supportsDuration(draft.window, minutes)}>{minutes < 60 ? `${minutes} minutos` : `${minutes / 60} ${minutes === 60 ? "hora" : "horas"}`}</option>)}</select>
                  </div>}

                  {stepIndex === 3 && <div className="step-content"><div className="step-icon" aria-hidden="true"><Check size={24} /></div><p className="step-count">PASO 4 DE 4 · REVISIÓN</p><h3 ref={stepHeadingRef} tabIndex={-1}>Revisa antes de enviar</h3><div className="review-summary"><p><strong>Plan</strong><span>{draft.idea}</span></p><p><strong>Personas</strong><span>{draft.inviteeIds.map((id) => members.find((member) => member.id === id)?.display_name).filter(Boolean).join(", ")}</span></p><p><strong>Lugar</strong><span>{placeMode === "specific" && draft.place.trim() ? draft.place : "Lo decidimos después"}</span></p><p><strong>Horario</strong><span>{draft.window ? `${dateTimeLabel(draft.window.starts_at)} · ${draft.durationMinutes} min` : "Sin elegir"}</span></p>{draft.details && <p><strong>Detalles</strong><span>{draft.details}</span></p>}</div><div className="immutability-note"><LockKeyhole size={18} aria-hidden="true" /><p><strong>Esta propuesta quedará congelada.</strong> Los cambios posteriores se agregan como sugerencias separadas.</p></div></div>}
                </div>
                <div className="flow-actions"><button type="button" className="back-button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex === 0 || submitting}>Atrás</button><p id="step-requirement">{!mayContinue() ? stepIndex === 0 ? "Escribe una idea e invita al menos a una persona para continuar." : "El horario debe cubrir toda la duración elegida." : stepIndex === 3 ? "Al enviar, todas las personas podrán responder." : "Puedes continuar."}</p><button className="flow-next-button" type="submit" disabled={!mayContinue() || submitting || groupBusy} aria-describedby="step-requirement">{submitting ? "Enviando…" : stepIndex === 3 ? "Enviar propuesta" : "Continuar"}<ArrowRight size={17} aria-hidden="true" /></button></div>
              </form>
            </section>
          </section>

          <section className="consensus-section" aria-labelledby="proposals-heading">
            <div className="consensus-copy"><p className="eyebrow">Propuestas del grupo</p><h2 id="proposals-heading">Una respuesta clara de cada persona</h2><p>La propuesta se confirma únicamente cuando todas las personas seleccionadas aceptan.</p></div>
            {proposals.length === 0 ? <div className="empty-proposals"><MessageSquarePlus size={28} aria-hidden="true" /><p>Aún no hay propuestas. Usa el flujo de arriba para enviar la primera.</p></div> : <div className="proposal-live-layout"><aside className="proposal-tabs" aria-label="Elegir propuesta">{proposals.map((proposal) => <button key={proposal.id} type="button" className={activeProposal?.id === proposal.id ? "active" : ""} onClick={() => setActiveProposalId(proposal.id)}><strong>{proposal.idea}</strong><small>{dateTimeLabel(proposal.starts_at)}</small></button>)}</aside><article className="consensus-card"><div className="consensus-card-top"><div><p className="tiny-label">PROPUESTA INMUTABLE</p><h3>{activeProposal?.idea}</h3></div><span className={`status-badge status-${activeProposal?.status}`}>{activeProposal?.status === "confirmed" ? "Confirmada" : activeProposal?.status === "declined" ? "Alguien no puede" : "Esperando respuestas"}</span></div>
              {activeProposal && <><dl className="proposal-facts"><div><dt>Horario</dt><dd>{dateTimeLabel(activeProposal.starts_at)} — {timeLabel(activeProposal.ends_at)}</dd></div><div><dt>Lugar</dt><dd>{activeProposal.place ?? "Lo decidimos después"}</dd></div>{activeProposal.details && <div><dt>Detalles</dt><dd>{activeProposal.details}</dd></div>}</dl><div className="acceptance-summary"><strong>{acceptedCount} de {activeParticipants.length} aceptaron</strong><progress value={acceptedCount} max={Math.max(activeParticipants.length, 1)} /></div><ul className="participant-status-list">{activeParticipants.map((participant) => { const member = members.find((item) => item.id === participant.user_id); return <li key={participant.user_id}><span className="avatar avatar-lilac">{initials(member?.display_name ?? "?")}</span><strong>{member?.display_name ?? "Integrante"}</strong><span>{participant.response === "accepted" ? "Aceptó" : participant.response === "declined" ? "No puede" : "Pendiente"}</span></li>; })}</ul>
                {realtimeError && <p className="form-status" role="status">{realtimeError} <button type="button" className="back-button" onClick={() => selectedGroupId && void loadGroupData(selectedGroupId)}>Actualizar ahora</button></p>}
                {myParticipant && <div className="response-actions"><p>Tu respuesta: <strong>{myParticipant.response === "accepted" ? "Aceptaste" : myParticipant.response === "declined" ? "No puedes" : "Pendiente"}</strong></p><button type="button" className="secondary-button" onClick={() => respond("accepted")} disabled={groupBusy}>Sí puedo</button><button type="button" className="back-button" onClick={() => respond("declined")} disabled={groupBusy}>No puedo</button></div>}
                <section className="suggestions-panel" aria-labelledby="suggestions-heading"><h4 id="suggestions-heading">Sugerencias después de enviar</h4><ul>{activeSuggestions.map((item) => <li key={item.id}><strong>{members.find((member) => member.id === item.user_id)?.display_name ?? "Integrante"}</strong><span>{item.message}</span></li>)}</ul><form onSubmit={addSuggestion}><label className="field-label" htmlFor="suggestion">Agregar una sugerencia</label><textarea className="flow-input flow-textarea" id="suggestion" value={suggestionText} onChange={(event) => setSuggestionText(event.target.value)} maxLength={1000} rows={3} /><button className="secondary-button" type="submit" disabled={!suggestionText.trim()}><MessageSquarePlus size={16} aria-hidden="true" />Agregar sin cambiar la propuesta</button></form></section></>}
            </article></div>}
          </section>
        </>
      )}
    </main>
  );
}
