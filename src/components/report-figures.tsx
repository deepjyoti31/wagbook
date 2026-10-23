import { formatKg, type StayReport } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import type { I18n } from "@/lib/i18n-server";
import { incidentCategoryText } from "@/lib/pets";
import type { Enums } from "@/lib/supabase/database.types";

/** The stay report's figures in words, for staff and for the parent's stay page (M53). */
export function ReportFigures({ m, language, locale, kind, report }: Pick<I18n, "m" | "language" | "locale"> & { kind: Enums<"booking_kind">; report: StayReport }) {
  const w = m.stayReport;
  const units = plural(language, report.units, kind === "boarding" ? w.nights : w.days);
  return (
    <ul className="space-y-1">
      <li className="font-semibold">{units}</li>
      <li>{report.meals.offered > 0 ? fill(w.meals, { eaten: report.meals.eaten, offered: report.meals.offered }) : w.noMeals}</li>
      {report.medicines.map((med) => (
        <li key={med.label}>{fill(w.medicine, { label: med.label, given: med.given, due: med.due })}</li>
      ))}
      <li>{report.play > 0 ? plural(language, report.play, w.play) : w.noPlay}</li>
      {report.weightIn !== null ? (
        <li>
          {report.weightOut !== null
            ? fill(w.weight, { in: formatKg(report.weightIn, locale), out: formatKg(report.weightOut, locale) })
            : fill(w.weightIn, { in: formatKg(report.weightIn, locale) })}
        </li>
      ) : null}
      <li>
        {report.incidents.length > 0
          ? fill(w.incidents, { list: report.incidents.map((i) => `${incidentCategoryText(m, i.category)}${i.count > 1 ? ` (${i.count})` : ""}`).join(", ") })
          : w.noIncidents}
      </li>
    </ul>
  );
}
