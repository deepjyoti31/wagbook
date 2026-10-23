import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonStyles, Loading, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { ImportForm } from "./import-form";

export const generateMetadata = () => appTitle((m) => m.importing.title);

/** Bring in parents, pets and vaccinations from a spreadsheet (M47). Owners and managers. */
export default function ImportPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Import />
    </Suspense>
  );
}

async function Import() {
  const { canManage } = await requireOrg();
  if (!canManage) redirect("/app/more");
  const { m, language } = await getAppI18n();
  const w = m.importing;
  return (
    <>
      <PageTitle title={w.title} />
      <p className="mb-4 text-lg">{w.intro}</p>
      <p className="mb-6">
        {/* A file to save, not a page: a plain link. */}
        <a href="/app/more/import/template" download className={buttonStyles.secondary}>
          {w.template}
        </a>
        <span className="mt-1 block text-sm text-slate">{w.templateHint}</span>
      </p>
      <ImportForm words={w} language={language} />
    </>
  );
}
