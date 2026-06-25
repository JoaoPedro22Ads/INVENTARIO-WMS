
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_all" on public.profiles for select to authenticated using (true);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Inventories
create table public.inventories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  shift text not null check (shift in ('08:30','15:00','outro')),
  inventory_date date not null default current_date,
  status text not null default 'em_andamento' check (status in ('em_andamento','concluido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.inventories enable row level security;
create index inventories_user_idx on public.inventories(user_id, created_at desc);

create policy "inv_select_own" on public.inventories for select to authenticated using (auth.uid() = user_id);
create policy "inv_insert_own" on public.inventories for insert to authenticated with check (auth.uid() = user_id);
create policy "inv_update_own" on public.inventories for update to authenticated using (auth.uid() = user_id);
create policy "inv_delete_own" on public.inventories for delete to authenticated using (auth.uid() = user_id);

-- Inventory items (parsed from PDF)
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories(id) on delete cascade,
  pagador_codigo text,
  cliente text not null,
  tipo_produto_codigo int,
  tipo_produto_nome text,
  entrada date,
  nota_fiscal text,
  tipo text,
  cte text,
  contrato text,
  endereco text,
  area text,
  saldo_vol numeric,
  saldo_financ numeric,
  status text not null default 'pendente' check (status in ('pendente','conferido','faltando')),
  observacoes text,
  conferido_em timestamptz,
  created_at timestamptz not null default now()
);
alter table public.inventory_items enable row level security;
create index items_inv_idx on public.inventory_items(inventory_id);
create index items_endereco_idx on public.inventory_items(inventory_id, endereco);

create policy "items_all_own" on public.inventory_items
  for all to authenticated
  using (exists (select 1 from public.inventories i where i.id = inventory_id and i.user_id = auth.uid()))
  with check (exists (select 1 from public.inventories i where i.id = inventory_id and i.user_id = auth.uid()));

-- Extra items (físicas não cadastradas no PDF)
create table public.extra_items (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories(id) on delete cascade,
  endereco text,
  cliente text,
  nota_fiscal text,
  observacoes text not null,
  created_at timestamptz not null default now()
);
alter table public.extra_items enable row level security;
create index extras_inv_idx on public.extra_items(inventory_id);

create policy "extras_all_own" on public.extra_items
  for all to authenticated
  using (exists (select 1 from public.inventories i where i.id = inventory_id and i.user_id = auth.uid()))
  with check (exists (select 1 from public.inventories i where i.id = inventory_id and i.user_id = auth.uid()));
