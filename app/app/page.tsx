"use client";

import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  Lightbulb,
  LockKeyhole,
  MapPin,
  MessageSquarePlus,
  RotateCcw,
  Sparkles,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildMonthCalendar,
  formatFullDate,
  formatMonthLabel,
  formatShortDate,
  formatWeekday,
  getPrototypeAvailability,
  isoDateParts,
  localDateToIso,
  mondayFirstWeekdays,
  shiftMonth,
} from "../calendar";
import {
  addSuggestion,
  canContinue,
  createProposalSnapshot,
  hasUnanimousAcceptance,
  nextStepIndex,
  previousStepIndex,
  proposalSteps,
  slotForSelectedDate,
  type Proposal,
  type ProposalDraft,
  type Slot,
} from "../proposal-flow";

const people = [
  { name: "Leo", initials: "LE", color: "peach" },
  { name: "Rodo", initials: "RO", color: "lime" },
  { name: "Fer", initials: "FE", color: "lilac" },
] as const;

const stepLabels = ["Plan", "Lugar", "Horario", "Revisión"] as const;

const activityIdeas = ["Tomar un café", "Cenar sin prisas", "Salir a caminar", "Noche de juegos"];
const organizerName = "Leo";

export default function AppPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [todayIso] = useState(() => localDateToIso(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), monthIndex: now.getMonth() };
  });
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState<"later" | "specific">("later");
  const [draft, setDraft] = useState<ProposalDraft>({
    idea: "",
    place: "",
    details: "",
    organizer: organizerName,
    invitees: [],
    slot: null,
  });
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [suggestion, setSuggestion] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const consensusHeadingRef = useRef<HTMLHeadingElement>(null);
  const currentStep = proposalSteps[stepIndex];
  const todayParts = useMemo(() => isoDateParts(todayIso), [todayIso]);
  const calendarDays = useMemo(
    () => buildMonthCalendar(visibleMonth.year, visibleMonth.monthIndex, todayIso),
    [todayIso, visibleMonth],
  );
  const prototypeAvailability = useMemo(
    () => getPrototypeAvailability(visibleMonth.year, visibleMonth.monthIndex, todayIso),
    [todayIso, visibleMonth],
  );
  const selectedTimes = selectedDayIso
    ? prototypeAvailability[selectedDayIso] ?? []
    : [];
  const showingCurrentMonth =
    visibleMonth.year === todayParts.year &&
    visibleMonth.monthIndex === todayParts.monthIndex;
  const activeParticipants = proposal?.participants ?? [];
  const everyoneAccepted = hasUnanimousAcceptance(activeParticipants, accepted);
  const acceptedCount = activeParticipants.filter((name) => accepted[name]).length;
  const mayContinue = canContinue(currentStep, draft);
  const selectedParticipantNames = [draft.organizer, ...draft.invitees];

  const stepRequirement =
    currentStep === "plan"
      ? draft.idea.trim().length === 0 && draft.invitees.length === 0
        ? "Escribe una idea e invita al menos a una persona para continuar."
        : draft.idea.trim().length === 0
          ? "Escribe tu idea para continuar."
          : "Invita al menos a una persona para continuar."
      : currentStep === "time"
        ? "Elige un día y un horario en común para continuar."
        : "Completa este paso para continuar.";

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [stepIndex]);

  useEffect(() => {
    if (proposal) consensusHeadingRef.current?.focus();
  }, [proposal]);

  function changeMonth(offset: number) {
    setVisibleMonth((current) => shiftMonth(current.year, current.monthIndex, offset));
    setSelectedDayIso(null);
    setDraft((current) => ({ ...current, slot: null }));
  }

  function returnToCurrentMonth() {
    setVisibleMonth({ year: todayParts.year, monthIndex: todayParts.monthIndex });
    setSelectedDayIso(null);
    setDraft((current) => ({ ...current, slot: null }));
  }

  function chooseDay(isoDate: string) {
    if (!prototypeAvailability[isoDate]?.length) return;
    setSelectedDayIso(isoDate);
    setDraft((current) => ({
      ...current,
      slot: slotForSelectedDate(current.slot, isoDate),
    }));
  }

  function chooseTime(isoDate: string, value: string) {
    const time = prototypeAvailability[isoDate]?.find((item) => item.value === value);
    if (!time) return;

    const slot: Slot = {
      id: `${isoDate}-${time.value}`,
      isoDate,
      day: formatWeekday(isoDate),
      date: formatShortDate(isoDate),
      time: time.label,
      note: time.note,
    };
    setDraft((current) => ({ ...current, slot }));
  }

  function toggleInvitee(name: string) {
    setDraft((current) => ({
      ...current,
      invitees: current.invitees.includes(name)
        ? current.invitees.filter((invitee) => invitee !== name)
        : [...current.invitees, name],
    }));
  }

  function handleStepSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mayContinue) return;

    if (currentStep !== "review") {
      setStepIndex(nextStepIndex(stepIndex));
      return;
    }

    const snapshot = createProposalSnapshot(draft);
    if (!snapshot) return;

    setProposal(snapshot);
    setAccepted(
      Object.fromEntries(
        snapshot.participants.map((name) => [name, name === snapshot.participants[0]]),
      ),
    );
    setSuggestions([]);
    setSuggestion("");
  }

  function handleSuggestionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = suggestion.trim();
    if (!value) return;
    setSuggestions((current) => addSuggestion(current, value));
    setSuggestion("");
  }

  return (
    <main className="app-main">
      <nav className="topbar" aria-label="Navegación principal">
        <Link className="brand" href="/" aria-label="Ir a la portada de Somewhen">
          <span className="brand-mark" aria-hidden="true">
            <Heart size={16} fill="currentColor" />
          </span>
          somewhen
        </Link>
        <div className="demo-label">
          <Sparkles size={14} aria-hidden="true" />
          Prototipo interactivo · datos de ejemplo
        </div>
        <div className="app-topbar-actions">
          <Link className="topbar-link" href="/">Conocer Somewhen</Link>
          <div className="profile-chip" aria-label="Vista previa del perfil de Leo con sesión iniciada">
            <span className="avatar avatar-peach">LE</span>
            <span className="app-profile-name">Leo</span>
          </div>
        </div>
      </nav>

      <section className="group-section app-section" id="group-calendar" aria-labelledby="group-heading">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Nuevo plan</p>
            <h1 id="group-heading">Arma una propuesta</h1>
          </div>
          <div className="member-stack" aria-label="Integrantes del grupo: Leo, Rodo y Fer">
            {people.map((person) => (
              <span
                className={`avatar avatar-${person.color}`}
                key={person.name}
                title={person.name}
              >
                {person.initials}
              </span>
            ))}
            <span className="member-count">3 amigos</span>
          </div>
        </header>

        <div className="privacy-banner">
          <div className="privacy-icon" aria-hidden="true">
            <UsersRound size={21} />
          </div>
          <div>
            <strong>Solo verás los horarios que comparten las personas que invites.</strong>
            <p>Eso es todo lo que necesitas saber. Los calendarios privados siguen siendo privados.</p>
          </div>
        </div>

        <section className="journey-shell" aria-labelledby="proposal-flow-heading">
          <header className="journey-header">
            <div>
              <p className="tiny-label">ARMA EL PLAN PASO A PASO</p>
              <h2 id="proposal-flow-heading">Una decisión a la vez</h2>
            </div>
            <p>
              La propuesta se enviará solo después de que revises todos los detalles.
            </p>
          </header>

          <progress
            className="flow-progress"
            value={stepIndex + 1}
            max={proposalSteps.length}
            aria-label={`Paso ${stepIndex + 1} de ${proposalSteps.length}: ${stepLabels[stepIndex]}`}
          />

          <ol className="step-tracker" aria-label="Progreso de la propuesta">
            {stepLabels.map((label, index) => (
              <li
                key={label}
                className={`${index === stepIndex ? "current" : ""}${index < stepIndex ? " completed" : ""}`}
                aria-current={index === stepIndex ? "step" : undefined}
              >
                <span>{index < stepIndex ? <Check size={15} aria-hidden="true" /> : index + 1}</span>
                <small>{label}</small>
              </li>
            ))}
          </ol>

          <form className="guided-form" onSubmit={handleStepSubmit}>
            <div className="step-stage" aria-live="polite">
              {currentStep === "plan" && (
                <div className="step-content">
                  <div className="step-icon" aria-hidden="true"><Sparkles size={24} /></div>
                  <p className="step-count">PASO 1 DE 4 · PLAN E INVITADOS</p>
                  <h3 ref={stepHeadingRef} tabIndex={-1}>¿Qué plan quieres proponer?</h3>
                  <p>Cuéntalo con tus palabras. Puede ser una idea concreta o algo que todavía quieran terminar de armar juntos.</p>

                  <label className="field-label" htmlFor="plan-idea">Tu idea</label>
                  <textarea
                    className="flow-input flow-textarea plan-idea-input"
                    id="plan-idea"
                    value={draft.idea}
                    onChange={(event) => setDraft((current) => ({ ...current, idea: event.target.value }))}
                    placeholder="Por ejemplo, quiero que nos veamos para cocinar algo juntos"
                    autoComplete="off"
                    rows={4}
                    required
                  />

                  <details className="inspiration-disclosure">
                    <summary><Lightbulb size={16} aria-hidden="true" />Necesito inspiración</summary>
                    <div className="inspiration-options" aria-label="Ideas para inspirarte">
                      {activityIdeas.map((idea) => (
                        <button
                          key={idea}
                          type="button"
                          className="inspiration-chip"
                          onClick={() => setDraft((current) => ({ ...current, idea }))}
                        >
                          {idea}
                        </button>
                      ))}
                    </div>
                  </details>

                  <fieldset className="invitee-picker" aria-describedby="invitees-help">
                    <legend><UserPlus size={17} aria-hidden="true" />¿A quién quieres invitar?</legend>
                    <p id="invitees-help">Leo organiza este plan. Elige al menos a una persona del grupo.</p>
                    <div>
                      {people.filter((person) => person.name !== organizerName).map((person) => (
                        <label className="invitee-option" key={person.name}>
                          <input
                            type="checkbox"
                            checked={draft.invitees.includes(person.name)}
                            onChange={() => toggleInvitee(person.name)}
                          />
                          <span className={`avatar avatar-${person.color}`} aria-hidden="true">{person.initials}</span>
                          <span>{person.name}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <label className="field-label optional-field-label" htmlFor="plan-details">
                    Duración o detalles <span>(opcional)</span>
                  </label>
                  <textarea
                    className="flow-input flow-textarea"
                    id="plan-details"
                    value={draft.details}
                    onChange={(event) => setDraft((current) => ({ ...current, details: event.target.value }))}
                    placeholder="Por ejemplo, tenemos unas dos horas o podemos llevar algo"
                    rows={3}
                  />
                </div>
              )}

              {currentStep === "place" && (
                <div className="step-content">
                  <div className="step-icon" aria-hidden="true"><MapPin size={24} /></div>
                  <p className="step-count">PASO 2 DE 4 · LUGAR</p>
                  <h3 ref={stepHeadingRef} tabIndex={-1}>¿Quieren proponer un lugar?</h3>
                  <p>No hace falta resolver todo ahora. Pueden dejar el lugar abierto sin bloquear la propuesta.</p>

                  <fieldset className="place-mode-picker">
                    <legend>¿Cómo quieren decidirlo?</legend>
                    <label>
                      <input
                        type="radio"
                        name="place-mode"
                        value="later"
                        checked={placeMode === "later"}
                        onChange={() => {
                          setPlaceMode("later");
                          setDraft((current) => ({ ...current, place: "" }));
                        }}
                      />
                      <span><strong>Lo decidimos después</strong><small>Esta es la opción predeterminada.</small></span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="place-mode"
                        value="specific"
                        checked={placeMode === "specific"}
                        onChange={() => setPlaceMode("specific")}
                      />
                      <span><strong>Quiero proponer un lugar</strong><small>Escríbelo con el nivel de detalle que tengas.</small></span>
                    </label>
                  </fieldset>

                  {placeMode === "specific" && (
                    <>
                      <label className="field-label" htmlFor="plan-place">Lugar propuesto</label>
                      <div className="flow-input-with-icon">
                        <MapPin size={18} aria-hidden="true" />
                        <input
                          className="flow-input"
                          id="plan-place"
                          value={draft.place}
                          onChange={(event) => setDraft((current) => ({ ...current, place: event.target.value }))}
                          placeholder="Por ejemplo, el parque cerca de casa"
                          autoComplete="off"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {currentStep === "time" && (
                <div className="step-content wide-step">
                  <div className="step-icon" aria-hidden="true"><CalendarDays size={24} /></div>
                  <p className="step-count">PASO 3 DE 4 · HORARIO EN COMÚN</p>
                  <h3 ref={stepHeadingRef} tabIndex={-1}>¿Cuándo pueden todos?</h3>
                  <p>Solo mostramos los momentos libres que comparten las personas invitadas. Ninguna agenda privada queda expuesta.</p>

                  <div className="sample-calendar-note">
                    <Sparkles size={16} aria-hidden="true" />
                    <span><strong>Disponibilidad de ejemplo.</strong> Estas coincidencias son datos del prototipo.</span>
                  </div>

                  <div className="month-calendar" aria-labelledby="calendar-month-heading">
                    <div className="calendar-toolbar">
                      <button
                        type="button"
                        className="calendar-nav-button"
                        onClick={() => changeMonth(-1)}
                        aria-label="Ver el mes anterior"
                      >
                        <ChevronLeft size={20} aria-hidden="true" />
                      </button>
                      <h4 id="calendar-month-heading">
                        {formatMonthLabel(visibleMonth.year, visibleMonth.monthIndex)}
                      </h4>
                      <button
                        type="button"
                        className="calendar-nav-button"
                        onClick={() => changeMonth(1)}
                        aria-label="Ver el mes siguiente"
                      >
                        <ChevronRight size={20} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="current-month-button"
                        onClick={returnToCurrentMonth}
                        disabled={showingCurrentMonth}
                        aria-label="Volver al mes actual"
                      >
                        <RotateCcw size={14} aria-hidden="true" />
                        Mes actual
                      </button>
                    </div>

                    <div className="weekday-row" aria-hidden="true">
                      {mondayFirstWeekdays.map((day) => <span key={day}>{day}</span>)}
                    </div>

                    <div className="calendar-days">
                      {calendarDays.map((day) => {
                        const times = prototypeAvailability[day.isoDate] ?? [];
                        const isAvailable =
                          day.isCurrentMonth && !day.isPastOrToday && times.length > 0;
                        const isSelected = selectedDayIso === day.isoDate;
                        const availabilityLabel = !day.isCurrentMonth
                          ? "fuera del mes mostrado"
                          : day.isToday
                            ? "hoy; no disponible para propuestas"
                            : day.isPastOrToday
                              ? "fecha pasada; no disponible"
                              : isAvailable
                                ? `${times.length} horarios en común disponibles`
                                : "sin horarios en común";

                        return (
                          <button
                            key={day.isoDate}
                            type="button"
                            className={`calendar-day${day.isCurrentMonth ? "" : " outside"}${day.isToday ? " today" : ""}${isAvailable ? " available" : " unavailable"}${isSelected ? " selected" : ""}`}
                            disabled={!isAvailable}
                            aria-pressed={isAvailable ? isSelected : undefined}
                            aria-label={`${formatFullDate(day.isoDate)}; ${availabilityLabel}`}
                            onClick={() => chooseDay(day.isoDate)}
                          >
                            <span>{day.dayOfMonth}</span>
                            {isAvailable && <i aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="calendar-legend" aria-label="Referencias del calendario">
                      <span><i className="legend-dot available" aria-hidden="true" />Con horario en común</span>
                      <span><i className="legend-ring" aria-hidden="true" />Hoy</span>
                    </div>
                  </div>

                  {selectedDayIso ? (
                    <fieldset className="time-options">
                      <legend>Horarios en común para {formatFullDate(selectedDayIso)}</legend>
                      <div>
                        {selectedTimes.map((time) => {
                          const timeId = `${selectedDayIso}-${time.value}`;
                          const isSelected = draft.slot?.id === timeId;
                          return (
                            <button
                              key={time.value}
                              type="button"
                              className={`time-option${isSelected ? " selected" : ""}`}
                              aria-pressed={isSelected}
                              onClick={() => chooseTime(selectedDayIso, time.value)}
                            >
                              <Clock3 size={17} aria-hidden="true" />
                              <span><strong>{time.label}</strong><small>{time.note}</small></span>
                              {isSelected && <Check size={16} aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : (
                    <p className="calendar-prompt">Elige un día marcado para ver los horarios que comparten.</p>
                  )}
                </div>
              )}

              {currentStep === "review" && draft.slot && (
                <div className="step-content review-step">
                  <div className="step-icon" aria-hidden="true"><Heart size={24} /></div>
                  <p className="step-count">PASO 4 DE 4 · REVISIÓN</p>
                  <h3 ref={stepHeadingRef} tabIndex={-1}>Revisa la propuesta antes de enviarla</h3>
                  <p>Estos son los detalles exactos que recibirán las personas que invitaste.</p>

                  <dl className="review-card">
                    <div>
                      <dt>Plan</dt>
                      <dd>{draft.idea}</dd>
                    </div>
                    <div>
                      <dt>Lugar</dt>
                      <dd>{draft.place.trim() || "Lo decidimos después"}</dd>
                    </div>
                    <div>
                      <dt>Día y hora</dt>
                      <dd>{draft.slot.day}, {draft.slot.date} · {draft.slot.time}</dd>
                    </div>
                    <div>
                      <dt>Participantes</dt>
                      <dd>{selectedParticipantNames.join(", ")}</dd>
                    </div>
                    <div>
                      <dt>Duración o detalles</dt>
                      <dd>{draft.details.trim() || "Sin detalles adicionales"}</dd>
                    </div>
                  </dl>

                  <div className="consent-note">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <span><strong>Nada se confirma al enviar.</strong> El plan será real solo cuando todas las personas invitadas y quien organiza acepten esta misma propuesta.</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flow-actions">
              {stepIndex > 0 ? (
                <button
                  className="back-button"
                  type="button"
                  onClick={() => setStepIndex(previousStepIndex(stepIndex))}
                >
                  Volver
                </button>
              ) : <span aria-hidden="true" />}
              <div>
                {!mayContinue && <p id="step-requirement">{stepRequirement}</p>}
                <button
                  className="primary-button flow-primary"
                  type="submit"
                  disabled={!mayContinue}
                  aria-describedby={!mayContinue ? "step-requirement" : undefined}
                >
                  {currentStep === "review" ? "Enviar propuesta" : "Continuar"}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          </form>
        </section>
      </section>

      <section
        className={`consensus-section${proposal ? " visible" : ""}`}
        aria-labelledby="consensus-heading"
        aria-live="polite"
      >
        {proposal && (
          <>
            <div className="consensus-copy">
              <p className="eyebrow">Propuesta enviada</p>
              <h2 id="consensus-heading" ref={consensusHeadingRef} tabIndex={-1}>{proposal.name}</h2>
              <p>
                {proposal.slot.day}, {proposal.slot.date} a las {proposal.slot.time}<br />
                {proposal.place}
                {proposal.details && <><br />{proposal.details}</>}
              </p>
            </div>

            <div className="response-card">
              <div className="response-summary">
                <span>{acceptedCount} de {proposal.participants.length} aceptaron</span>
                <strong>{everyoneAccepted ? "¡El plan está listo!" : "Esperando a todos"}</strong>
              </div>
              <ul className="response-list">
                {people.filter((person) => proposal.participants.includes(person.name)).map((person) => {
                  const hasAccepted = accepted[person.name];
                  return (
                    <li key={person.name}>
                      <span className={`avatar avatar-${person.color}`}>{person.initials}</span>
                      <span className="person-name">{person.name}</span>
                      <span className={`status-pill ${hasAccepted ? "accepted" : "pending"}`}>
                        {hasAccepted ? <Check size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
                        {hasAccepted ? "Aceptó" : "Pendiente"}
                      </span>
                      {!hasAccepted && (
                        <button
                          className="simulate-button"
                          type="button"
                          onClick={() => setAccepted((current) => ({ ...current, [person.name]: true }))}
                          aria-label={`Simular que ${person.name} acepta esta propuesta`}
                        >
                          Simular aceptación
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className={`confirmation-banner ${everyoneAccepted ? "confirmed" : "waiting"}`}>
                {everyoneAccepted ? (
                  <>
                    <span className="confirmation-check"><Check size={18} aria-hidden="true" /></span>
                    <span><strong>Confirmado por todos</strong>Ahora aparece en el calendario compartido.</span>
                  </>
                ) : (
                  <>
                    <Clock3 size={19} aria-hidden="true" />
                    <span><strong>Aún no está confirmado</strong>El horario sigue siendo una propuesta hasta que todos acepten.</span>
                  </>
                )}
              </div>
              {!everyoneAccepted && (
                <p className="prototype-helper">Los controles del prototipo te permiten ver la respuesta de cada amigo.</p>
              )}

              <form className="suggestion-form" onSubmit={handleSuggestionSubmit}>
                <div className="suggestion-heading">
                  <MessageSquarePlus size={18} aria-hidden="true" />
                  <label htmlFor="proposal-suggestion">Comentar o sugerir otra opción</label>
                </div>
                <p id="suggestion-help">Las sugerencias se muestran aparte y no cambian la propuesta enviada.</p>
                <div>
                  <input
                    id="proposal-suggestion"
                    value={suggestion}
                    onChange={(event) => setSuggestion(event.target.value)}
                    aria-describedby="suggestion-help"
                    placeholder="Por ejemplo, también podría ser media hora más tarde"
                    required
                  />
                  <button type="submit">Añadir</button>
                </div>
              </form>

              {suggestions.length > 0 && (
                <div className="suggestion-list" aria-live="polite">
                  <strong>Sugerencias</strong>
                  <ul>
                    {suggestions.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <footer>
        <span className="brand footer-brand"><Heart size={14} fill="currentColor" aria-hidden="true" /> somewhen</span>
        <Link className="footer-link" href="/">Volver a la portada</Link>
      </footer>
    </main>
  );
}
