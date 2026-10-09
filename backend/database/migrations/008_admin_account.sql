create table if not exists public.admins (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  password_hash text not null,
  name          text,
  role          text not null default 'admin',
  token_version integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_admins_updated_at before update on public.admins
  for each row execute function public.set_updated_at();

alter table public.admins enable row level security;
