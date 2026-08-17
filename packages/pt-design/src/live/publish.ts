import { defaultLiveHttpUrl, isLiveEvent, type LiveEvent } from "./protocol";

export async function publishLiveEvent(event: LiveEvent, url = defaultLiveHttpUrl()): Promise<boolean> {
  if (!isLiveEvent(event)) return false;
  try {
    const res = await fetch(`${url}/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function attachLiveWatch(file: string, url = defaultLiveHttpUrl()): Promise<boolean> {
  try {
    const res = await fetch(`${url}/watch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function liveHubHealthy(url = defaultLiveHttpUrl()): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
