// Session authority always lives on the server. Never persist privileges in localStorage.
export async function sessionRequest(path, body, signal) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; cancel(); }, 30000);
  try {
    const response = await fetch(`/api/auth/${path}`, {
      method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'No se pudo comprobar la sesión.');
    return data;
  } catch (error) {
    if (timedOut) throw new Error('El servidor tardó demasiado. Comprueba la conexión e inténtalo otra vez.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export async function confirmedSession(signal) {
  const data = await sessionRequest('check-session', {}, signal);
  if (!data.success || !data.user) {
    throw new Error('No se pudo conservar la sesión. Permite las cookies del sitio y vuelve a iniciar sesión.');
  }
  return data;
}
