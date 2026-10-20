"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";

type Props = {
  roles: { id: string; title: string; description: string }[];
  templates: { type: string; name: string; description: string }[];
  competencies: { key: string; name: string }[];
  resumes: { id: string; name: string }[];
  organizations: { id: string; name: string }[];
  defaults: { visibility: boolean; focus: boolean; connection: boolean; clipboard: boolean; fullscreen: boolean };
  prefersText: boolean;
};

export function InterviewSetup(p: Props) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(p.roles[0]?.id ?? "custom");
  const [roleTitle, setRoleTitle] = useState(p.roles[0]?.title ?? "");
  const [jd, setJd] = useState(p.roles[0]?.description ?? "");
  const [type, setType] = useState("behavioral");
  const [difficulty, setDifficulty] = useState("medium");
  const [duration, setDuration] = useState(20);
  const [focus, setFocus] = useState<string[]>([]);
  const [resumeId, setResumeId] = useState(p.resumes[0]?.id ?? "");
  const [mode, setMode] = useState<"voice" | "text">(p.prefersText ? "text" : "voice");
  const [mon, setMon] = useState({ enabled: true, ...p.defaults });
  const [org, setOrg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);

  function pickRole(id: string) {
    setRoleId(id);
    const r = p.roles.find((x) => x.id === id);
    if (r) { setRoleTitle(r.title); setJd(r.description); } else { setRoleTitle(""); setJd(""); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api<{ id: string }>("/interviews", { body: { roleId: roleId === "custom" ? null : roleId, roleTitle, jobDescription: jd, interviewType: type, difficulty, durationMin: duration, focus, resumeId: resumeId || null, answerMode: mode, shareOrgId: org || null, monitoring: mon } });
      router.push(`/interviews/${r.id}/lobby`);
    } catch (x) { setErr(x instanceof ApiError ? x : new ApiError(0, "error", "Something went wrong.")); setBusy(false); }
  }
  const roleErr = err?.code === "role_required" ? err.message : undefined;
  const jdErr = err?.code === "jd_required" ? err.message : err?.fields.find((f) => f.path === "jobDescription")?.message;
  const generalErr = err && !roleErr && !jdErr ? err.message : null;
  const toggle = (k: keyof typeof mon) => setMon((m) => ({ ...m, [k]: !m[k] }));

  return (
    <form onSubmit={submit} className="stack-lg" noValidate aria-busy={busy}>
      {generalErr && <div className="notice notice-err" role="alert">{generalErr}</div>}
      <section className="card stack">
        <h2 className="section-title">Target role</h2>
        <div className="field"><label htmlFor="role">Role</label>
          <select id="role" className="select" value={roleId} onChange={(e) => pickRole(e.target.value)}>
            {p.roles.map((r) => <option key={r.id} value={r.id}>{r.title} (sample)</option>)}
            <option value="custom">My own role…</option>
          </select></div>
        <div className="field"><label htmlFor="rt">Role title</label><input id="rt" className="input" value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} maxLength={120} aria-invalid={!!roleErr} aria-describedby={roleErr ? "rt-e" : undefined} />{roleErr && <span id="rt-e" className="field-error">{roleErr}</span>}</div>
        <div className="field"><label htmlFor="jd">Job description</label><textarea id="jd" className="textarea" value={jd} onChange={(e) => setJd(e.target.value)} maxLength={6000} aria-invalid={!!jdErr} aria-describedby={jdErr ? "jd-e" : "jd-h"} /><span id="jd-h" className="hint">Paste the posting or summarise the role. Questions are tailored to it.</span>{jdErr && <span id="jd-e" className="field-error">{jdErr}</span>}</div>
      </section>

      <section className="card stack">
        <h2 className="section-title">Format</h2>
        <fieldset><legend>Interview type</legend>
          <div className="chip-group">{p.templates.map((t) => <label className="chip" key={t.type}><input type="radio" name="type" checked={type === t.type} onChange={() => setType(t.type)} /><span>{t.name}</span></label>)}</div>
          <p className="hint" style={{ marginTop: 8 }}>{p.templates.find((t) => t.type === type)?.description}</p></fieldset>
        <fieldset><legend>Difficulty</legend><div className="chip-group">{["easy", "medium", "hard"].map((d) => <label className="chip" key={d}><input type="radio" name="difficulty" checked={difficulty === d} onChange={() => setDifficulty(d)} /><span style={{ textTransform: "capitalize" }}>{d}</span></label>)}</div></fieldset>
        <div className="field" style={{ maxWidth: 240 }}><label htmlFor="dur">Duration</label><select id="dur" className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>{[10, 15, 20, 30, 45].map((d) => <option key={d} value={d}>{d} minutes</option>)}</select></div>
        <fieldset><legend>Focus areas (optional)</legend><div className="chip-group">{p.competencies.map((c) => <label className="chip" key={c.key}><input type="checkbox" checked={focus.includes(c.key)} onChange={() => setFocus((f) => f.includes(c.key) ? f.filter((x) => x !== c.key) : f.length < 6 ? [...f, c.key] : f)} /><span>{c.name}</span></label>)}</div></fieldset>
      </section>

      <section className="card stack">
        <h2 className="section-title">Résumé</h2>
        {p.resumes.length ? (
          <div className="field"><label htmlFor="rs">Use this résumé</label><select id="rs" className="select" value={resumeId} onChange={(e) => setResumeId(e.target.value)}><option value="">No résumé (role-based questions only)</option>{p.resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
        ) : <p className="notice notice-warn">No processed résumé yet. Questions will be role-based. <Link href="/resume">Upload one first</Link> for personalised questions.</p>}
      </section>

      <section className="card stack">
        <h2 className="section-title">How you will answer</h2>
        <fieldset><legend>Default answer mode</legend>
          <div className="chip-group">
            <label className="chip"><input type="radio" name="mode" checked={mode === "voice"} onChange={() => setMode("voice")} /><span>Voice and text</span></label>
            <label className="chip"><input type="radio" name="mode" checked={mode === "text"} onChange={() => setMode("text")} /><span>Text only</span></label>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>You can switch during the interview. Declining audio or video never lowers a score.</p></fieldset>
      </section>

      <section className="card stack">
        <h2 className="section-title">Session monitoring policy</h2>
        <p className="muted">Optional. You approve this again on the next screen. Events are neutral technical facts, labelled unverified, shown to you, and never affect scores.</p>
        <label className="check"><input type="checkbox" checked={mon.enabled} onChange={() => toggle("enabled")} /><span><span className="title">Allow session monitoring</span><br /><span className="hint">Master switch. Off means none of the events below are recorded.</span></span></label>
        {mon.enabled && <div className="grid grid-2">
          {([["visibility", "Browser tab hidden"], ["focus", "Window lost focus"], ["connection", "Connection lost"], ["fullscreen", "Fullscreen exited"], ["clipboard", "Paste in answer box (length only)"]] as const).map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={mon[k]} onChange={() => toggle(k)} /><span className="title">{l}</span></label>)}
        </div>}
      </section>

      <section className="card stack">
        <h2 className="section-title">Sharing</h2>
        <div className="field"><label htmlFor="org">Share the finished report with</label><select id="org" className="select" value={org} onChange={(e) => setOrg(e.target.value)}><option value="">No one (private)</option>{p.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select><span className="hint">Choosing an organization does not share anything yet. You confirm on the next screen and can withdraw later.</span></div>
      </section>

      <div className="row"><button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Continue to lobby"}</button><Link href="/interviews">Cancel</Link></div>
    </form>
  );
}
