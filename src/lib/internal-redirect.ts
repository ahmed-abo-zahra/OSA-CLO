const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function resolveInternalRedirect(rawNext: string | null, origin: string): URL {
  const fallback = new URL('/account', origin);
  if (!rawNext || !rawNext.startsWith('/') || rawNext.startsWith('//') || rawNext.includes('\\') || CONTROL_CHARACTERS.test(rawNext) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(rawNext)) {
    return fallback;
  }

  try {
    const candidate = new URL(rawNext, origin);
    if (candidate.origin !== origin || candidate.username || candidate.password) return fallback;
    return candidate;
  } catch {
    return fallback;
  }
}
