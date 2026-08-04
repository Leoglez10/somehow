export type CalendarDay = {
  isoDate: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPastOrToday: boolean;
};

export type PrototypeTime = {
  value: string;
  label: string;
  note: string;
};

export const mondayFirstWeekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toIsoDate(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function localDateToIso(date: Date) {
  return toIsoDate(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isoDateParts(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, monthIndex: month - 1, day };
}

function utcDateFromIso(isoDate: string) {
  const { year, monthIndex, day } = isoDateParts(isoDate);
  return new Date(Date.UTC(year, monthIndex, day));
}

export function shiftMonth(year: number, monthIndex: number, offset: number) {
  const shifted = new Date(Date.UTC(year, monthIndex + offset, 1));
  return { year: shifted.getUTCFullYear(), monthIndex: shifted.getUTCMonth() };
}

export function buildMonthCalendar(
  year: number,
  monthIndex: number,
  todayIso: string,
): CalendarDay[] {
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const leadingDays = (firstWeekday + 6) % 7;
  const gridStart = new Date(Date.UTC(year, monthIndex, 1 - leadingDays));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    const isoDate = toIsoDate(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    );

    return {
      isoDate,
      dayOfMonth: date.getUTCDate(),
      isCurrentMonth:
        date.getUTCFullYear() === year && date.getUTCMonth() === monthIndex,
      isToday: isoDate === todayIso,
      isPastOrToday: isoDate <= todayIso,
    };
  });
}

export function getPrototypeAvailability(
  year: number,
  monthIndex: number,
  todayIso: string,
) {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const availability: Record<string, PrototypeTime[]> = {};

  for (let day = 1; day <= daysInMonth; day += 1) {
    const isoDate = toIsoDate(year, monthIndex, day);
    if (isoDate <= todayIso) continue;

    const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
    const hasSharedTime = weekday === 5 || weekday === 6 || day % 4 === 0;
    if (!hasSharedTime) continue;

    availability[isoDate] =
      weekday === 0 || weekday === 6
        ? [
            { value: "11:30", label: "11:30 a. m.", note: "Una mañana sin prisas" },
            { value: "18:00", label: "6:00 p. m.", note: "Una tarde tranquila" },
          ]
        : [
            { value: "19:30", label: "7:30 p. m.", note: "Después del día" },
            { value: "20:30", label: "8:30 p. m.", note: "Una noche libre" },
          ];
  }

  return availability;
}

const fullDateFormatter = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const weekdayFormatter = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  timeZone: "UTC",
});

const shortDateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const monthFormatter = new Intl.DateTimeFormat("es-MX", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatFullDate(isoDate: string) {
  return fullDateFormatter.format(utcDateFromIso(isoDate));
}

export function formatWeekday(isoDate: string) {
  const label = weekdayFormatter.format(utcDateFromIso(isoDate));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatShortDate(isoDate: string) {
  return shortDateFormatter.format(utcDateFromIso(isoDate)).replace(/\.$/, "");
}

export function formatMonthLabel(year: number, monthIndex: number) {
  const label = monthFormatter.format(new Date(Date.UTC(year, monthIndex, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}
