-- ============================================================================
-- FlexiCash — Fondation Auth (V1)
-- Migration idempotente : peut être rejouée sans erreur.
--
-- Contenu :
--   * table public.profiles (liée à auth.users)
--   * contraintes role / status
--   * fonction + trigger de création automatique du profil (métadonnées Google)
--   * fonction + trigger updated_at
--   * fonction protégeant role / status / id contre la modification par un client
--   * fonction is_admin() (SECURITY DEFINER, évite la récursion RLS)
--   * activation RLS + politiques (lecture/écriture propres, lecture admin)
--   * backfill des utilisateurs Auth déjà existants
--
-- Aucune donnée wallet / transaction / KYC / paiement n'est touchée ici.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  phone       text,
  role        text not null default 'client',
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Profil applicatif FlexiCash, un enregistrement par utilisateur auth.users.';

-- Adaptation d'une table profiles préexistante : on s'assure que toutes les
-- colonnes attendues existent (no-op si la table vient d'être créée ci-dessus).
alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists full_name  text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists phone      text;
alter table public.profiles add column if not exists role       text;
alter table public.profiles add column if not exists status     text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Valeurs par défaut + remplissage + NOT NULL pour role / status
alter table public.profiles alter column role   set default 'client';
alter table public.profiles alter column status set default 'active';
update public.profiles set role   = 'client' where role   is null;
update public.profiles set status = 'active' where status is null;
alter table public.profiles alter column role   set not null;
alter table public.profiles alter column status set not null;

-- Contraintes (ajout idempotent, après garantie d'existence des colonnes).
-- Les valeurs existantes hors liste sont normalisées au préalable pour éviter
-- un échec d'ajout de contrainte.
update public.profiles set role   = 'client' where role   not in ('client', 'admin');
update public.profiles set status = 'active' where status not in ('active', 'suspended');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('client', 'admin'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_status_check') then
    alter table public.profiles
      add constraint profiles_status_check check (status in ('active', 'suspended'));
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. is_admin() — vérification admin côté base, SECURITY DEFINER.
--    Contourne la RLS de profiles lors du test => pas de récursion dans les
--    politiques qui l'utilisent.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

comment on function public.is_admin() is 'Retourne true si l''utilisateur courant a le rôle admin (vérifié en base).';

-- ----------------------------------------------------------------------------
-- 3. updated_at automatique
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Protection des champs privilégiés.
--    Un utilisateur non-admin ne peut jamais modifier role / status / id /
--    email / created_at : ces colonnes sont forcées à leur valeur précédente.
--    Un admin (is_admin) conserve le droit de les modifier.
-- ----------------------------------------------------------------------------
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    new.id         := old.id;
    new.role       := old.role;
    new.status     := old.status;
    new.email      := old.email;       -- l'email est géré par l'authentification
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_fields on public.profiles;
create trigger profiles_protect_fields
  before update on public.profiles
  for each row
  execute function public.protect_profile_fields();

-- ----------------------------------------------------------------------------
-- 5. Création automatique du profil à l'inscription (métadonnées Google).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 6. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Un utilisateur lit son propre profil
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Un admin lit tous les profils (nécessaire à l'administration)
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select
  to authenticated
  using (public.is_admin());

-- Un utilisateur modifie son propre profil.
-- Les colonnes privilégiées sont neutralisées par protect_profile_fields().
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Un admin peut mettre à jour les profils
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Aucune politique INSERT/DELETE côté client : les profils sont créés par le
-- trigger handle_new_user() (SECURITY DEFINER) et supprimés en cascade avec
-- auth.users.

-- ----------------------------------------------------------------------------
-- 7. Privilèges de table (RLS reste la barrière de sécurité effective)
-- ----------------------------------------------------------------------------
revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 8. Backfill : profils manquants pour les utilisateurs Auth existants
-- ----------------------------------------------------------------------------
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    nullif(split_part(coalesce(u.email, ''), '@', 1), '')
  ),
  coalesce(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture'
  )
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ============================================================================
-- PROMOTION D'UN ADMINISTRATEUR (à exécuter manuellement, jamais automatique)
--
--   update public.profiles
--   set role = 'admin'
--   where id = (select id from auth.users where email = 'VOTRE_EMAIL@exemple.com');
--
-- Aucun utilisateur n'est promu administrateur par cette migration.
-- ============================================================================
