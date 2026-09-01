-- ============================================================================
-- 001 - Impedir overbooking a nivel de base de datos
-- ============================================================================
-- Se aplica despues de schema.sql, indexes.sql y rls.sql.
--
-- El problema: en la epoca de Mongo, crear una reserva consultaba si la
-- habitacion estaba libre y despues insertaba. Entre esas dos operaciones cabe
-- otra reserva. Dos recepcionistas vendiendo la misma habitacion para las
-- mismas fechas, con dos huespedes presentandose la misma noche, es el peor
-- fallo que puede tener un PMS -- y ningun chequeo hecho en la aplicacion lo
-- evita del todo, porque siempre queda esa ventana entre leer y escribir.
--
-- server.py ya toma un pg_advisory_xact_lock por hotel antes de comprobar, lo
-- que cierra la ventana para el camino normal. Este constraint es la garantia
-- de verdad: aunque alguien escriba en la tabla desde otro sitio -- un script
-- de importacion, una carga masiva, un endpoint nuevo que se olvide del lock --
-- Postgres rechaza el solapamiento.
--
-- Como funciona: un constraint EXCLUDE compara cada fila nueva con las que ya
-- estan. Rechaza la insercion si existe otra fila con la MISMA habitacion (=) y
-- un rango de fechas que SE SOLAPA (&&).
--
-- El rango es '[)' -- incluye el dia de entrada y excluye el de salida --
-- porque asi funciona un hotel: la reserva que sale el dia 10 y la que entra el
-- dia 10 no se pisan, la habitacion se limpia entre una y otra.
--
-- El WHERE parcial deja fuera:
--   - las reservas sin habitacion asignada (room_id is null), que son las que
--     todavia no se ubicaron y por definicion no ocupan nada;
--   - las canceladas, las no-show y las que ya hicieron checkout, que liberan
--     la habitacion y deben poder solaparse con las nuevas.
-- ============================================================================

-- btree_gist permite mezclar en un mismo indice GiST una comparacion de
-- igualdad normal (room_id con =) y una de solapamiento (el rango con &&).
-- Sin esta extension, GiST no sabe indexar el uuid.
create extension if not exists btree_gist;

alter table reservations
    add constraint reservations_sin_overbooking
    exclude using gist (
        room_id with =,
        daterange(checkin_date, checkout_date, '[)') with &&
    )
    where (room_id is not null and status in ('CONFIRMED', 'CHECKED_IN'));

-- Nota para cuando toque cambiar estados: si en el futuro se agrega un estado
-- que tambien ocupa la habitacion, hay que incluirlo en el WHERE de arriba o
-- ese estado dejara de estar protegido en silencio.
