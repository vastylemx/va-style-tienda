-- Pruebas controladas y reversibles. Ejecutar únicamente después de aplicar
-- 202607290001_whatsapp_round_robin.sql en un entorno de pruebas.
begin;

delete from public.whatsapp_assignment_requests;
delete from public.whatsapp_rate_limits;
update public.whatsapp_advisor_lines set is_active = true;
update public.whatsapp_round_robin_state set next_sequence = 0 where id = true;
update public.whatsapp_assignment_settings set max_requests = 100, window_seconds = 300 where id = true;

-- A. Secuencia normal: 1,2,3,1,2,3,1,2,3,1.
do $$
declare
  expected smallint[] := array[1,2,3,1,2,3,1,2,3,1]::smallint[];
  observed smallint[] := array[]::smallint[];
  assignment record;
  index_value integer;
  request_value uuid;
begin
  for index_value in 1..10 loop
    request_value := format(
      '00000000-0000-4000-8000-%s',
      lpad(index_value::text, 12, '0')
    )::uuid;
    select * into assignment
    from public.assign_whatsapp_advisor(request_value, repeat('a', 64));
    observed := array_append(observed, assignment.advisor_line);
  end loop;
  if observed <> expected then
    raise exception 'Secuencia incorrecta: %, esperada: %', observed, expected;
  end if;
end;
$$;

-- B. Línea 2 desactivada: 1,3,1,3,1,3.
delete from public.whatsapp_assignment_requests;
delete from public.whatsapp_rate_limits;
update public.whatsapp_round_robin_state set next_sequence = 0 where id = true;
update public.whatsapp_advisor_lines set is_active = (id <> 2);

do $$
declare
  expected smallint[] := array[1,3,1,3,1,3]::smallint[];
  observed smallint[] := array[]::smallint[];
  assignment record;
  index_value integer;
begin
  for index_value in 1..6 loop
    select * into assignment
    from public.assign_whatsapp_advisor(
      format('10000000-0000-4000-8000-%s', lpad(index_value::text, 12, '0'))::uuid,
      repeat('b', 64)
    );
    observed := array_append(observed, assignment.advisor_line);
  end loop;
  if observed <> expected then
    raise exception 'Salto de línea inactiva incorrecto: %, esperado: %', observed, expected;
  end if;
end;
$$;

-- C. Todas desactivadas: cero filas y next_sequence sin cambios.
delete from public.whatsapp_assignment_requests;
delete from public.whatsapp_rate_limits;
update public.whatsapp_advisor_lines set is_active = false;
update public.whatsapp_round_robin_state set next_sequence = 41 where id = true;

do $$
declare
  assignment record;
  sequence_before bigint;
  sequence_after bigint;
begin
  select next_sequence into sequence_before from public.whatsapp_round_robin_state where id = true;
  select * into assignment
  from public.assign_whatsapp_advisor(
    '20000000-0000-4000-8000-000000000001'::uuid,
    repeat('c', 64)
  );
  if found then
    raise exception 'No debía existir asignación con todas las líneas inactivas.';
  end if;
  select next_sequence into sequence_after from public.whatsapp_round_robin_state where id = true;
  if sequence_after <> sequence_before then
    raise exception 'El contador avanzó sin líneas: antes %, después %', sequence_before, sequence_after;
  end if;
end;
$$;

-- D. Fila de estado eliminada: se recrea y devuelve una asignación válida.
delete from public.whatsapp_assignment_requests;
delete from public.whatsapp_rate_limits;
update public.whatsapp_advisor_lines set is_active = true;
delete from public.whatsapp_round_robin_state where id = true;

do $$
declare
  assignment record;
  restored_sequence bigint;
begin
  select * into assignment
  from public.assign_whatsapp_advisor(
    '30000000-0000-4000-8000-000000000001'::uuid,
    repeat('d', 64)
  );
  if assignment.advisor_line <> 1 then
    raise exception 'La recuperación debía comenzar en Línea 1, devolvió %', assignment.advisor_line;
  end if;
  select next_sequence into restored_sequence from public.whatsapp_round_robin_state where id = true;
  if restored_sequence <> 1 then
    raise exception 'La fila de estado no se recreó correctamente: %', restored_sequence;
  end if;
end;
$$;

