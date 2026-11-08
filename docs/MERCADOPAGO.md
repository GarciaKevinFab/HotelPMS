# Mercado Pago en ZenStay

Guía para Kevin. Cómo dejar encendido el cobro con Mercado Pago —la
suscripción con tarjeta (Suscripciones) y el pago adelantado con Yape, banca
móvil o tarjeta (Checkout Pro, sección 8)— y los comprobantes manuales. El código ya está en el repo;
lo que falta se hace en el panel de Mercado Pago y en el VPS, en este orden.

Nada de esto cobra mientras `MERCADOPAGO_MODO` no diga `prueba` o
`produccion` **y** estén puestos el token y la clave del webhook. Sin eso el
sistema sigue en modo `simulado`: el checkout crea el hotel con su prueba de
14 días y registra el pedido, como hasta ahora, sin llamar a nadie.

## 1. Una aplicación nueva, solo para ZenStay

Es la misma cuenta de Mercado Pago que LicitaPro (SOLUCIONES INFORMÁTICAS MDD
S.A.C., RUC 20490042068), pero **otra aplicación**. Cada aplicación tiene su
token, su URL de webhook y su clave secreta: si ZenStay usara la de LicitaPro,
los avisos de un producto llegarían al otro.

1. Entra a <https://www.mercadopago.com.pe/developers/panel/app> con la cuenta
   de la empresa.
2. **Crear aplicación**. Nombre: `ZenStay`. Tipo de solución: pagos online;
   producto: **Suscripciones**. Sin plataforma de e-commerce.
3. En la aplicación, **Credenciales de producción**: copia el **Access Token**
   (`APP_USR-...`). La Public Key no se usa: el pago se hace en el sitio de
   Mercado Pago (`init_point`), no con un formulario nuestro.
4. **Credenciales de prueba**: se usan solo para el paso 5.

## 2. El webhook

En la aplicación, **Webhooks › Configurar notificaciones**:

- **URL de producción** (y la de prueba, la misma):
  `https://zenstay.sisac.pe/webhooks/mercadopago`

  Va **sin** `/api`: el webhook vive en la raíz, fuera del prefijo de la API
  y fuera del limitador de peticiones. `https://zenstay.sisac.pe/api/webhooks/...`
  no existe.
- **Eventos** que hay que marcar:
  - **Planes y suscripciones** — `subscription_preapproval` (alta y
    cancelación de la suscripción) y `subscription_authorized_payment` (cada
    cobro mensual o anual, aprobado o rechazado).
  - **Pagos** — `payment`: por aquí entra el pago adelantado (Checkout Pro),
    y también las devoluciones y contracargos.
  - Ninguno más.
- Guarda y copia la **Clave secreta** que muestra Mercado Pago. Es la que firma
  la cabecera `x-signature`; sin ella el backend rechaza todos los avisos con
  401.

El botón **Simular notificación** del panel sirve para comprobar que llega
(responde 200 con `"aplicado": false` porque el id de la simulación no existe
en Mercado Pago; eso es lo correcto).

## 3. Variables en `backend/.env.production` (en el VPS)

```
# --- Mercado Pago ---
MERCADOPAGO_MODO=prueba                  # simulado | prueba | produccion
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...      # el de la aplicación ZenStay
MERCADOPAGO_WEBHOOK_SECRET=...           # la clave secreta del webhook
MERCADOPAGO_CORREOS_PRUEBA=test_user_xxx@testuser.com   # solo en modo prueba

# --- Comprobantes ---
ZENSTAY_ADMIN_EMAIL=soporte@sisac.pe     # a quién avisar de cada comprobante por emitir
ZENSTAY_URL_PUBLICA=https://zenstay.sisac.pe
# COMPROBANTES_AVISOS=0                  # opcional: apaga el aviso por correo
```

- Los correos de aviso salen por el SMTP que ya está configurado
  (`SMTP_HOST`, `SMTP_USER`, ...). Sin `ZENSTAY_ADMIN_EMAIL` no se avisa, pero
  los comprobantes igual aparecen en la consola.
- **Quita** las variables `IZIPAY_*` si estaban: Izipay se retiró del código y
  ya no se leen.
- El token y la clave no se escriben en ningún log ni en ningún mensaje de
  error. No los pegues en el repo.

