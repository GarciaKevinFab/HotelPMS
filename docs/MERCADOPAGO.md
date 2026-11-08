# Mercado Pago en ZenStay

Guía para Kevin. Cómo dejar encendido el cobro de la suscripción con Mercado
Pago Suscripciones y los comprobantes manuales. El código ya está en el repo;
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
  - **Pagos** — `payment` (lo usamos solo para enterarnos de devoluciones y
    contracargos).
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
| firma inválida | 401, no se consulta nada |
| Mercado Pago caído | 503, para que Mercado Pago reintente |

El estado, el importe y el hotel nunca se toman del aviso: se consultan a la
API de Mercado Pago con nuestro token. El importe tiene que coincidir con el
pactado al crear la suscripción, que sale de la tabla `planes`.
