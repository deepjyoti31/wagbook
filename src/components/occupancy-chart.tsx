import { formatDate, type OccupancyDay } from "@/lib/core";
import { fill, plural, type Language } from "@/lib/i18n";
import type { Messages } from "@/messages";

/**
 * Pets in each day of a month as plain HTML bars, one per day. The top of the
 * chart is every kennel full. A day with more pets than kennels (pets booked
 * with no kennel) is drawn full and in red. Each bar says its numbers when
 * pointed at, and the same numbers are in a table below for anyone who
 * cannot see the bars. `words` is m.reports.chart.
 */
export function OccupancyChart({
  days,
  locale,
  language,
  words,
}: {
  days: readonly OccupancyDay[];
  locale: string;
  language: Language;
  words: Messages["reports"]["chart"];
}) {
  const capacity = Math.max(0, ...days.map((d) => d.capacity));
  const top = Math.max(capacity, ...days.map((d) => d.boarding + d.dayBoarding), 1);
  const text = (d: OccupancyDay) => {
    const vars = {
      date: formatDate(d.day, locale),
      pets: plural(language, d.boarding + d.dayBoarding, words.pets),
      overnight: d.boarding,
      forTheDay: d.dayBoarding,
      kennels: d.capacity,
    };
    return fill(d.dayBoarding > 0 ? words.dayWithKinds : words.day, vars);
  };

  return (
    <figure className="rounded-xl border border-rule bg-paper p-4">
      <figcaption className="mb-2 text-sm text-slate">{fill(words.caption, { n: capacity })}</figcaption>
      <div aria-hidden="true" className="relative h-40 border-t-2 border-dashed border-slate/60">
        <div className="flex h-full items-end gap-[2px] border-b border-rule">
          {days.map((d) => {
            const pets = d.boarding + d.dayBoarding;
            const over = d.capacity > 0 && pets > d.capacity;
            return (
              <div key={d.day} title={text(d)} className="flex h-full min-w-0 flex-1 items-end">
                <div
                  className={`w-full rounded-t-[2px] ${over ? "bg-alert" : "bg-ink"}`}
                  style={{ height: `${(Math.min(pets, top) / top) * 100}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div aria-hidden="true" className="mt-1 flex gap-[2px] text-xs text-slate">
        {days.map((d, i) => (
          <span key={d.day} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {i % 7 === 0 ? Number(d.day.slice(8)) : ""}
          </span>
        ))}
      </div>
      <details className="mt-3">
        <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{words.seeEachDay}</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-rule text-slate">
              <th className="py-1 font-semibold">{words.dayColumn}</th>
              <th className="py-1 text-right font-semibold">{words.overnight}</th>
              <th className="py-1 text-right font-semibold">{words.forTheDay}</th>
              <th className="py-1 text-right font-semibold">{words.kennels}</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day} className="border-b border-rule last:border-0">
                <td className="py-1">{formatDate(d.day, locale)}</td>
                <td className="py-1 text-right">{d.boarding}</td>
                <td className="py-1 text-right">{d.dayBoarding}</td>
                <td className="py-1 text-right">{d.capacity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