## 4. Orden del despliegue

La migración va **antes** que el backend: el código nuevo lee columnas que
crea la 005. Al revés (backend nuevo con esquema viejo) el panel de
suscripción y el webhook fallarían. El backend viejo con el esquema nuevo
funciona sin cambios.

```
# 1. Respaldo
ssh -i ~/.ssh/hostinger_vps_ed25519 root@2.24.115.75 \
  '/opt/zenstay/tools/respaldar.sh /opt/zenstay/respaldos'

# 2. Migración 005 (idempotente, en una transacción)
ssh -i ~/.ssh/hostinger_vps_ed25519 root@2.24.115.75 \
  'docker exec -i zenstay-postgres psql -v ON_ERROR_STOP=1 -U postgres -d zenstay' \
  < db/migrations/005_mercadopago_comprobantes.sql

# 3. Variables del paso 3 en /opt/zenstay/backend/.env.production

# 4. Backend y frontend
bash tools/desplegar.sh
```

Comprobación rápida después:

```
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://zenstay.sisac.pe/webhooks/mercadopago
# 401 = el webhook está vivo y rechaza lo que no viene firmado
```

## 5. Probar en modo `prueba`

Mercado Pago no deja pagarse a uno mismo, ni mezclar cuentas reales con las de
prueba. Para probar hace falta un par de **usuarios de prueba**:

1. En el panel, **Cuentas de prueba › Crear cuenta de prueba**: una de
   **vendedor** y una de **comprador**, país Perú.
2. Entra (en una ventana privada) con el **vendedor de prueba**, crea allí una
   aplicación igual a la del paso 1 y usa **su** Access Token y **su** clave
   del webhook en `.env.production` con `MERCADOPAGO_MODO=prueba`.
3. Pon el correo del **comprador de prueba** en `MERCADOPAGO_CORREOS_PRUEBA`.
   En modo `prueba` solo ese correo va a Mercado Pago; cualquier otro hotel
   sigue en el camino simulado y no se le cobra nada.
4. En <https://zenstay.sisac.pe/precios>, contrata un plan creando un hotel
   cuyo **correo del administrador sea el del comprador de prueba** (Mercado
   Pago exige que el `payer_email` sea el del comprador). Paga con una de las
   tarjetas de prueba de Mercado Pago Perú.
5. Al volver a ZenStay (Configuración › Suscripción) el plan figura activo
   cuando llega el aviso del cobro, normalmente en segundos. En **Comprobantes**
   (menú del SUPER_ADMIN) aparece el cobro pendiente de emitir y llega el
   correo a `ZENSTAY_ADMIN_EMAIL`.
6. Prueba también **Cancelar suscripción** desde la cuenta del hotel: la
   suscripción pasa a cancelada en Mercado Pago y el hotel conserva el acceso
   hasta el fin del periodo pagado.

Cuando todo cuadre: credenciales de la aplicación real (paso 1),
`MERCADOPAGO_MODO=produccion`, vaciar `MERCADOPAGO_CORREOS_PRUEBA`, y
reiniciar el backend (`docker compose up -d backend` en `/opt/zenstay`).

## 6. Comprobantes, día a día

Cada cobro aprobado entra como **pendiente** con la foto de los datos que el
hotel eligió (boleta o factura, DNI o RUC; con RUC, razón social y dirección
del padrón de SUNAT). Llega un correo con los datos. Emites el comprobante en
BSNegocios y en **Comprobantes** registras serie, número, fecha y el PDF. El
hotel lo descarga desde Configuración › Suscripción.

- Si Mercado Pago devuelve un cobro cuyo comprobante seguía pendiente, pasa
  solo a "sin comprobante". Si ya estaba emitido, aparece en "Devueltos con
  comprobante emitido": toca la nota de crédito.
- "Sin comprobante" pide un motivo (por ejemplo, un cobro de prueba).

## 7. Qué hace el sistema con cada aviso

