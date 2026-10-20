import type { Metadata } from "next";
import { PublicNav } from "@/components/Shell";
import { currentUser, homeFor } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { POLICY_VERSION } from "@/server/env";

export const metadata: Metadata = { title: "Privacy and consent" };
export default async function Privacy() {
  const u = await currentUser();
  const s = getSettings();
  return (
    <>
      <PublicNav signedIn={!!u} home={u ? homeFor(u.role) : undefined} />
      <main id="main" className="app-bg">
        <div className="wrap" style={{ maxWidth: 760, padding: "56px 22px 96px" }}>
          <h1 className="t-display">Privacy and consent</h1>
          <p className="muted" style={{ marginTop: 8 }}>Policy version {POLICY_VERSION}. This describes what the software does; your deployment must add its own legal terms.</p>
          <div className="stack-lg" style={{ marginTop: 32 }}>
            <section className="card stack"><h2 className="section-title">What we process</h2>
              <p>Your résumé text, your answers, and the transcript of your interview. If a live AI provider is configured, the question, your answer and short résumé excerpts are sent to that provider to generate questions and feedback. The interview screen names the provider before you start. In demo mode nothing leaves this server.</p></section>
            <section className="card stack"><h2 className="section-title">Camera and microphone are optional</h2>
              <p>You can complete every interview with text only. Declining camera or microphone never lowers a score. Audio sent for transcription is processed in memory and is not stored. Video is never recorded or uploaded: optional camera checks (is the camera on, is the picture dark, is the image frozen) run in your browser, and only a neutral event such as “The camera image was dark at 10:42:13 UTC for 8s” is saved, and only if you agree.</p></section>
            <section className="card stack"><h2 className="section-title">Session monitoring is limited and disclosed</h2>
              <p>If you consent, the interview records neutral technical events: the browser tab was hidden, the window lost focus, the connection dropped, and optionally fullscreen exits or paste actions (length only, never content). These signals have many ordinary causes. They are labelled unverified, never change your scores, and never reject or rank you. You can see every record and contest it.</p></section>
            <section className="card stack"><h2 className="section-title">AI-assisted assessment and human review</h2>
              <p>Scores are AI-assisted estimates based only on the words of your answers. They are not objective measurements. Accent, speech recognition errors, connection quality, camera availability and appearance are never scored. {s.humanReviewRequired ? "This deployment requires review by a qualified person before any decision that affects you." : "Decisions that affect you should involve review by a qualified person."}</p></section>
            <section className="card stack"><h2 className="section-title">Retention and your rights</h2>
              <p>Résumés are kept for {s.retention.resumeDays} days, transcripts for {s.retention.transcriptDays} days, and reports for {s.retention.derivedDays} days unless you delete them sooner. From Settings you can export everything held about you or delete your account, résumés, vectors, interviews and records.</p></section>
            <section className="card stack"><h2 className="section-title">Sharing</h2>
              <p>Recruiters see an interview only if you choose an organization when creating it and approve sharing. You can withdraw sharing at any time from the results page.</p></section>
          </div>
        </div>
      </main>
    </>
  );
}
