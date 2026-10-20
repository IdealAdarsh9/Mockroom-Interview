import { route } from "@/server/http";
import { createResume, listResumes } from "@/server/resume/service";
import { badRequest } from "@/server/errors";
import { MAX_UPLOAD_BYTES } from "@/server/resume/validate";

export const runtime = "nodejs";
export const GET = route({ roles: ["candidate"] }, async ({ user }) => ({ resumes: listResumes(user.id) }));

/** multipart/form-data with a single "file". Pass ?replaceId=<id> to replace; the old resume is removed only after the new one is READY. */
export const POST = route({ roles: ["candidate"], limit: [12, 600_000] }, async ({ req, user }) => {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) throw badRequest("That file is too large. The limit is 5 MB.", "file_too_large");
  let form: FormData;
  try { form = await req.formData(); } catch { throw badRequest("Upload a file using multipart form data.", "invalid_upload"); }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Choose a file to upload.", "file_required");
  const data = Buffer.from(await file.arrayBuffer());
  const replaceId = req.nextUrl.searchParams.get("replaceId") ?? undefined;
  const { id } = createResume(user.id, { name: file.name, mime: file.type, data }, { replaceId });
  return Response.json({ id, status: "UPLOADED" }, { status: 202 });
});
