-- Date Atlas core schema. Apply with `supabase db push` to your own project.
create extension if not exists pgcrypto;

create function public.is_atlas_admin() returns boolean language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 100), created_at timestamptz not null default now()
);
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table public.cities (
  id uuid primary key default gen_random_uuid(), name text not null, country_name text not null,
  country_code char(2) not null, currency char(3) not null, timezone text not null,
  active boolean not null default false, unique(name,country_code)
);
create table public.areas (
  id uuid primary key default gen_random_uuid(), city_id uuid not null references public.cities(id),
  name text not null, latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180), unique(city_id,name)
);
create table public.venues (
  id uuid primary key default gen_random_uuid(), area_id uuid not null references public.areas(id),
  name text not null, address text, latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  indoor boolean not null, quiet boolean not null default false, accessible boolean,
  public_venue boolean not null default true, active boolean not null default false, approved boolean not null default false,
  is_demo boolean not null default false, source_url text, verified_at date,
  created_at timestamptz not null default now(), check(is_demo or not approved or (source_url is not null and verified_at is not null))
);
create table public.experience_categories (id text primary key, name text not null unique);
insert into public.experience_categories(id,name) values
  ('art','Art & culture'),('dining','Food & dining'),('nature','Nature & outdoors'),('games','Fun & games'),('unique','Unique experiences');
