/**
 * Account Profile card identity. Cookie session (web) and `/v1/me`
 * (device Bearer) both carry the OAuth avatar URL — merge so desktop
 * local-web does not drop `image`.
 */

export type HubProfileCookieUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export type HubProfileMe = {
  user_id?: string | null;
  name?: string | null;
  handle?: string | null;
  email?: string | null;
  image?: string | null;
};

export type HubProfileUser = {
  id: string;
  name: string;
  email?: string;
  image?: string;
};

export function hubProfileImageUrl(
  raw: string | null | undefined,
): string | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function hubProfileUser({
  cookieUser,
  me,
  fallbackName,
}: {
  cookieUser?: HubProfileCookieUser | null;
  me?: HubProfileMe | null;
  fallbackName: string;
}): HubProfileUser | null {
  const id = cookieUser?.id || me?.user_id;
  if (!id) return null;

  const name =
    (cookieUser?.name ?? "").trim() ||
    (me?.name ?? "").trim() ||
    (me?.handle ?? "").trim() ||
    fallbackName;
  const email =
    (cookieUser?.email ?? "").trim() || (me?.email ?? "").trim() || undefined;

  return {
    id,
    name,
    email,
    image:
      hubProfileImageUrl(cookieUser?.image) ?? hubProfileImageUrl(me?.image),
  };
}
