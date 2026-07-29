-- Round-robin global, deduplicación y rate limit de WhatsApp.
-- Migración preparada para revisión; no se aplica automáticamente.

create table if not exists public.whatsapp_advisor_lines (
  id smallint primary key check (id between 1 and 3),
  phone_number text not null unique check (phone_number ~ '^[0-9]{10,15}$'),
  is_active boolean not null default true,
  display_order smallint not null unique check (display_order between 1 and 3),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_round_robin_state (
  id boolean primary key default true check (id),
  next_sequence bigint not null default 0 check (next_sequence >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_assignment_settings (
  id boolean primary key default true check (id),
  max_requests integer not null default 8 check (max_requests between 1 and 100),
  window_seconds integer not null default 300 check (window_seconds between 30 and 86400),
  retention_hours integer not null default 24 check (retention_hours between 1 and 168),
  updated_at timestamptz not null default now()
);

-- Un registro por hash de cliente. No almacena IP completa.
create table if not exists public.whatsapp_rate_limits (
  client_hash text primary key check (client_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

-- Solo conserva interacciones aceptadas durante el periodo de deduplicación.
create table if not exists public.whatsapp_assignment_requests (
  request_id uuid primary key,
  client_hash text not null check (client_hash ~ '^[a-f0-9]{64}$'),
  advisor_line smallint not null check (advisor_line between 1 and 3),
  phone_number text not null check (phone_number ~ '^[0-9]{10,15}$'),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_rate_limits_window_idx
  on public.whatsapp_rate_limits (window_started_at);
create index if not exists whatsapp_assignment_requests_created_idx
  on public.whatsapp_assignment_requests (created_at);
create index if not exists whatsapp_assignment_requests_client_idx
  on public.whatsapp_assignment_requests (client_hash, created_at);

insert into public.whatsapp_advisor_lines (id, phone_number, is_active, display_order) values
  (1, '524821357950', true, 1),
  (2, '524791438636', true, 2),
  (3, '524779177633', true, 3)
on conflict (id) do nothing;

insert into public.whatsapp_round_robin_state (id, next_sequence)
values (true, 0)
on conflict (id) do nothing;

insert into public.whatsapp_assignment_settings
  (id, max_requests, window_seconds, retention_hours)
values (true, 8, 300, 24)
on conflict (id) do nothing;

alter table public.whatsapp_advisor_lines enable row level security;
alter table public.whatsapp_round_robin_state enable row level security;
alter table public.whatsapp_assignment_settings enable row level security;
alter table public.whatsapp_rate_limits enable row level security;
alter table public.whatsapp_assignment_requests enable row level security;

-- Ninguna tabla interna se consulta directamente desde el navegador.
revoke all on public.whatsapp_advisor_lines from public, anon, authenticated;
revoke all on public.whatsapp_round_robin_state from public, anon, authenticated;
revoke all on public.whatsapp_assignment_settings from public, anon, authenticated;
revoke all on public.whatsapp_rate_limits from public, anon, authenticated;
revoke all on public.whatsapp_assignment_requests from public, anon, authenticated;

create or replace function public.assign_whatsapp_advisor(
  p_request_id uuid,
  p_client_hash text
)
returns table (
  advisor_line smallint,
  phone_number text,
  rate_limited boolean,
  duplicate_request boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  assigned_sequence bigint;
  active_line_ids smallint[];
  active_phone_numbers text[];
  active_count integer;
  selected_offset integer;
  setting_max_requests integer;
  setting_window_seconds integer;
  setting_retention_hours integer;
  rate_row public.whatsapp_rate_limits%rowtype;
  previous_request public.whatsapp_assignment_requests%rowtype;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'requestId es obligatorio.';
  end if;
  if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'clientHash no es válido.';
  end if;

  -- Serializa reintentos del mismo requestId, incluso si llegan desde hashes distintos.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 71001)
  );

  select * into previous_request
  from public.whatsapp_assignment_requests
  where request_id = p_request_id;

  if found then
    return query select
      previous_request.advisor_line,
      previous_request.phone_number,
      false,
      true,
      0;
    return;
  end if;

  -- Serializa la ventana de este cliente entre todas las instancias serverless.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_client_hash, 71002)
  );

  insert into public.whatsapp_assignment_settings
    (id, max_requests, window_seconds, retention_hours)
  values (true, 8, 300, 24)
  on conflict (id) do nothing;

  select max_requests, window_seconds, retention_hours
  into setting_max_requests, setting_window_seconds, setting_retention_hours
  from public.whatsapp_assignment_settings
  where id = true;

  if setting_max_requests is null or setting_window_seconds is null then
    raise exception using errcode = '55000', message = 'Configuración de rate limit no disponible.';
  end if;

  -- Limpieza incremental y determinista. Los lotes acotados evitan pausas largas
  -- y funcionan incluso cuando la solicitud terminará limitada o sin líneas.
  with expired as (
    select request_id
    from public.whatsapp_assignment_requests
    where created_at < clock_timestamp()
      - pg_catalog.make_interval(hours => setting_retention_hours)
    order by created_at
    limit 100
    for update skip locked
  )
  delete from public.whatsapp_assignment_requests as request
  using expired
  where request.request_id = expired.request_id;

  with expired as (
    select client_hash
    from public.whatsapp_rate_limits
    where window_started_at < clock_timestamp()
      - pg_catalog.make_interval(hours => setting_retention_hours)
    order by window_started_at
    limit 100
    for update skip locked
  )
  delete from public.whatsapp_rate_limits as rate_limit
  using expired
  where rate_limit.client_hash = expired.client_hash;

  select * into rate_row
  from public.whatsapp_rate_limits
  where client_hash = p_client_hash;

  if not found then
    insert into public.whatsapp_rate_limits
      (client_hash, window_started_at, request_count, updated_at)
    values (p_client_hash, clock_timestamp(), 1, clock_timestamp())
    returning * into rate_row;
  elsif rate_row.window_started_at
      <= clock_timestamp() - pg_catalog.make_interval(secs => setting_window_seconds) then
    update public.whatsapp_rate_limits
    set window_started_at = clock_timestamp(),
        request_count = 1,
        updated_at = clock_timestamp()
    where client_hash = p_client_hash
    returning * into rate_row;
  elsif rate_row.request_count >= setting_max_requests then
    return query select
      null::smallint,
      null::text,
      true,
      false,
      greatest(
        1,
        ceil(extract(epoch from (
          rate_row.window_started_at
          + pg_catalog.make_interval(secs => setting_window_seconds)
          - clock_timestamp()
        )))::integer
      );
    return;
  else
    update public.whatsapp_rate_limits
    set request_count = request_count + 1,
        updated_at = clock_timestamp()
    where client_hash = p_client_hash
    returning * into rate_row;
  end if;

  -- SHARE permite muchas asignaciones simultáneas y hace esperar la rara edición
  -- administrativa hasta que la selección termine.
  lock table public.whatsapp_advisor_lines in share mode;

  select
    array_agg(line.id order by line.display_order, line.id),
    array_agg(line.phone_number order by line.display_order, line.id)
  into active_line_ids, active_phone_numbers
  from public.whatsapp_advisor_lines as line
  where line.is_active
    and line.phone_number ~ '^[0-9]{10,15}$';

  active_count := coalesce(cardinality(active_line_ids), 0);
  if active_count = 0 then
    -- No avanza next_sequence. El endpoint abrirá la línea principal de fallback.
    return;
  end if;

  -- Autorrepara de forma concurrentemente segura una fila de estado ausente.
  insert into public.whatsapp_round_robin_state (id, next_sequence, updated_at)
  values (true, 0, clock_timestamp())
  on conflict (id) do nothing;

  update public.whatsapp_round_robin_state
  set next_sequence = next_sequence + 1,
      updated_at = clock_timestamp()
  where id = true
  returning next_sequence - 1 into assigned_sequence;

  if assigned_sequence is null then
    raise exception using errcode = '55000', message = 'No se pudo obtener una secuencia de WhatsApp.';
  end if;

  selected_offset := mod(assigned_sequence, active_count);
  advisor_line := active_line_ids[selected_offset + 1];
  phone_number := active_phone_numbers[selected_offset + 1];
  rate_limited := false;
  duplicate_request := false;
  retry_after_seconds := 0;

  insert into public.whatsapp_assignment_requests
    (request_id, client_hash, advisor_line, phone_number, created_at)
  values (p_request_id, p_client_hash, advisor_line, phone_number, clock_timestamp());

  return next;
end;
$$;

revoke all on function public.assign_whatsapp_advisor(uuid, text)
  from public, anon, authenticated;
grant execute on function public.assign_whatsapp_advisor(uuid, text)
  to service_role;

-- Reversión manual (destructiva para configuración y contador):
-- drop function if exists public.assign_whatsapp_advisor(uuid, text);
-- drop table if exists public.whatsapp_assignment_requests;
-- drop table if exists public.whatsapp_rate_limits;
-- drop table if exists public.whatsapp_assignment_settings;
-- drop table if exists public.whatsapp_round_robin_state;
-- drop table if exists public.whatsapp_advisor_lines;
