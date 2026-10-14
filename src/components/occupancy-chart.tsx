import { formatDate, type OccupancyDay } from "@/lib/core";

/**
 * Pets in each day of a month as plain HTML bars, one per day. The top of the
 * chart is every kennel full. A day with more pets than kennels (pets booked
 * with no kennel) is drawn full and in red. Each bar says its numbers when
 * pointed at, and the same numbers are in a table below for anyone who
 * cannot see the bars.
 */
export function OccupancyChart({ days, locale }: { days: readonly OccupancyDay[]; locale: string }) {
  const capacity = Math.max(0, ...days.map((d) => d.capacity));
  const top = Math.max(capacity, ...days.map((d) => d.boarding + d.dayBoarding), 1);
  const text = (d: OccupancyDay) => {
    const pets = d.boarding + d.dayBoarding;
    const kinds = d.dayBoarding > 0 ? ` (${d.boarding} overnight, ${d.dayBoarding} for the day)` : "";
    return `${formatDate(d.day, locale)}: ${pets} ${pets === 1 ? "pet" : "pets"}${kinds}, ${d.capacity} kennels`;
  };

  return (
    <figure className="rounded-xl border border-rule bg-paper p-4">
      <figcaption className="mb-2 text-sm text-slate">Pets in each day. The top line is all {capacity} kennels full.</figcaption>
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
        <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">See each day</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-rule text-slate">
              <th className="py-1 font-semibold">Day</th>
              <th className="py-1 text-right font-semibold">Overnight</th>
              <th className="py-1 text-right font-semibold">For the day</th>
              <th className="py-1 text-right font-semibold">Kennels</th>
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
