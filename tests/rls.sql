-- Run only through scripts/check-database.sh, which provisions an isolated test cluster.
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"admin"}}';
select public.upsert_atlas_experience(jsonb_build_object(
  'id','test-catalog-record','venue','Test venue','name','Test activity','description','Test catalog entry',
  'country','Nigeria','city','Lagos','area','Lekki','category','Art & culture','image','/images/art.jpg',
  'lat',6.4433,'lng',3.4748,'indoor',true,'quiet',true,'accessible',true,'publicVenue',true,
  'active',true,'approved',true,'demo',false,'sourceUrl','https://example.com/test-source','verifiedAt',current_date::text,
  'duration',60,'maxGuests',4,'dietary','[]'::jsonb,'bookingUrl',null,'reservation','Contact venue','quality',0.8,
  'price',5000,'currency','NGN','priceType','per-person','vibes','["Creative"]'::jsonb,
  'occasions','["Romantic date"]'::jsonb,'tags','["art"]'::jsonb,
  'hours','[{"day":6,"open":540,"close":1320}]'::jsonb
));
set role anon;
do $$begin
  if (select count(*) from public.experience_catalog) <> 1 then raise exception 'Approved catalog entry is not readable'; end if;
  begin
    insert into public.venues(area_id,name,latitude,longitude,indoor) values((select id from public.areas limit 1),'Unauthorized',0,0,true);
    raise exception 'Anonymous write was allowed';
  exception when insufficient_privilege then null; end;
end$$;
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{}}';
insert into public.saved_plans(user_id,plan_key,recipe) values(auth.uid(),'own-plan','{}');
do $$begin
  begin
    insert into public.saved_plans(user_id,plan_key,recipe) values('00000000-0000-0000-0000-000000000002','other-plan','{}');
    raise exception 'Cross-user save was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.upsert_atlas_experience('{}'::jsonb);
    raise exception 'Non-admin catalog update was allowed';
  exception when insufficient_privilege then null; end;
end$$;
-- User metadata is editable by users and must not grant admin permissions.
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{},"user_metadata":{"role":"admin"}}';
do $$begin if public.is_atlas_admin() then raise exception 'Editable metadata granted admin access'; end if; end$$;
reset role;
insert into public.saved_plans(user_id,plan_key,recipe) values('00000000-0000-0000-0000-000000000002','other-plan','{}');
with b as (
  insert into public.bookings(user_id,experience_id,starts_at,guests)
  values('00000000-0000-0000-0000-000000000001','test-catalog-record',now(),2) returning id,user_id
) insert into public.payments(booking_id,user_id,amount,currency)
select b.id,b.user_id,5000,'NGN' from b;

set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{}}';
do $$begin
  if (select count(*) from public.saved_plans) <> 1 then raise exception 'Cross-user saved plans leaked'; end if;
  update public.payments set status='paid' where user_id=auth.uid();
  if exists(select 1 from public.payments where status='paid') then raise exception 'Customer changed payment status'; end if;
end$$;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","app_metadata":{"role":"admin"}}';
update public.experiences set active=false where id='test-catalog-record';
set role anon;
do $$begin
  if (select count(*) from public.experience_catalog) <> 0 then raise exception 'Disabled catalog records leaked'; end if;
end$$;
reset role;
