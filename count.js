// Seitenaufruf für die eigene Statistik zählen: ohne Cookies, ohne gespeicherte IP-Adresse.
// Gezählt wird nur auf nexttomaps.com und nicht, wenn der Browser „Global Privacy Control“ sendet.
// Sprachwahl über die DE/EN-Links merken (die deutsche Startseite leitet danach nicht mehr um).
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[hreflang]');
  if (a) try { localStorage.setItem('nttm.lang', a.getAttribute('hreflang')); } catch (err) { /* egal */ }
});

(function () {
  try {
    var own = 'nexttomaps.com';
    if (location.hostname.replace(/^www\./, '') !== own || navigator.globalPrivacyControl) return;
    var q = new URLSearchParams(location.search);
    var ref = q.get('utm_source') || q.get('ref') || '';
    if (!ref && document.referrer) {
      var host = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (host !== own) ref = host;
    }
    ref = ref.toLowerCase().replace(/[^a-z0-9.:_-]/g, '').slice(0, 60);
    fetch('https://icqensripxkuiarkrvsb.supabase.co/functions/v1/api/hit', {
      method: 'POST',
      keepalive: true,
      body: JSON.stringify({
        // /impressum (ohne Endung) liefert GitHub Pages wie /impressum.html aus
        path: location.pathname.replace(/index\.html$/, '').replace(/^(.*\/[^/.]+)$/, '$1.html'),
        ref: ref,
        device: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop',
      }),
    }).catch(function () {});
  } catch (e) { /* Statistik darf nie stören */ }
})();
