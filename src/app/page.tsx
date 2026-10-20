import Link from "next/link";
import { PublicNav } from "@/components/Shell";
import { currentUser, homeFor } from "@/server/auth";

export default async function Landing() {
  const u = await currentUser();
  const cta = u ? { href: homeFor(u.role), label: "Open your workspace" } : { href: "/register", label: "Start a mock interview" };
  return (
    <>
      <PublicNav signedIn={!!u} home={u ? homeFor(u.role) : undefined} />
      <main id="main">
        <section className="tile tile-light tile-center">
          <div className="wrap">
            <h1 className="t-hero">Practice the interview you will actually get.</h1>
            <p className="t-lead" style={{ marginTop: 20 }}>Questions drawn from your résumé and the role. Answer by voice, camera or text. Feedback that points to your own words.</p>
            <div className="row" style={{ justifyContent: "center", marginTop: 28 }}>
              <Link className="btn" href={cta.href}>{cta.label}</Link>
              <Link className="btn btn-ghost" href="#how">See how it works</Link>
            </div>
            <div className="ui-frag product-shadow" data-ui style={{ maxWidth: 760, margin: "56px auto 0", padding: 28 }} aria-label="Sample interview screen">
              <p className="t-fine muted">Sample screen. Invented candidate.</p>
              <p className="t-section" style={{ margin: "10px 0 14px" }}>You cut checkout load time by 38 percent. What did you give up to get there?</p>
              <div className="notice" style={{ marginBottom: 14 }}>From your résumé, Experience: “Led the migration of a 400k-line checkout application from Redux to React Query.”</div>
              <div className="row"><span className="badge badge-ok">Microphone on</span><span className="badge">Captions on</span><span className="badge">Question 2 of 5</span></div>
            </div>
          </div>
        </section>

        <section id="how" className="tile tile-dark">
          <div className="wrap split">
            <div>
              <h2 className="t-display">Questions come from your résumé, not a template.</h2>
              <p className="t-lead muted" style={{ marginTop: 18 }}>Your résumé is split by section and indexed. Each question cites the lines it came from. When your résumé is silent on something, the interviewer asks you instead of guessing.</p>
            </div>
            <div className="ui-frag" data-ui style={{ padding: 24 }} aria-label="Sample evidence trail">
              <p className="t-fine muted">Sample evidence trail</p>
              <p className="t-caption" style={{ margin: "10px 0 4px", fontWeight: 600 }}>Retrieved from Experience</p>
              <p className="notice" style={{ marginBottom: 14 }}>Designed a component library used by 6 product teams, improving accessibility audit scores from 71 to 96.</p>
              <p className="t-caption" style={{ marginBottom: 4, fontWeight: 600 }}>Question generated</p>
              <p>How did you convince six teams to adopt the library, and how did you measure the audit gain?</p>
            </div>
          </div>
        </section>

        <section className="tile tile-parch">
          <div className="wrap">
            <h2 className="t-display" style={{ maxWidth: 760 }}>Voice, camera or plain text. Your choice, never penalised.</h2>
            <div className="grid grid-3" style={{ marginTop: 40 }}>
              <div className="card stack"><h3 className="t-tagline">Speak</h3><p className="muted">Live captions and a correctable transcript. If recognition gets a word wrong, edit it and your score is recalculated from your corrected words.</p></div>
              <div className="card stack"><h3 className="t-tagline">Type</h3><p className="muted">A full text mode for anyone who cannot or would rather not use audio or video. Same questions, same rubric.</p></div>
              <div className="card stack"><h3 className="t-tagline">Show up on camera</h3><p className="muted">Optional framing and lighting checks run in your browser. Video is never recorded or uploaded.</p></div>
            </div>
          </div>
        </section>

        <section className="tile tile-dark">
          <div className="wrap split">
            <div className="ui-frag" data-ui style={{ padding: 24 }} aria-label="Sample rating">
              <p className="t-fine muted">Sample rating. AI-assisted estimate.</p>
              <p className="t-section" style={{ margin: "8px 0" }}>Specificity 4 of 5</p>
              <p className="notice" style={{ marginBottom: 10 }}>“I raised accessibility concerns early and we agreed on measurable goals.”</p>
              <p className="t-caption muted">Missing: how the trade-off was decided. Try adding the alternative you rejected.</p>
            </div>
            <div>
              <h2 className="t-display">Scores you can check against your own words.</h2>
              <p className="t-lead muted" style={{ marginTop: 18 }}>Each rating shows the excerpt it rests on, what was missing, and how to improve. Scores come from the content of your answer only, they are labelled as AI-assisted, and a person can review them.</p>
            </div>
          </div>
        </section>

        <section className="tile tile-light">
          <div className="wrap split">
            <div>
              <h2 className="t-display">Monitoring that says what it saw, and nothing more.</h2>
              <p className="t-lead muted" style={{ marginTop: 18 }}>If you agree, the room records neutral facts like a hidden tab. Each one is labelled an unverified signal, shown to you, open to dispute, and never mixed into your score.</p>
            </div>
            <div className="ui-frag product-shadow" data-ui style={{ padding: 24 }} aria-label="Sample session event">
              <p className="t-fine muted">Sample session event</p>
              <p style={{ margin: "8px 0", fontWeight: 600 }}>Browser tab was hidden at 10:42:13 UTC for 8s.</p>
              <p className="t-caption muted">Unverified technical signal with many ordinary causes. Does not affect scores.</p>
            </div>
          </div>
        </section>

        <section className="tile tile-parch tile-center">
          <div className="wrap">
            <h2 className="t-display">Free while in preview.</h2>
            <p className="t-lead" style={{ marginTop: 16 }}>Recruiter workspaces and team plans are not priced yet. Candidates choose whether to share any interview.</p>
          </div>
        </section>

        <section className="tile tile-black tile-center on-dark">
          <div className="wrap">
            <h2 className="t-display">Your next interview is a practice run away.</h2>
            <div className="row" style={{ justifyContent: "center", marginTop: 28 }}><Link className="btn" href={cta.href}>{cta.label}</Link></div>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="wrap row" style={{ justifyContent: "space-between" }}>
          <span>Mockroom. AI-assisted practice, not a hiring decision.</span>
          <nav aria-label="Footer" className="row"><Link href="/privacy">Privacy and consent</Link><Link href="/sign-in">Sign in</Link></nav>
        </div>
      </footer>
    </>
  );
}