-- E. Activar/desactivar entre asignaciones nunca devuelve una línea inactiva.
delete from public.whatsapp_assignment_requests;
delete from public.whatsapp_rate_limits;
update public.whatsapp_round_robin_state set next_sequence = 0 where id = true;
update public.whatsapp_advisor_lines set is_active = true;

do $$
declare
  assignment record;
begin
  select * into assignment from public.assign_whatsapp_advisor(
    '40000000-0000-4000-8000-000000000001'::uuid, repeat('e', 64)
  );
  update public.whatsapp_advisor_lines set is_active = false where id = 2;
  select * into assignment from public.assign_whatsapp_advisor(
    '40000000-0000-4000-8000-000000000002'::uuid, repeat('e', 64)
  );
  if assignment.advisor_line = 2 then
    raise exception 'Se devolvió una línea inactiva.';
  end if;
  update public.whatsapp_advisor_lines set is_active = true where id = 2;
  select * into assignment from public.assign_whatsapp_advisor(
    '40000000-0000-4000-8000-000000000003'::uuid, repeat('e', 64)
  );
  if not exists (
    select 1 from public.whatsapp_advisor_lines
    where id = assignment.advisor_line and is_active
  ) then
    raise exception 'La línea reactivada no se integró a un conjunto válido.';
  end if;
end;
$$;

-- F. El constraint rechaza números inválidos.
do $$
declare
  rejected boolean := false;
begin
  begin
    update public.whatsapp_advisor_lines set phone_number = '' where id = 1;
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'El constraint aceptó un número vacío.';
  end if;
end;
$$;

-- G. Rate limit: tres permitidas, cuarta bloqueada y sin avance de secuencia.
delete from public.whatsapp_assignment_requests;
delete from public.whatsapp_rate_limits;
update public.whatsapp_advisor_lines set is_active = true;
update public.whatsapp_round_robin_state set next_sequence = 0 where id = true;
update public.whatsapp_assignment_settings set max_requests = 3, window_seconds = 300 where id = true;

do $$
declare
  assignment record;
  index_value integer;
  sequence_before bigint;
  sequence_after bigint;
begin
  for index_value in 1..3 loop
    select * into assignment from public.assign_whatsapp_advisor(
      format('50000000-0000-4000-8000-%s', lpad(index_value::text, 12, '0'))::uuid,
      repeat('f', 64)
    );
    if assignment.rate_limited then
      raise exception 'Solicitud % fue limitada antes de tiempo.', index_value;
    end if;
  end loop;
  select next_sequence into sequence_before from public.whatsapp_round_robin_state where id = true;
  select * into assignment from public.assign_whatsapp_advisor(
    '50000000-0000-4000-8000-000000000004'::uuid,
    repeat('f', 64)
  );
  if not assignment.rate_limited then
    raise exception 'La cuarta solicitud debía recibir rate limit.';
  end if;
  select next_sequence into sequence_after from public.whatsapp_round_robin_state where id = true;
  if sequence_after <> sequence_before then
    raise exception 'Una solicitud limitada avanzó el turno.';
  end if;
end;
$$;

-- H. Idempotencia: el mismo requestId devuelve la asignación previa sin otro turno.
delete from public.whatsapp_assignment_requests;
delete from public.whatsapp_rate_limits;
update public.whatsapp_round_robin_state set next_sequence = 0 where id = true;
update public.whatsapp_assignment_settings set max_requests = 100 where id = true;

do $$
declare
  first_assignment record;
  repeated_assignment record;
  sequence_after_first bigint;
  sequence_after_repeat bigint;
begin
  select * into first_assignment from public.assign_whatsapp_advisor(
    '60000000-0000-4000-8000-000000000001'::uuid,
    repeat('0', 64)
  );
  select next_sequence into sequence_after_first from public.whatsapp_round_robin_state where id = true;
  select * into repeated_assignment from public.assign_whatsapp_advisor(
    '60000000-0000-4000-8000-000000000001'::uuid,
    repeat('0', 64)
  );
  select next_sequence into sequence_after_repeat from public.whatsapp_round_robin_state where id = true;
  if repeated_assignment.advisor_line <> first_assignment.advisor_line
    or repeated_assignment.phone_number <> first_assignment.phone_number
    or not repeated_assignment.duplicate_request then
    raise exception 'La respuesta idempotente no coincide con la original.';
  end if;
  if sequence_after_repeat <> sequence_after_first then
    raise exception 'El requestId repetido consumió otro turno.';
  end if;
end;
$$;

rollback;
