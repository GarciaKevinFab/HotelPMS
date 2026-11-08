-- 006: pago adelantado con Mercado Pago Checkout Pro (Yape, banca movil y tarjeta)
--
-- QUE CAMBIA
--
--   La suscripcion con tarjeta (/preapproval, mensual o anual) sigue igual. Se
--   anade un pago UNICO por 1, 3, 6 o 12 meses (POST /checkout/preferences),
--   que es el unico camino por el que Mercado Pago ofrece Yape y PagoEfectivo.
--   Lo aplica el webhook `payment` (backend/webhooks_mercadopago.py).
--
--   pagos_suscripcion.periodo   admite 'adelantado-1', 'adelantado-3',
--                               'adelantado-6' y 'adelantado-12'
--   pagos_suscripcion.estado    admite 'en_revision': Mercado Pago aprobo un
--                               cobro cuyo importe no es el del catalogo. Se
--                               guarda para conciliarlo y NO activa nada. El
--                               disparador de la 005 solo abre comprobante en
--                               'pagado', asi que este no pide boleta.
--   tenants.aviso_renovacion_7d_para / aviso_renovacion_1d_para
--                               el `subscription_ends_at` para el que ya salio
--                               el recordatorio de 7 dias y el de 1 dia. Guardar
--                               la FECHA y no un booleano es lo que lo hace
--                               idempotente sin tener que limpiarlo: cuando el
--                               hotel paga otro periodo, el vencimiento cambia
--                               y el recordatorio vuelve a tocar, una vez.
--
-- No hay estados de suscripcion nuevos: un pago adelantado deja el hotel en
-- 'activa' con su subscription_ends_at, y al vencer entra la maquina de
-- siempre (vencida en gracia, luego suspendida).
--
-- Idempotente: se puede correr dos veces.

begin;

alter table pagos_suscripcion drop constraint if exists pagos_suscripcion_periodo_check;
alter table pagos_suscripcion add constraint pagos_suscripcion_periodo_check
    check (periodo in ('mensual', 'anual',
                       'adelantado-1', 'adelantado-3', 'adelantado-6', 'adelantado-12'));

alter table pagos_suscripcion drop constraint if exists pagos_suscripcion_estado_check;
alter table pagos_suscripcion add constraint pagos_suscripcion_estado_check
    check (estado in ('pendiente', 'pagado', 'fallido', 'anulado', 'devuelto', 'en_revision'));

alter table tenants add column if not exists aviso_renovacion_7d_para timestamptz;
alter table tenants add column if not exists aviso_renovacion_1d_para timestamptz;

comment on column tenants.aviso_renovacion_7d_para is
    'subscription_ends_at para el que ya se mando el recordatorio de 7 dias '
    '(pago adelantado). Ver backend/recordatorios.py.';
comment on column tenants.aviso_renovacion_1d_para is
    'subscription_ends_at para el que ya se mando el recordatorio de 1 dia '
    '(pago adelantado). Ver backend/recordatorios.py.';

commit;
