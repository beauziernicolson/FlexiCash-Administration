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

alter table public.profiles add column if not exists email      text;
alter table public.profiles add column if not exists full_name  text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists phone      text;
alter table public.profiles add column if not exists role       text;
alter table public.profiles add column if not exists status     text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles alter column role   set default 'client';
alter table public.profiles alter column status set default 'active';
update public.profiles set role   = 'client' where role   is null;
update public.profiles set status = 'active' where status is null;
alter table public.profiles alter column role   set not null;
alter table public.profiles alter column status set not null;

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
    new.email      := old.email;
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

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;

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
