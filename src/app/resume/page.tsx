import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { PageHead } from "@/components/ui";
import { requirePageUser } from "@/server/auth";
import { ResumeManager } from "@/components/ResumeManager";

export const metadata: Metadata = { title: "Résumé" };
export default async function ResumePage() {
  const user = await requirePageUser(["candidate"]);
  return (
    <Shell user={user}>
      <div className="wrap page">
        <PageHead title="Résumé" sub="PDF, DOCX or plain text, up to 5 MB. Your file is parsed, split by section and indexed so questions can cite it. Only you can retrieve from it." />
        <ResumeManager />
      </div>
    </Shell>
  );
}
