const DIRECT_BACKEND_URL = 'http://127.0.0.1:8000';
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('clariclass_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  // If body is FormData, remove Content-Type so browser sets correct multipart boundary
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  // Primary request URL (relative /api or configured)
  const primaryUrl = API_BASE_URL ? `${API_BASE_URL}${endpoint}` : `/api${endpoint}`;

  try {
    const response = await fetch(primaryUrl, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(errorData.detail || `API error (${response.status})`);
    }

    return await response.json();
  } catch (primaryErr) {
    // If proxy failed (e.g. Failed to fetch), attempt direct connection to FastAPI backend
    try {
      const fallbackUrl = `${DIRECT_BACKEND_URL}${endpoint.startsWith('/api') ? endpoint : endpoint}`;
      const fallbackRes = await fetch(fallbackUrl, {
        ...options,
        headers
      });

      if (!fallbackRes.ok) {
        const errJson = await fallbackRes.json().catch(() => ({ detail: fallbackRes.statusText }));
        throw new Error(errJson.detail || `Server responded with ${fallbackRes.status}`);
      }

      return await fallbackRes.json();
    } catch (fallbackErr) {
      throw new Error(primaryErr.message || fallbackErr.message || 'Failed to connect to backend service.');
    }
  }
}
