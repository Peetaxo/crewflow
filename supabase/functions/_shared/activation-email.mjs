const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function renderActivationEmail({ firstName, activationUrl, nativeUrl }) {
  if (!/^http:\/\/127\.0\.0\.1:8096\/activate#token=[a-f0-9]{64}$/.test(activationUrl)
    || !/^nodu(?:-test)?:\/\/activate#token=[a-f0-9]{64}$/.test(nativeUrl)
    || activationUrl.split('#')[1] !== nativeUrl.split('#')[1]) {
    throw new Error('Unsupported pilot activation destination.');
  }
  const greeting = firstName ? `Ahoj ${firstName},` : 'Ahoj,';
  return {
    subject: 'Dokonči aktivaci účtu v nodu',
    text: `${greeting}\n\npřipravili jsme ti přístup do nodu. Nastav si vlastní heslo a přihlas se do aplikace. Pozvánka platí 48 hodin.\n\nOtevřít v mobilní aplikaci:\n${nativeUrl}\n\nPokud aplikaci nemáš, pokračuj v prohlížeči:\n${activationUrl}\n\nPokud jsi o přístup nežádal/a, tento e-mail můžeš ignorovat.\n\nJde o místní testovací pozvánku.`,
    html: `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Aktivace nodu</title></head><body style="font-family:Arial,sans-serif;line-height:1.6;max-width:560px;margin:32px auto;padding:16px;color:#172025"><p>${escapeHtml(greeting)}</p><p>připravili jsme ti přístup do <strong>nodu</strong>. Nastav si vlastní heslo a přihlas se do aplikace.</p><p>Pozvánka platí <strong>48 hodin</strong>.</p><p><a href="${nativeUrl}">Otevřít v mobilní aplikaci</a></p><p>Pokud aplikaci nemáš, <a href="${activationUrl}">pokračuj v prohlížeči</a>.</p><p>Pokud jsi o přístup nežádal/a, tento e-mail můžeš ignorovat.</p><p style="font-size:12px;color:#667">Jde o místní testovací pozvánku.</p></body></html>`,
  };
}
