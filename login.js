(function () {
  const form = document.querySelector('[data-auth-form]');
  const statusEl = document.querySelector('[data-auth-status]');
  const submitButton = document.querySelector('[data-auth-submit]');
  const kicker = document.querySelector('[data-auth-kicker]');
  const copy = document.querySelector('[data-auth-copy]');
  if (!form) return;

  const params = new URLSearchParams(window.location.search);
  const next = safeNext(params.get('next'));
  let setupRequired = false;

  function safeNext(value) {
    if (!value || typeof value !== 'string') return 'admin.html';
    if (value.startsWith('/') && !value.startsWith('//')) return value;
    if (/^[a-z0-9._/-]+(?:\?[a-z0-9._=&%-]+)?$/i.test(value)) return value;
    return 'admin.html';
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  async function loadSession() {
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'No se pudo leer la sesión.');

      if (payload.authenticated) {
        window.location.href = next;
        return;
      }

      setupRequired = Boolean(payload.setupRequired);
      if (setupRequired) {
        kicker.textContent = 'Primera configuración';
        copy.textContent = 'Crea tu clave local de administrador. Esta ruta no aparece en el navbar público.';
        submitButton.textContent = 'Crear clave';
        form.password.autocomplete = 'new-password';
      }
    } catch (error) {
      setStatus('Backend no disponible. Abre esta página desde el servidor local.');
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const password = form.password.value;
    if (password.length < 8) {
      setStatus('Usa una clave de al menos 8 caracteres.');
      return;
    }

    submitButton.disabled = true;
    setStatus(setupRequired ? 'Creando clave...' : 'Entrando...');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'No se pudo iniciar sesión.');
      window.location.href = next;
    } catch (error) {
      setStatus(error.message);
      submitButton.disabled = false;
    }
  });

  loadSession();
})();
