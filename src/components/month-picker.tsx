import Link from "next/link";
import { monthName, shiftMonth, type YearMonth } from "@/lib/core";
import type { Messages } from "@/messages";
import { buttonStyles } from "./ui";

/** The month a screen is about, with links to the month before and after. `words` is m.common. */
export function MonthPicker({
  month,
  href,
  locale,
  words,
}: {
  month: YearMonth;
  href: (month: YearMonth) => string;
  locale: string;
  words: Pick<Messages["common"], "month" | "previousMonth" | "nextMonth">;
}) {
  return (
    <nav aria-label={words.month} className="mb-5 flex flex-wrap items-center gap-2">
      <p className="w-full text-xl font-bold sm:mr-auto sm:w-auto">{monthName(month, locale)}</p>
      <Link href={href(shiftMonth(month, -1))} className={`${buttonStyles.secondary} flex-1 sm:flex-none`}>
        {words.previousMonth}
      </Link>
      <Link href={href(shiftMonth(month, 1))} className={`${buttonStyles.secondary} flex-1 sm:flex-none`}>
        {words.nextMonth}
      </Link>
    </nav>
  );
}
