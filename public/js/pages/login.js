(function () {
  const form = document.getElementById('login-form');
  const melding = document.getElementById('melding');

  if (!form || !melding) {
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const svar = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brukernavn: document.getElementById('brukernavn').value,
        passord: document.getElementById('passord').value
      })
    });

    const data = await svar.json();
    if (data.ok) {
      window.location.href = '/turer';
      return;
    }

    melding.textContent = data.melding;
    melding.className = 'melding feil';
  });
}());
