const AUTH_TOKEN_STORAGE_KEY = 'facultylog_session_token';

export function getStoredAuthToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string): void {
  try {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore storage quota / privacy mode errors; cookie fallback still works on same-origin
  }
}

export function clearStoredAuthToken(): void {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

function resolveRequestPathname(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    if (input.startsWith('/')) {
      const qIdx = input.indexOf('?');
      return qIdx === -1 ? input : input.slice(0, qIdx);
    }
    try {
      const u = new URL(input, window.location.origin);
      if (u.origin === window.location.origin) return u.pathname;
    } catch {
      return '';
    }
    return '';
  }
  if (input instanceof URL) {
    return input.origin === window.location.origin ? input.pathname : '';
  }
  if (input instanceof Request) {
    try {
      const u = new URL(input.url, window.location.origin);
      if (u.origin === window.location.origin) return u.pathname;
    } catch {
      return '';
    }
  }
  return '';
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const pathname = resolveRequestPathname(input);
  const headers = new Headers(
    init?.headers || (input instanceof Request ? input.headers : undefined)
  );

  const token = getStoredAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const nextInit: RequestInit = {
    ...init,
    headers,
    credentials: init?.credentials ?? 'include'
  };

  const response = await window.fetch(input, nextInit);

  const isAuthEndpoint = pathname.startsWith('/api/auth/');
  if (response.status === 401 && !isAuthEndpoint) {
    clearStoredAuthToken();
    window.dispatchEvent(new CustomEvent('facultylog:unauthorized'));
  }

  return response;
}

export async function downloadAuthenticatedFile(
  url: string,
  fallbackFilename: string
): Promise<void> {
  const res = await apiFetch(url);
  if (!res.ok) {
    let message = 'Download failed';
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // Ignore non-JSON error body
    }
    throw new Error(message);
  }

  let filename = fallbackFilename;
  const disposition = res.headers.get('Content-Disposition');
  if (disposition) {
    const match = disposition.match(/filename="?([^";]+)"?/i);
    if (match?.[1]) {
      filename = match[1];
    }
  }

  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}
