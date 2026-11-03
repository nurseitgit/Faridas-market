-- Выполни этот SQL в Supabase → SQL Editor → New query
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Продажа костюма',
  cost_price numeric(12,2) not null check (cost_price >= 0),
  sale_price numeric(12,2) not null check (sale_price > 0),
  photo_url text,
  sold_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists sales_user_sold_at_idx on public.sales(user_id, sold_at desc);
alter table public.sales enable row level security;
drop policy if exists "Users can read own sales" on public.sales;
create policy "Users can read own sales" on public.sales for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own sales" on public.sales;
create policy "Users can insert own sales" on public.sales for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own sales" on public.sales;
create policy "Users can update own sales" on public.sales for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own sales" on public.sales;
create policy "Users can delete own sales" on public.sales for delete to authenticated using (auth.uid() = user_id);

-- Фото: создаём публичный bucket для простого отображения фото в списке.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('costume-photos', 'costume-photos', true, 8388608, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = true, file_size_limit = 8388608;
drop policy if exists "Users can upload own costume photos" on storage.objects;
create policy "Users can upload own costume photos" on storage.objects for insert to authenticated with check (bucket_id = 'costume-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can update own costume photos" on storage.objects;
create policy "Users can update own costume photos" on storage.objects for update to authenticated using (bucket_id = 'costume-photos' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'costume-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can delete own costume photos" on storage.objects;
create policy "Users can delete own costume photos" on storage.objects for delete to authenticated using (bucket_id = 'costume-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Версия 2: количество, канал продажи и связь с товаром склада.
alter table public.sales add column if not exists quantity integer not null default 1 check (quantity > 0);
alter table public.sales add column if not exists channel text;
alter table public.sales add column if not exists product_id text;
