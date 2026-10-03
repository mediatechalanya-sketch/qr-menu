-- =====================================================================
-- QR-меню SaaS: схема для Supabase (PostgreSQL)
-- Таблицы: restaurants, categories, dishes
-- Языки: TR (основной), EN, RU, DE — хранятся в JSONB: {"tr": "...", "en": "...", ...}
-- Запускать в Supabase Dashboard -> SQL Editor
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Вспомогательные функции
-- ---------------------------------------------------------------------

-- Автообновление updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Проверка мультиязычного поля:
--  * это JSON-объект
--  * содержит только ключи tr / en / ru / de
--  * значения — строки
--  * если require_tr = true, то турецкий вариант обязателен и не пустой
create or replace function public.is_valid_i18n(val jsonb, require_tr boolean default false)
returns boolean
language sql
immutable
as $$
  select
    val is not null
    and jsonb_typeof(val) = 'object'
    and (val - array['tr','en','ru','de']) = '{}'::jsonb
    and not exists (
      select 1 from jsonb_each(val) e where jsonb_typeof(e.value) <> 'string'
    )
    and (
      not require_tr
      or length(btrim(coalesce(val ->> 'tr', ''))) > 0
    );
$$;

-- ---------------------------------------------------------------------
-- 1. restaurants
-- ---------------------------------------------------------------------
create table public.restaurants (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,

  slug              text not null,                       -- /menu/[slug]
  name              text not null,                       -- название заведения (одно для всех языков)
  description       jsonb not null default '{}'::jsonb,  -- {"tr": "...", "en": "..."}

  logo_url          text,
  cover_url         text,
  phone             text,
  address           text,
  instagram         text,
  wifi_name         text,
  wifi_password     text,

  currency          text not null default 'TRY',         -- TRY / EUR / USD ...
  default_language  text not null default 'tr',
  enabled_languages text[] not null default array['tr','en','ru','de'],

  is_active         boolean not null default true,       -- можно скрыть меню целиком (например, при неоплате)

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint restaurants_slug_unique unique (slug),
  constraint restaurants_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  constraint restaurants_default_lang_check check (default_language in ('tr','en','ru','de')),
  constraint restaurants_enabled_lang_check check (
    enabled_languages <@ array['tr','en','ru','de']
    and default_language = any (enabled_languages)
  ),
  constraint restaurants_description_i18n check (public.is_valid_i18n(description, false))
);

create index restaurants_owner_id_idx on public.restaurants (owner_id);

create trigger restaurants_set_updated_at
  before update on public.restaurants
  for each row execute function public.set_updated_at();

-- Хелпер для RLS: является ли текущий пользователь владельцем ресторана
create or replace function public.is_restaurant_owner(rid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurants r
    where r.id = rid and r.owner_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------
-- 2. categories
-- ---------------------------------------------------------------------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,

  name          jsonb not null,                          -- {"tr": "Ana Yemekler", "en": "Main Courses", ...}
  sort_order    integer not null default 0,
  is_active     boolean not null default true,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- нужен для составного FK из dishes (гарантирует, что блюдо и категория из одного ресторана)
  constraint categories_id_restaurant_unique unique (id, restaurant_id),
  constraint categories_name_i18n check (public.is_valid_i18n(name, true))
);

create index categories_restaurant_sort_idx on public.categories (restaurant_id, sort_order);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. dishes
-- ---------------------------------------------------------------------
create table public.dishes (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,                           -- денормализация для простого RLS и быстрых запросов
  category_id   uuid not null,

  name          jsonb not null,                          -- {"tr": "...", "en": "...", "ru": "...", "de": "..."}
  description   jsonb not null default '{}'::jsonb,

  price         numeric(10,2) not null check (price >= 0),
  image_url     text,
  weight_info   text,                                    -- "250 g", "330 ml"
  calories      integer check (calories is null or calories >= 0),

  tags          text[] not null default '{}',            -- vegan, vegetarian, spicy, gluten_free, halal, new, popular
  allergens     text[] not null default '{}',            -- gluten, milk, nuts, eggs, fish, ...

  is_available  boolean not null default true,           -- СТОП-ЛИСТ: false = "нет в наличии"
  is_active     boolean not null default true,           -- false = блюдо полностью скрыто из меню
  sort_order    integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- составной FK: категория обязана принадлежать тому же ресторану
  constraint dishes_category_fk
    foreign key (category_id, restaurant_id)
    references public.categories (id, restaurant_id)
    on delete cascade,
  constraint dishes_restaurant_fk
    foreign key (restaurant_id)
    references public.restaurants (id)
    on delete cascade,

  constraint dishes_name_i18n check (public.is_valid_i18n(name, true)),
  constraint dishes_description_i18n check (public.is_valid_i18n(description, false))
);

