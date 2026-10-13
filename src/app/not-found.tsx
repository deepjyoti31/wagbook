import Link from "next/link";
import { buttonStyles } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">This page does not exist</h1>
      <p className="mt-3 text-lg text-slate">The link may be mistyped, or it may have been switched off. If a kennel sent it to you, ask them for a new one.</p>
      <Link href="/" className={`${buttonStyles.secondary} mt-6`}>
        Go to the start
      </Link>
    </main>
  );
}