| Aviso | Efecto |
|---|---|
| `subscription_preapproval` autorizada | ata la suscripción al hotel; aún no da días |
| `subscription_authorized_payment` aprobado | asienta el cobro y suma 1 o 12 meses de calendario desde el vencimiento (o desde el fin de la prueba) |
| el mismo aviso otra vez | nada (idempotente por id de factura) |
| cobro rechazado | lo asienta como rechazado una vez; no cambia el estado: el corte lo deciden las fechas (vencida al vencer, suspendida 7 días después) |
| `subscription_preapproval` cancelada | hotel en `cancelada`, con acceso hasta el fin de lo pagado |
| `payment` devuelto o contracargo | quita el periodo de ese cobro |
| `payment` aprobado con referencia `adelantado-N` | comprueba el importe contra `planes`, asienta el pago y suma N meses (sección 8) |
| `payment` `adelantado-N` pendiente (`pending`, `in_process`) o rechazado | nada |
| `payment` `adelantado-N` con importe o moneda distintos | lo guarda en `en_revision` y **no** activa nada |
| firma inválida | 401, no se consulta nada |
| Mercado Pago caído | 503, para que Mercado Pago reintente |

El estado, el importe y el hotel nunca se toman del aviso: se consultan a la
API de Mercado Pago con nuestro token. El importe tiene que coincidir con el
pactado al crear la suscripción, que sale de la tabla `planes`.


## 8. Pago adelantado: Yape, banca móvil o tarjeta (Checkout Pro)

Además de la suscripción con tarjeta, el hotel puede pagar **1, 3, 6 o 12
meses** en un solo pago. Es el único producto de Mercado Pago que ofrece
**Yape** (hasta S/ 2.000 por operación) y **PagoEfectivo** (banca móvil BCP,
BBVA y otros, o agente). La suscripción con tarjeta no cambia.

- **Precio**: 1, 3 y 6 meses = mensualidad × meses. 12 meses = el anual que
  ya existe, 10 mensualidades (`MESES_DEL_ANUAL`). Sale de `planes` en el
  servidor (`suscripciones.precio_adelantado`); el formulario no lleva monto.
  Si el total pasa de S/ 2.000, la página de compra avisa que no habrá Yape.
- **Vigencia**: `hasta = max(ahora, hasta_actual) + meses`, donde
  `hasta_actual` es lo pagado o, en prueba, el fin de la prueba. Pagar otro
  periodo antes de que venza se suma. Al vencer entra la máquina de siempre
  (vencida 7 días en gracia, luego suspendida); no hay estados nuevos.
- **Con cobro automático vivo** el checkout no abre el pago adelantado: dice
  «Ya tienes cobro automático con tarjeta; cancélalo primero si prefieres
  pagar por adelantado».
- **Preferencia** (`mercadopago.crear_preferencia`): un ítem en PEN con el
  total del catálogo, `external_reference = zenstay|<hotel>|<plan>|adelantado-N`,
  `payer.email`, `back_urls` a `/comprar/resultado?pago=aprobado|pendiente|error`,
  `auto_return: approved`, `notification_url` al webhook de producción,
  `installments: 1` sin excluir medios, `statement_descriptor: ZENSTAY`, y
  vence a los **3 días** (`expires` + `expiration_date_to` y
  `date_of_expiration`: el código de PagoEfectivo caduca).
- **Vuelta**: `/comprar/resultado` es una página del servidor y no la cuenta,
  porque quien acaba de crear su hotel aún no inició sesión. No activa nada:
  "aprobado" dice "en unos minutos"; "pendiente", "te llegó el código de pago".
  El plan lo activa solo el webhook firmado. Desde ahí, **Ver mi suscripción**
  lleva a Configuración › Suscripción.
- **Comprobante**: el pago aprobado entra `pendiente` como cualquier otro y
  llega el mismo correo a `ZENSTAY_ADMIN_EMAIL`. El concepto dice "pago
  adelantado de N meses".
- **Importe distinto**: queda en la tabla con estado `en_revision` (no pide
  comprobante, no activa). Se concilia a mano: si el dinero es bueno, se da el
  periodo desde la consola (Hoteles › Suscripción, manual) o se devuelve en
  Mercado Pago.

### Panel de Mercado Pago

En la aplicación ZenStay, además de **Suscripciones**, tiene que estar
habilitado **Checkout Pro** (pagos online). Es el mismo Access Token y el
mismo webhook: el evento **Pagos** (`payment`) ya está marcado (sección 2).

### Recordatorio de renovación