create index dishes_restaurant_idx      on public.dishes (restaurant_id);
create index dishes_category_sort_idx   on public.dishes (category_id, sort_order);

create trigger dishes_set_updated_at
  before update on public.dishes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.restaurants enable row level security;
alter table public.categories  enable row level security;
alter table public.dishes      enable row level security;

-- ---- restaurants ----
-- Публично видны только активные; владелец видит свои всегда
create policy "restaurants: public read active"
  on public.restaurants for select
  to anon, authenticated
  using (is_active or owner_id = (select auth.uid()));

create policy "restaurants: owner insert"
  on public.restaurants for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "restaurants: owner update"
  on public.restaurants for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "restaurants: owner delete"
  on public.restaurants for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---- categories ----
create policy "categories: public read active"
  on public.categories for select
  to anon, authenticated
  using (
    public.is_restaurant_owner(restaurant_id)
    or (
      is_active
      and exists (
        select 1 from public.restaurants r
        where r.id = categories.restaurant_id and r.is_active
      )
    )
  );

create policy "categories: owner write"
  on public.categories for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

-- ---- dishes ----
-- Блюда из стоп-листа (is_available = false) остаются видимыми — клиент видит "нет в наличии".
-- Полностью скрытые (is_active = false) видит только владелец.
create policy "dishes: public read active"
  on public.dishes for select
  to anon, authenticated
  using (
    public.is_restaurant_owner(restaurant_id)
    or (
      is_active
      and exists (
        select 1 from public.restaurants r
        where r.id = dishes.restaurant_id and r.is_active
      )
    )
  );

create policy "dishes: owner write"
  on public.dishes for all
  to authenticated
  using (public.is_restaurant_owner(restaurant_id))
  with check (public.is_restaurant_owner(restaurant_id));

-- ---------------------------------------------------------------------
-- 5. RPC: всё меню одним запросом для /menu/[slug]
--    security invoker (по умолчанию) -> RLS применяется, анонимам отдаются только активные данные
-- ---------------------------------------------------------------------
create or replace function public.get_public_menu(p_slug text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id',                r.id,
      'slug',              r.slug,
      'name',              r.name,
      'description',       r.description,
      'logo_url',          r.logo_url,
      'cover_url',         r.cover_url,
      'phone',             r.phone,
      'address',           r.address,
      'instagram',         r.instagram,
      'wifi_name',         r.wifi_name,
      'wifi_password',     r.wifi_password,
      'currency',          r.currency,
      'default_language',  r.default_language,
      'enabled_languages', r.enabled_languages
    ),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',   c.id,
          'name', c.name,
          'dishes', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id',           d.id,
                'name',         d.name,
                'description',  d.description,
                'price',        d.price,
                'image_url',    d.image_url,
                'weight_info',  d.weight_info,
                'calories',     d.calories,
                'tags',         d.tags,
                'allergens',    d.allergens,
                'is_available', d.is_available
              ) order by d.sort_order, d.created_at
            )
            from public.dishes d
            where d.category_id = c.id and d.is_active
          ), '[]'::jsonb)
        ) order by c.sort_order, c.created_at
      )
      from public.categories c
      where c.restaurant_id = r.id and c.is_active
    ), '[]'::jsonb)
  )
  from public.restaurants r
  where r.slug = p_slug and r.is_active;
$$;

grant execute on function public.get_public_menu(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. (Опционально) Пример тестовых данных
--    Раскомментируйте и подставьте реальный UUID пользователя из auth.users
-- ---------------------------------------------------------------------
-- with r as (
--   insert into public.restaurants (owner_id, slug, name, description)
--   values ('00000000-0000-0000-0000-000000000000', 'demo-cafe', 'Demo Cafe',
--           '{"tr":"Taze ve lezzetli","en":"Fresh and tasty","ru":"Свежо и вкусно","de":"Frisch und lecker"}')
--   returning id
-- ), c as (
--   insert into public.categories (restaurant_id, name, sort_order)
--   select id, '{"tr":"Ana Yemekler","en":"Main Courses","ru":"Основные блюда","de":"Hauptgerichte"}', 1 from r
--   returning id, restaurant_id
-- )
-- insert into public.dishes (restaurant_id, category_id, name, description, price, tags)
-- select restaurant_id, id,
--   '{"tr":"Adana Kebap","en":"Adana Kebab","ru":"Адана-кебаб","de":"Adana-Kebab"}',
--   '{"tr":"Acılı kıyma kebabı","en":"Spicy minced meat kebab","ru":"Острый кебаб из рубленого мяса","de":"Scharfer Hackfleisch-Kebab"}',
--   420.00, array['spicy','halal']
-- from c;
