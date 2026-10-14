import Link from "next/link";
import { monthName, shiftMonth, type YearMonth } from "@/lib/core";
import { buttonStyles } from "./ui";

/** The month a screen is about, with links to the month before and after. */
export function MonthPicker({ month, href, locale }: { month: YearMonth; href: (month: YearMonth) => string; locale: string }) {
  return (
    <nav aria-label="Month" className="mb-5 flex flex-wrap items-center gap-2">
      <p className="w-full text-xl font-bold sm:mr-auto sm:w-auto">{monthName(month, locale)}</p>
      <Link href={href(shiftMonth(month, -1))} className={`${buttonStyles.secondary} flex-1 sm:flex-none`}>
        Previous month
      </Link>
      <Link href={href(shiftMonth(month, 1))} className={`${buttonStyles.secondary} flex-1 sm:flex-none`}>
        Next month
      </Link>
    </nav>
  );
}
