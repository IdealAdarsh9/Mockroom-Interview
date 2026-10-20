import type { ReactNode } from "react";
import { ScoreBar, fmtScore } from "./ui";
import { when } from "@/lib/api";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Renders a stored report. Performance and session events are in separate sections on purpose: events are never scored. */
export function ReportView({ data, transcript, reviewSlot, eventsSlot }: { data: { session: any; report: any; sessionEvents: any[] }; transcript?: { speaker: string; text: string; atMs: number; corrected: boolean }[]; reviewSlot?: (evaluationId: string, current: { humanScore: number | null; humanNote: string | null }) => ReactNode; eventsSlot?: (e: any) => ReactNode }) {
  const r = data.report;
  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  return (
    <div className="stack-lg">
      <div className="notice notice-info" role="note">
        <strong>AI-assisted assessment{r.demoMode ? " (demo simulation, not a live model)" : ""}.</strong> {r.notices?.join(" ")}
      </div>

      <section className="card stack" aria-labelledby="sum-h">
        <h2 id="sum-h" className="section-title">Summary</h2>
        <div className="row" style={{ alignItems: "baseline", gap: 24 }}>
          <div><div className="t-hero num" style={{ lineHeight: 1 }}>{fmtScore(r.overall)}<span className="muted" style={{ fontSize: 22 }}> / 5</span></div><p className="muted t-caption">Overall rating, AI-assisted estimate</p></div>
          <p className="muted">{r.answered} answered · {r.skipped} skipped · {r.primaryQuestions} main questions</p>
        </div>
        {r.summary ? <p>{r.summary} <span className="badge">{r.summaryProvider === "mock" ? "Demo summary" : "AI-generated summary"}</span></p> : r.summaryError && <p className="notice notice-warn">{r.summaryError}</p>}
      </section>

      <section className="card stack" aria-labelledby="comp-h">
        <h2 id="comp-h" className="section-title">Competencies</h2>
        <div>{r.competencies.map((c: any) => <ScoreBar key={c.key} label={c.name} score={c.score} note={c.questions ? `(${c.questions} question${c.questions > 1 ? "s" : ""})` : "(not asked)"} />)}</div>
        {r.dimensions?.length > 0 && <><h3 className="t-tagline" style={{ marginTop: 12 }}>Rubric dimensions</h3><div>{r.dimensions.map((d: any) => <ScoreBar key={d.key} label={d.name} score={d.score} />)}</div></>}
        <p className="hint">Scale: 1 little evidence, 3 adequate with gaps, 5 strong and specific. Based only on the words of your answers.</p>
      </section>

      <div className="grid grid-2">
        <section className="card stack" aria-labelledby="str-h"><h2 id="str-h" className="section-title">Strengths shown in your answers</h2>
          {r.strengths.length ? <ul className="stack" style={{ paddingLeft: 18, margin: 0 }}>{r.strengths.map((s: any, i: number) => <li key={i}>{s.text}{s.quote && <p className="muted t-caption">“{s.quote}” (question {s.questionOrdinal})</p>}</li>)}</ul> : <p className="muted">No standout strengths were identified with enough evidence.</p>}</section>
        <section className="card stack" aria-labelledby="imp-h"><h2 id="imp-h" className="section-title">Areas to improve</h2>
          {r.improvements.length ? <ul className="stack" style={{ paddingLeft: 18, margin: 0 }}>{r.improvements.map((s: any, i: number) => <li key={i}>{s.text} <span className="muted t-caption">(question {s.questionOrdinal})</span></li>)}</ul> : <p className="muted">Nothing flagged.</p>}</section>
      </div>

      <section className="card stack" aria-labelledby="qq-h">
        <h2 id="qq-h" className="section-title">Question by question</h2>
        <div className="stack-lg">
          {r.questions.map((x: any) => (
            <article key={x.questionId} className="card-tint stack" aria-labelledby={`q-${x.ordinal}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 id={`q-${x.ordinal}`} className="t-tagline">{x.ordinal}. {x.question}</h3>
                <div className="row"><span className="badge">{x.kind === "follow_up" ? "Follow-up" : x.competencyName}</span>{x.evaluation && <span className="badge badge-ok num">{fmtScore(x.evaluation.score)} / 5</span>}</div>
              </div>
              {x.evidence.length > 0 && <div className="notice"><strong>Résumé evidence behind this question</strong>{x.evidence.map((e: any) => <p key={e.chunkId} className="t-caption" style={{ marginTop: 4 }}>{e.available ? <><span className="badge">{e.section}</span> {e.excerpt}</> : "The résumé passage was removed."}</p>)}</div>}
              <div><p className="label">Your answer {x.corrected && <span className="badge badge-ok">Corrected transcript</span>}</p><p style={{ whiteSpace: "pre-wrap" }}>{x.skipped ? <span className="muted">Skipped</span> : x.answer || <span className="muted">No answer</span>}</p></div>
              {x.evaluation ? (
                <div className="stack">
                  <p>{x.evaluation.explanation}</p>
                  {x.evaluation.humanScore !== null && <p className="notice notice-info">A reviewer set this to {x.evaluation.humanScore}/5 (AI estimate was {x.evaluation.aiScore}). {x.evaluation.humanNote}</p>}
                  {x.evaluation.excerpts.length > 0 && <div><p className="label">Supporting excerpts</p><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{x.evaluation.excerpts.map((e: any, i: number) => <li key={i}>“{e.quote}” <span className="muted t-caption">supports {e.supports}</span></li>)}</ul></div>}
                  <div className="grid grid-2">
                    {x.evaluation.missingEvidence.length > 0 && <div><p className="label">Missing or unclear</p><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{x.evaluation.missingEvidence.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul></div>}
                    {x.evaluation.suggestions.length > 0 && <div><p className="label">To improve</p><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{x.evaluation.suggestions.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul></div>}
                  </div>
                  <details><summary className="t-caption">Dimension scores and uncertainty</summary>
                    <div style={{ marginTop: 8 }}>{x.evaluation.dimensions.map((d: any) => <ScoreBar key={d.key} label={d.name} score={d.score} />)}</div>
                    {x.evaluation.uncertainty && <p className="hint">Uncertainty: {x.evaluation.uncertainty}</p>}
                    <p className="hint">{x.evaluation.kind === "mock_heuristic" ? "Produced by the built-in demo heuristic." : `AI-assisted by ${x.evaluation.provider}.`}</p></details>
                  {reviewSlot?.(x.evaluation.id, { humanScore: x.evaluation.humanScore, humanNote: x.evaluation.humanNote })}
                </div>
              ) : x.answered && !x.skipped ? <p className="notice notice-warn">This answer could not be rated yet.</p> : null}
            </article>
          ))}
        </div>
      </section>

      {r.practiceQuestions?.length > 0 && <section className="card stack"><h2 className="section-title">Practice next</h2><ul style={{ margin: 0, paddingLeft: 18 }}>{r.practiceQuestions.map((p: string, i: number) => <li key={i}>{p}</li>)}</ul></section>}

      <section className="card stack" aria-labelledby="al-h">
        <h2 id="al-h" className="section-title">Résumé to role overlap</h2>
        {r.alignment.available ? (<>
          <p><span className="num" style={{ fontWeight: 600 }}>{r.alignment.coveragePct}%</span> of the job description&apos;s key terms appear in your résumé.</p>
          <div className="scroll-x"><table className="data"><thead><tr><th>Term</th><th>Where it appears</th></tr></thead><tbody>{r.alignment.items.map((i: any) => <tr key={i.keyword}><td>{i.keyword}</td><td>{i.evidence ? <><span className="badge">{i.evidence.section}</span> {i.evidence.line}</> : <span className="muted">Not found in the résumé</span>}</td></tr>)}</tbody></table></div>
          <p className="hint">{r.alignment.note}</p></>) : <p className="muted">{r.alignment.reason}</p>}
      </section>

      <section className="card stack" aria-labelledby="ev-h">
        <h2 id="ev-h" className="section-title">Session technical events</h2>
        <p className="notice">These are unverified technical signals recorded with consent. They have many ordinary causes, are <strong>not</strong> evidence of misconduct, and are <strong>not</strong> part of any score above.</p>
        {data.sessionEvents.length === 0 ? <p className="muted">No events were recorded.</p> : (
          <ul className="list-rows" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.sessionEvents.map((e: any) => (
              <li key={e.id}><p>{e.observation}</p><p className="hint">{e.interpretation}</p>
                {e.disputed && <p className="badge badge-warn">Contested by the candidate{e.disputeNote ? `: ${e.disputeNote}` : ""}</p>}
                {eventsSlot?.(e)}</li>
            ))}
          </ul>
        )}
      </section>

      {transcript && (
        <section className="card stack" aria-labelledby="tx-h"><h2 id="tx-h" className="section-title">Transcript</h2>
          <div className="stack">{transcript.map((s, i) => <p key={i}><span className="num muted t-caption">{mmss(s.atMs)}</span> <strong>{s.speaker === "ai" ? "Interviewer" : "You"}:</strong> {s.text} {s.corrected && <span className="badge badge-ok">Corrected</span>}</p>)}</div></section>
      )}
      <p className="muted t-caption">Report generated {when(r.generatedAt)}.</p>
    </div>
  );
}
