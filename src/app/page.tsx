import Link from "next/link";
import { buttonStyles, DoorTag } from "@/components/ui";

/** The front door. Deliberately plain: it explains what Wagbook is and gets out of the way. */
export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <p className="mb-6">
        <DoorTag name="Wagbook" />
      </p>
      <h1 className="text-4xl font-extrabold leading-tight tracking-tight">The register for your kennel, on your phone.</h1>
      <p className="mt-5 max-w-prose text-lg text-slate">
        Take bookings without double-booking a kennel. Know who arrives and leaves today. Keep every dog&apos;s food, medicine and
        vaccinations in one place. Send updates from your own WhatsApp.
      </p>
      <p className="mt-3 max-w-prose text-lg text-slate">
        Wagbook is free and open source. Run it for one kennel or sixty.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/login" className={buttonStyles.primary}>
          Sign in
        </Link>
        <Link href="/login?mode=signup" className={buttonStyles.secondary}>
          Set up your kennel
        </Link>
      </div>
    </main>
  );
}
