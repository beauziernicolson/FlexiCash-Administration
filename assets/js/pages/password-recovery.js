import { getSupabase, getSession, onAuthStateChange, signOut } from "../services/supabase-client.js";
import { toast, href } from "../components.js";

export async function attachForgotForm(form, turnstile) {
  const btn = form.querySelector("button[type=submit],button");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (form.querySelector('[name="email"]')?.value || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ type: "error", title: "Adresse invalide", message: "Vérifiez votre adresse e-mail." });
      return;
    }
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Envoi...";
    try {
      const sb = await getSupabase();
      if (!sb) {
        toast({ type: "error", title: "Service indisponible", message: "FlexiCash est temporairement indisponible. La connexion sécurisée au serveur n’a pas pu être établie." });
        return;
      }
      const redirectTo = new URL(href("auth/reset-password.html"), location.href).href;
      const captchaToken = turnstile?.getToken?.();
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo,
        ...(captchaToken ? { captchaToken } : {}),
      });
      if (error) {
        // Distinguish network/config vs real errors conservatively.
        toast({ type: "error", title: "Impossible d'envoyer", message: (error.message && error.message.length < 200) ? error.message : "Impossible d'envoyer le lien. Réessayez plus tard." });
        return;
      }
      toast({ type: "success", title: "Demande reçue", message: "Si un compte FlexiCash correspond à cette adresse, un lien sécurisé de réinitialisation sera envoyé.", timeout: 6000 });
    } catch (err) {
      toast({ type: "error", title: "Erreur réseau", message: "Impossible de contacter le service. Réessayez." });
    } finally {
      turnstile?.reset?.();
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

export async function attachResetForm(form) {
  const inputs = Array.from(form.querySelectorAll('input[type="password"]'));
  const submitBtn = form.querySelector('button[type="submit"],button');
  let unsub = null;
  let allowed = false;

  function setStatus(text) {
    let el = document.getElementById('fx-recovery-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fx-recovery-status';
      el.style.cssText = 'margin-bottom:12px;color:var(--muted,#6b7280)';
      form.prepend(el);
    }
    el.textContent = text;
  }

  function enableForm() {
    allowed = true;
    inputs.forEach(i => i.disabled = false);
    submitBtn.disabled = false;
    const el = document.getElementById('fx-recovery-status'); if (el) el.remove();
  }

  function disableFormWithMessage(msg) {
    inputs.forEach(i => i.disabled = true);
    submitBtn.disabled = true;
    setStatus(msg);
  }

  // Start disabled while we verify the recovery session.
  disableFormWithMessage('Vérification du lien sécurisé…');

  // Listen for auth state changes (PASSWORD_RECOVERY event).
  try {
    unsub = await onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        enableForm();
      }
    });
  } catch (err) {
    // ignore — handled below
  }

  // Also check immediate session + URL param (type=recovery) to allow reloads.
  try {
    const searchType = new URLSearchParams(location.search).get('type');
    const session = await getSession();
    if (session && searchType === 'recovery') {
      enableForm();
    }
  } catch (err) {
    // If Supabase unavailable, show blocking error.
    disableFormWithMessage('FlexiCash est temporairement indisponible. La connexion sécurisée au serveur n’a pas pu être établie.');
    return;
  }

  // After a timeout, if still not allowed, show invalid/expired message.
  setTimeout(() => {
    if (!allowed) disableFormWithMessage('Le lien de réinitialisation est invalide ou expiré.');
  }, 6000);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!allowed) return;
    const p1 = inputs[0]?.value || '';
    const p2 = inputs[1]?.value || '';
    if (!p1 || !p2) { setStatus('Veuillez remplir tous les champs.'); return; }
    if (p1.length < 10) { setStatus('Le mot de passe doit contenir au moins 10 caractères.'); return; }
    if (p1 !== p2) { setStatus('Les mots de passe ne correspondent pas.'); return; }
    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.textContent = 'Enregistrement...';
    try {
      const sb = await getSupabase();
      if (!sb) { setStatus('Service indisponible. Réessayez plus tard.'); submitBtn.disabled = false; submitBtn.textContent = original; return; }
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) { setStatus(error.message || 'Impossible de modifier le mot de passe.'); submitBtn.disabled = false; submitBtn.textContent = original; return; }
      toast({ type: 'success', title: 'Votre mot de passe a été modifié avec succès.' });
      try { await signOut(); } catch {}
      setTimeout(() => { location.replace(href('auth/login.html')); }, 1200);
    } catch (err) {
      setStatus('Erreur réseau. Réessayez.');
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  });

  // Clean up when leaving the page.
  window.addEventListener('beforeunload', () => { try { unsub?.(); } catch {} });
}