create table public.experiences (
  id text primary key default gen_random_uuid()::text, venue_id uuid not null references public.venues(id) on delete cascade,
  category_id text not null references public.experience_categories(id), name text not null, description text not null,
  image text not null, duration integer not null check(duration between 15 and 720),
  max_guests integer not null check(max_guests between 1 and 100), dietary text[] not null default '{}',
  active boolean not null default false, approved boolean not null default false,
  booking_url text, reservation text not null default 'Contact the venue to confirm details and availability.',
  quality numeric not null default 0.5 check(quality between 0 and 1), created_at timestamptz not null default now()
);
create table public.experience_tags (
  experience_id text not null references public.experiences(id) on delete cascade,
  tag text not null, kind text not null check(kind in ('vibe','occasion','interest')), primary key(experience_id,tag,kind)
);
create table public.venue_opening_hours (
  id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id) on delete cascade,
  day integer not null check(day between 0 and 6), opens integer not null check(opens between 0 and 1439),
  closes integer not null check(closes between 1 and 1440), check(closes > opens), unique(venue_id,day,opens)
);
create table public.experience_prices (
  id uuid primary key default gen_random_uuid(), experience_id text not null references public.experiences(id) on delete cascade,
  amount integer not null check(amount >= 0), currency char(3) not null default 'NGN',
  price_type text not null check(price_type in ('per-person','group')),
  valid_from date not null default current_date, valid_until date, verified_at date, source_url text, created_at timestamptz not null default now(),
  check(valid_until is null or valid_until >= valid_from)
);
create table public.experience_availability (
  id uuid primary key default gen_random_uuid(), experience_id text not null references public.experiences(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, capacity integer not null check(capacity >= 0),
  source_url text not null, checked_at timestamptz not null, check(ends_at > starts_at)
);
create table public.plan_requests (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  preferences jsonb not null, created_at timestamptz not null default now()
);
create table public.date_plans (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
  request_id uuid references public.plan_requests(id), title text not null, currency char(3) not null,
  total integer not null check(total >= 0), budget integer not null check(budget >= total),
  transport_estimate integer not null default 0 check(transport_estimate >= 0),
  contingency integer not null default 0 check(contingency >= 0), match_score integer check(match_score between 0 and 100),
  is_demo boolean not null default false, created_at timestamptz not null default now()
);
create table public.date_plan_activities (
  id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.date_plans(id) on delete cascade,
  experience_id text not null references public.experiences(id), position integer not null check(position between 0 and 3),
  starts_at timestamptz not null, ends_at timestamptz not null, estimated_cost integer not null check(estimated_cost >= 0),
  check(ends_at > starts_at), unique(plan_id,position), unique(plan_id,experience_id)
);
create table public.saved_plans (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.date_plans(id) on delete set null, plan_key text not null,
  recipe jsonb not null, created_at timestamptz not null default now(), unique(user_id,plan_key)
);
-- Marketplace tables are a foundation only. Users cannot confirm reservations or change payment state.
create table public.bookings (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  experience_id text not null references public.experiences(id), starts_at timestamptz not null,
  guests integer not null check(guests > 0), status text not null default 'requested' check(status in ('requested','accepted','rejected','cancelled','confirmed')),
  created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.bookings(id),
  user_id uuid not null references auth.users(id) on delete cascade, provider_reference text unique,
  amount integer not null check(amount > 0), currency char(3) not null, status text not null default 'pending' check(status in ('pending','paid','failed','refunded')),
  created_at timestamptz not null default now()
);
create table public.user_feedback (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  saved_plan_id uuid references public.saved_plans(id) on delete set null, enjoyed boolean, accurate_budget boolean,
  would_recommend boolean, notes text check(char_length(notes) <= 2000), created_at timestamptz not null default now()
);
create table public.recommendation_events (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
  request_id uuid references public.plan_requests(id), event_type text not null,
  diagnostics jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create index venues_area_active on public.venues(area_id) where active and approved;
create index experiences_venue_active on public.experiences(venue_id) where active and approved;
create index experiences_category on public.experiences(category_id);
create index experience_prices_current on public.experience_prices(experience_id, valid_from desc);
create index experience_availability_dates on public.experience_availability(experience_id, starts_at);
create index experience_tags_lookup on public.experience_tags(kind,tag);
create index opening_hours_venue on public.venue_opening_hours(venue_id,day);
create index plan_requests_user on public.plan_requests(user_id);
create index date_plans_user on public.date_plans(user_id);
create index saved_plans_user on public.saved_plans(user_id,created_at desc);
create index bookings_user on public.bookings(user_id,created_at desc);
create index payments_user on public.payments(user_id);
create index feedback_user on public.user_feedback(user_id);
create index recommendation_events_created on public.recommendation_events(created_at desc);

-- All writes to catalog tables are restricted to a trusted app_metadata admin role.
do $$ declare relation text; begin
  foreach relation in array array['profiles','user_preferences','cities','areas','venues','experiences','experience_categories','experience_tags','venue_opening_hours','experience_prices','experience_availability','plan_requests','date_plans','date_plan_activities','saved_plans','bookings','payments','user_feedback','recommendation_events'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('create policy admin_manage on public.%I for all to authenticated using (public.is_atlas_admin()) with check (public.is_atlas_admin())',relation);
    execute format('grant all on public.%I to service_role',relation);
  end loop;
end $$;
create policy cities_read on public.cities for select to anon,authenticated using(active);
create policy areas_read on public.areas for select to anon,authenticated using(exists(select 1 from public.cities c where c.id=city_id and c.active));
create policy categories_read on public.experience_categories for select to anon,authenticated using(true);
create policy venues_read on public.venues for select to anon,authenticated using(active and approved and not is_demo);
create policy experiences_read on public.experiences for select to anon,authenticated using(active and approved and exists(select 1 from public.venues v where v.id=venue_id and v.active and v.approved and not v.is_demo));
create policy tags_read on public.experience_tags for select to anon,authenticated using(exists(select 1 from public.experiences e where e.id=experience_id));
create policy prices_read on public.experience_prices for select to anon,authenticated using(exists(select 1 from public.experiences e where e.id=experience_id));
create policy hours_read on public.venue_opening_hours for select to anon,authenticated using(exists(select 1 from public.venues v where v.id=venue_id));
create policy availability_read on public.experience_availability for select to anon,authenticated using(exists(select 1 from public.experiences e where e.id=experience_id));
create policy profile_own on public.profiles for all to authenticated using(auth.uid()=id) with check(auth.uid()=id);
create policy preferences_own on public.user_preferences for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy saved_own on public.saved_plans for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy request_own on public.plan_requests for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy plans_own_read on public.date_plans for select to authenticated using(auth.uid()=user_id);
create policy activities_own_read on public.date_plan_activities for select to authenticated using(exists(select 1 from public.date_plans p where p.id=plan_id and p.user_id=auth.uid()));
create policy bookings_own_read on public.bookings for select to authenticated using(auth.uid()=user_id);
create policy payments_own_read on public.payments for select to authenticated using(auth.uid()=user_id);
create policy feedback_own on public.user_feedback for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id and (saved_plan_id is null or exists(select 1 from public.saved_plans s where s.id=saved_plan_id and s.user_id=auth.uid())));

grant select on public.cities,public.areas,public.venues,public.experiences,public.experience_categories,public.experience_tags,public.venue_opening_hours,public.experience_prices,public.experience_availability to anon,authenticated;
grant select,insert,update,delete on public.profiles,public.user_preferences,public.saved_plans,public.plan_requests,public.user_feedback to authenticated;
grant select on public.date_plans,public.date_plan_activities,public.bookings,public.payments to authenticated;
-- RLS still restricts catalog and operational writes to admins.
grant insert,update,delete on public.cities,public.areas,public.venues,public.experiences,public.experience_categories,public.experience_tags,public.venue_opening_hours,public.experience_prices,public.experience_availability,public.date_plans,public.date_plan_activities,public.bookings,public.payments,public.recommendation_events to authenticated;
grant select on public.recommendation_events to authenticated;

-- Invoker security keeps all underlying RLS policies in force for API clients.
create view public.experience_catalog with (security_invoker=true) as
select jsonb_build_object(
  'id',e.id,'name',e.name,'venue',v.name,'description',e.description,
  'city',c.name,'area',a.name,'country',c.country_name,'currency',p.currency,
  'category',cat.name,'image',e.image,'price',p.amount,'priceType',p.price_type,
  'duration',e.duration,'lat',v.latitude,'lng',v.longitude,
  'vibes',coalesce((select jsonb_agg(t.tag) from public.experience_tags t where t.experience_id=e.id and t.kind='vibe'),'[]'::jsonb),
  'occasions',coalesce((select jsonb_agg(t.tag) from public.experience_tags t where t.experience_id=e.id and t.kind='occasion'),'[]'::jsonb),
  'tags',coalesce((select jsonb_agg(t.tag) from public.experience_tags t where t.experience_id=e.id and t.kind='interest'),'[]'::jsonb),
  'indoor',v.indoor,'quiet',v.quiet,'accessible',v.accessible,'dietary',e.dietary,
  'publicVenue',v.public_venue,'maxGuests',e.max_guests,
  'hours',coalesce((select jsonb_agg(jsonb_build_object('day',h.day,'open',h.opens,'close',h.closes)) from public.venue_opening_hours h where h.venue_id=v.id),'[]'::jsonb),
  'active',e.active and v.active and c.active,'approved',e.approved and v.approved,
  'demo',v.is_demo,'verifiedAt',p.verified_at,'sourceUrl',p.source_url,
  'bookingUrl',e.booking_url,'reservation',e.reservation,'quality',e.quality
) as record
from public.experiences e
join public.venues v on v.id=e.venue_id
join public.areas a on a.id=v.area_id
join public.cities c on c.id=a.city_id
join public.experience_categories cat on cat.id=e.category_id
join lateral (
  select * from public.experience_prices ep where ep.experience_id=e.id
  and ep.valid_from <= current_date and (ep.valid_until is null or ep.valid_until >= current_date)
  order by ep.valid_from desc,ep.verified_at desc nulls last,ep.created_at desc,ep.id limit 1
) p on true
;
grant select on public.experience_catalog to anon,authenticated;

insert into public.cities(name,country_name,country_code,currency,timezone,active) values
  ('Lagos','Nigeria','NG','NGN','Africa/Lagos',true),('Abuja','Nigeria','NG','NGN','Africa/Lagos',false),
  ('Port Harcourt','Nigeria','NG','NGN','Africa/Lagos',false),('Ibadan','Nigeria','NG','NGN','Africa/Lagos',false),
  ('Enugu','Nigeria','NG','NGN','Africa/Lagos',false),('Benin City','Nigeria','NG','NGN','Africa/Lagos',false);
insert into public.areas(city_id,name,latitude,longitude)
select c.id,a.name,a.lat,a.lng from public.cities c cross join (values
  ('Lekki',6.4433,3.4748),('Victoria Island',6.4281,3.4219),('Ikoyi',6.4549,3.4351),('Ikeja',6.6018,3.3515)
) a(name,lat,lng) where c.name='Lagos' and c.country_code='NG';

-- Atomic catalog updates: either all relational records are updated, or none are.
create function public.upsert_atlas_experience(item jsonb) returns text language plpgsql security invoker set search_path = '' as $$
declare target_area uuid; target_venue uuid; target_category text; target_id text;
begin
  if not public.is_atlas_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
  select a.id into target_area from public.areas a join public.cities c on c.id=a.city_id
    where a.name=item->>'area' and c.name=item->>'city' and c.country_name=item->>'country';
  if target_area is null then raise exception 'Add this city and area before importing experiences'; end if;
  select id into target_category from public.experience_categories where name=item->>'category';
  if target_category is null then raise exception 'Unknown experience category'; end if;
  target_id := item->>'id';
  select venue_id into target_venue from public.experiences where id=target_id;
  if target_venue is null then
    insert into public.venues(area_id,name,latitude,longitude,indoor) values(target_area,item->>'venue',(item->>'lat')::double precision,(item->>'lng')::double precision,(item->>'indoor')::boolean) returning id into target_venue;
  end if;
  update public.venues set area_id=target_area,name=item->>'venue',latitude=(item->>'lat')::double precision,
    longitude=(item->>'lng')::double precision,indoor=(item->>'indoor')::boolean,quiet=(item->>'quiet')::boolean,
    accessible=(item->>'accessible')::boolean,public_venue=(item->>'publicVenue')::boolean,
    active=(item->>'active')::boolean,approved=(item->>'approved')::boolean,is_demo=(item->>'demo')::boolean,
    source_url=item->>'sourceUrl',verified_at=(item->>'verifiedAt')::date where id=target_venue;
  insert into public.experiences(id,venue_id,category_id,name,description,image,duration,max_guests,dietary,active,approved,booking_url,reservation,quality)
    values(target_id,target_venue,target_category,item->>'name',item->>'description',item->>'image',(item->>'duration')::integer,(item->>'maxGuests')::integer,
    array(select jsonb_array_elements_text(item->'dietary')),(item->>'active')::boolean,(item->>'approved')::boolean,item->>'bookingUrl',item->>'reservation',(item->>'quality')::numeric)
    on conflict(id) do update set category_id=excluded.category_id,name=excluded.name,description=excluded.description,
    image=excluded.image,duration=excluded.duration,max_guests=excluded.max_guests,dietary=excluded.dietary,
    active=excluded.active,approved=excluded.approved,booking_url=excluded.booking_url,reservation=excluded.reservation,quality=excluded.quality;
  delete from public.experience_tags where experience_id=target_id;
  insert into public.experience_tags(experience_id,tag,kind) select distinct target_id,jsonb_array_elements_text(item->'vibes'),'vibe';
  insert into public.experience_tags(experience_id,tag,kind) select distinct target_id,jsonb_array_elements_text(item->'occasions'),'occasion';
  insert into public.experience_tags(experience_id,tag,kind) select distinct target_id,jsonb_array_elements_text(item->'tags'),'interest';
  delete from public.venue_opening_hours where venue_id=target_venue;
  insert into public.venue_opening_hours(venue_id,day,opens,closes)
    select target_venue,(h->>'day')::integer,(h->>'open')::integer,(h->>'close')::integer from jsonb_array_elements(item->'hours') h;
  insert into public.experience_prices(experience_id,amount,currency,price_type,verified_at,source_url)
    values(target_id,(item->>'price')::integer,item->>'currency',item->>'priceType',(item->>'verifiedAt')::date,item->>'sourceUrl');
  return target_id;
end $$;
revoke all on function public.upsert_atlas_experience(jsonb) from public,anon;
grant execute on function public.upsert_atlas_experience(jsonb) to authenticated;