A **7 días** y a **1 día** de `subscription_ends_at` sale un correo al
administrador del hotel (el ADMIN activo más antiguo; si no hay, el correo del
hotel) con el botón **Renovar ahora** →
`https://zenstay.sisac.pe/comprar/<plan>?periodo=adelantado-<N>`: la página de
pago, no una preferencia ya creada (el precio se calcula el día que se paga).

- Solo a hoteles `activa` cuyo **último pago aprobado** fue adelantado y que
  **no** tienen suscripción con tarjeta.
- **Quién lo programa**: nadie aparte. Corre dentro del backend, en el mismo
  bucle que avisa de los comprobantes (`server._bucle_avisos_comprobantes`):
  arranca 30 s después de levantar el contenedor y repite cada 10 minutos
  (`AVISOS_CADA_SEGUNDOS = 600`). No hace falta cron. `COMPROBANTES_AVISOS=0`
  apaga los dos avisos.
- **No se repite**: `tenants.aviso_renovacion_7d_para` y
  `aviso_renovacion_1d_para` guardan el vencimiento para el que ya salió cada
  aviso. Se reservan antes de mandar y se sueltan si el correo falla (la
  pasada siguiente lo reintenta). Si el hotel renueva, el vencimiento cambia y
  los avisos vuelven a tocar, una vez cada uno.
- Sale por el SMTP que ya usa el backend (`send_email_async`).

### Desplegar

La migración **006** va antes que el backend: el código nuevo escribe
`adelantado-N` y `en_revision`, que la 005 no admite, y lee las columnas de
los avisos. El backend viejo funciona con el esquema nuevo.

```
# 1. Respaldo
ssh -i ~/.ssh/hostinger_vps_ed25519 root@2.24.115.75 \
  '/opt/zenstay/tools/respaldar.sh /opt/zenstay/respaldos'

# 2. Migración 006 (idempotente, en una transacción)
ssh -i ~/.ssh/hostinger_vps_ed25519 root@2.24.115.75 \
  'docker exec -i zenstay-postgres psql -v ON_ERROR_STOP=1 -U postgres -d zenstay' \
  < db/migrations/006_pago_adelantado.sql

# 3. Backend y frontend (no hay variables nuevas)
bash tools/desplegar.sh

# 4. Comprobación
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://zenstay.sisac.pe/webhooks/mercadopago   # 401
curl -s 'https://zenstay.sisac.pe/comprar/pro?periodo=adelantado-3' | grep -c 'Paga con Yape'     # 1 o más
ssh -i ~/.ssh/hostinger_vps_ed25519 root@2.24.115.75 \
  'docker exec zenstay-postgres psql -U postgres -d zenstay -c "\d tenants"' | grep aviso_renovacion
```

No hay variables de entorno nuevas: usa `MERCADOPAGO_*`, `ZENSTAY_URL_PUBLICA`
y el SMTP que ya están.

### Probarlo

En modo `prueba` (sección 5), con el comprador de prueba:

1. `/comprar/pro`, elige **3 meses** en «Pago adelantado»: el total es
   S/ 357.00 (3 × 119). Paga en Mercado Pago con una tarjeta de prueba
   aprobada. En segundos, Configuración › Suscripción muestra el plan activo
   con 3 meses más y el botón **Renovar por adelantado**.
2. Repite eligiendo PagoEfectivo: vuelve a `/comprar/resultado?pago=pendiente`
   («Te llegó el código de pago») y el plan **no** se activa hasta que el
   código se paga.
3. Devuelve el pago desde el panel de Mercado Pago: el hotel pierde esos 3
   meses y el comprobante pendiente pasa a "sin comprobante".
4. Recordatorio sin esperar una semana: acerca el vencimiento del hotel de
   prueba y espera a la siguiente pasada (10 minutos como máximo):
   ```
   docker exec zenstay-postgres psql -U postgres -d zenstay -c \
     "update tenants set subscription_ends_at = now() + interval '6 days' where ruc = '<RUC de prueba>'"
   ```
   Llega un correo; en la pasada siguiente, ninguno más.

Las pruebas automáticas están en `backend/tests/test_pago_adelantado.py`
(precio 1/3/6/12, firma, aprobado, repetido, importe distinto, pendiente,
devolución, Mercado Pago caído, bloqueo con tarjeta, recordatorios y
credenciales). Corren con el Postgres efímero de `tests/test_mercadopago.py`
más la migración 006.
