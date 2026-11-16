-- Englische Seiten (/en/…) mitzählen; Landingpage und App beider Sprachen zusammen auswerten.
do $$
declare def text;
begin
  def := pg_get_functiondef('private.track_pageview(text, text, text, text, text)'::regprocedure);
  def := replace(def, $r$('/', '/app/', '/impressum.html', '/datenschutz.html')$r$,
    $r$('/', '/app/', '/impressum.html', '/datenschutz.html', '/en/', '/en/app/', '/en/imprint.html', '/en/privacy.html')$r$);
  if def not like '%/en/privacy.html%' then raise exception 'track_pageview nicht angepasst'; end if;
  execute def;

  def := pg_get_functiondef('private.site_stats(integer)'::regprocedure);
  def := replace(def, $r$path = '/app/'$r$, $r$path in ('/app/', '/en/app/')$r$);
  def := replace(def, $r$path = '/')$r$, $r$path in ('/', '/en/'))$r$);
  if def like $r$%path = '/'%$r$ then raise exception 'site_stats nicht vollständig angepasst'; end if;
  execute def;
end $$;
