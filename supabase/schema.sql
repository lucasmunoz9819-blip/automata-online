create table if not exists public.automata_state (
  name text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.automata_state enable row level security;
-- La service role usada solo por el servidor omite RLS. No expongas esa clave al navegador.
