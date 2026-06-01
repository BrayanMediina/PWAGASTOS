/**
 * AUDITORÍA 2 – LIGHTHOUSE / PWA INSTALL PROMPT
 * Gestiona el evento beforeinstallprompt para mostrar un banner de
 * instalación personalizado dentro de la interfaz, cumpliendo los criterios
 * de "instalabilidad" verificados por Lighthouse y PageSpeed Insights.
 *
 * El banner solo aparece cuando el navegador confirma que la PWA
 * cumple todos los requisitos de instalación.
 */

let deferredPrompt = null;

/** Inicializa la escucha del prompt de instalación */
export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Evitar que el navegador muestre el mini-infobar automático
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
    console.log(
      '%c[PWA Install] La app cumple los criterios de instalación (Lighthouse ✓)',
      'color:#10b981; font-weight:bold;'
    );
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hideInstallBanner();
    console.log('%c[PWA Install] ¡App instalada correctamente!', 'color:#10b981; font-weight:bold;');
  });

  // Conectar botones del banner
  document.getElementById('btnInstall')?.addEventListener('click', triggerInstall);
  document.getElementById('btnDismissInstall')?.addEventListener('click', hideInstallBanner);
}

async function triggerInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log(
    `%c[PWA Install] Decisión del usuario: ${outcome}`,
    'color:#6366f1; font-weight:bold;'
  );
  deferredPrompt = null;
  hideInstallBanner();
}

function showInstallBanner() {
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  banner.hidden = false;
  // Pequeño delay para activar la transición CSS
  requestAnimationFrame(() => banner.classList.add('install-banner--visible'));
}

function hideInstallBanner() {
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  banner.classList.remove('install-banner--visible');
  banner.addEventListener('transitionend', () => { banner.hidden = true; }, { once: true });
}
