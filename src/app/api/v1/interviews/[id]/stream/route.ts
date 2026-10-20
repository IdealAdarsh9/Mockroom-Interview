import { route } from "@/server/http";
import { getState } from "@/server/interview/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-sent events: streams the current question text in small pieces (for captions and speech pacing), then keeps a light
 * status heartbeat so the room can notice pause/complete changes made elsewhere. The client reconnects automatically (EventSource).
 */
export const GET = route<{ id: string }>({ roles: ["candidate"] }, async ({ req, user, params }) => {
  const enc = new TextEncoder();
  const send = (c: ReadableStreamDefaultController, event: string, data: unknown) => c.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(c) {
      let last = "";
      const tick = async (first: boolean) => {
        try {
          const st = await getState(user, params.id);
          const key = `${st.status}:${st.current?.id ?? ""}`;
          if (first || key !== last) {
            send(c, "status", { status: st.status, questionId: st.current?.id ?? null });
            if (st.current && key !== last) {
              const words = st.current.text.split(/(\s+)/);
              for (let i = 0; i < words.length; i += 3) send(c, "question", { questionId: st.current.id, delta: words.slice(i, i + 3).join("") });
              send(c, "question_done", { questionId: st.current.id });
            }
            last = key;
          } else send(c, "ping", { t: Date.now() });
        } catch { send(c, "error", { message: "Stream ended." }); clearInterval(timer); try { c.close(); } catch { /* closed */ } }
      };
      await tick(true);
      timer = setInterval(() => void tick(false), 4000);
      req.signal.addEventListener("abort", () => { clearInterval(timer); try { c.close(); } catch { /* closed */ } });
    },
    cancel() { clearInterval(timer); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" } });
});
