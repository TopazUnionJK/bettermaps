-- Freischaltung neuer Konten: Nach der ersten Anmeldung bekommt der Betreiber eine E-Mail
-- mit einem Freischalt-Link; bis dahin darf das Konto nicht suchen.
alter table public.profiles
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  add column if not exists notified_at timestamptz,
  add column if not exists decided_at timestamptz;

-- Bestehende Konten bleiben freigeschaltet (Spalte war bisher nicht da).
update public.profiles set status = 'approved', decided_at = now()
  where status = 'pending' and created_at < '2026-11-14 12:00+00';

-- Nutzer dürfen ihr Profil nur lesen, nie selbst freischalten (unabhängig von früheren Grants).
revoke insert, update, delete on public.profiles from anon, authenticated;

-- Ältere Konten ohne Profilzeile ebenfalls freischalten.
insert into public.profiles (id, status, decided_at)
  select id, 'approved', now() from auth.users where created_at < '2026-11-14 12:00+00'
  on conflict (id) do nothing;
