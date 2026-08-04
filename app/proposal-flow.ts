export type Slot = {
  id: string;
  isoDate: string;
  day: string;
  date: string;
  time: string;
  note: string;
};

export function slotForSelectedDate(slot: Slot | null, isoDate: string) {
  return slot?.isoDate === isoDate ? slot : null;
}

export type ProposalDraft = {
  idea: string;
  place: string;
  details: string;
  organizer: string;
  invitees: string[];
  slot: Slot | null;
};

export type Proposal = Readonly<{
  name: string;
  place: string;
  details: string;
  participants: readonly string[];
  slot: Readonly<Slot>;
}>;

export const proposalSteps = ["plan", "place", "time", "review"] as const;

export type ProposalStep = (typeof proposalSteps)[number];

function proposalParticipantNames(draft: ProposalDraft) {
  const organizer = draft.organizer.trim();
  const invitees = draft.invitees
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name !== organizer);
  return [organizer, ...new Set(invitees)].filter(Boolean);
}

export function canContinue(step: ProposalStep, draft: ProposalDraft) {
  if (step === "plan") {
    return draft.idea.trim().length > 0 && proposalParticipantNames(draft).length > 1;
  }
  if (step === "place") return true;
  if (step === "time") return draft.slot !== null;
  return (
    draft.idea.trim().length > 0 &&
    proposalParticipantNames(draft).length > 1 &&
    draft.slot !== null
  );
}

export function nextStepIndex(currentIndex: number) {
  return Math.min(currentIndex + 1, proposalSteps.length - 1);
}

export function previousStepIndex(currentIndex: number) {
  return Math.max(currentIndex - 1, 0);
}

export function createProposalSnapshot(draft: ProposalDraft): Proposal | null {
  if (!proposalSteps.every((step) => canContinue(step, draft)) || !draft.slot) {
    return null;
  }

  const slot = Object.freeze({ ...draft.slot });
  const participants = Object.freeze(proposalParticipantNames(draft));
  return Object.freeze({
    name: draft.idea.trim(),
    place: draft.place.trim() || "Lo decidimos después",
    details: draft.details.trim(),
    participants,
    slot,
  });
}

export function hasUnanimousAcceptance(
  participantNames: readonly string[],
  accepted: Readonly<Record<string, boolean>>,
) {
  return participantNames.length > 0 && participantNames.every((name) => accepted[name] === true);
}

export function addSuggestion(current: readonly string[], value: string) {
  const suggestion = value.trim();
  return suggestion ? [...current, suggestion] : [...current];
}
