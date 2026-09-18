/** The few Meta Graph API calls the Publisher and Analyst need. */
import { config } from "./config.js";

const GRAPH = "https://graph.facebook.com/v21.0";

async function graph<T>(path: string, params: Record<string, string>, method: "GET" | "POST" = "GET"): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: config.metaToken() });
  const url = method === "GET" ? `${GRAPH}/${path}?${qs}` : `${GRAPH}/${path}`;
  const res = await fetch(url, method === "POST" ? { method, body: qs } : undefined);
  const body = (await res.json()) as T & { error?: { message: string; code: number } };
  if (!res.ok || body.error) throw new Error(`Meta ${path}: ${body.error?.message ?? res.statusText} (code ${body.error?.code ?? res.status})`);
  return body;
}

/** Creates a media container. Meta downloads the image from `imageUrl`, which must be public. */
export async function createContainer(opts: {
  imageUrl?: string; videoUrl?: string; caption?: string; isCarouselItem?: boolean; children?: string[]; reel?: boolean;
}): Promise<string> {
  const params: Record<string, string> = {};
  if (opts.children) { params.media_type = "CAROUSEL"; params.children = opts.children.join(","); }
  else if (opts.reel) { params.media_type = "REELS"; params.video_url = opts.videoUrl!; }
  else params.image_url = opts.imageUrl!;
  if (opts.caption) params.caption = opts.caption;
  if (opts.isCarouselItem) params.is_carousel_item = "true";
  const r = await graph<{ id: string }>(`${config.igUserId()}/media`, params, "POST");
  return r.id;
}

/** Reels and carousels process asynchronously; publishing before FINISHED fails. */
export async function waitUntilReady(containerId: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await graph<{ status_code: string }>(containerId, { fields: "status_code" });
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new Error(`Container ${containerId} ${r.status_code}`);
    await new Promise((res) => setTimeout(res, 5000));
  }
  throw new Error(`Container ${containerId} not ready after ${timeoutMs / 1000}s`);
}

export async function publish(containerId: string): Promise<string> {
  const r = await graph<{ id: string }>(`${config.igUserId()}/media_publish`, { creation_id: containerId }, "POST");
  return r.id;
}

export async function comment(mediaId: string, message: string): Promise<void> {
  await graph(`${mediaId}/comments`, { message }, "POST");
}

export async function insights(mediaId: string): Promise<{ reach: number; saved: number; likes: number; comments: number }> {
  const r = await graph<{ data: { name: string; values: { value: number }[] }[] }>(`${mediaId}/insights`, {
    metric: "reach,saved,likes,comments",
  });
  const get = (n: string) => r.data.find((d) => d.name === n)?.values?.[0]?.value ?? 0;
  return { reach: get("reach"), saved: get("saved"), likes: get("likes"), comments: get("comments") };
}
