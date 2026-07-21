# Autómata

Autómata vende y entrega un producto digital: el **Informe Estratégico Express**. El cliente describe una decisión, paga mediante Checkout Pro de Mercado Pago y recibe un informe privado generado con Gemini únicamente después de que el servidor verifica el pago.

## Flujo operativo

1. El cliente crea un pedido. El servidor valida los datos y guarda solamente el hash del token privado.
2. El backend crea una preferencia de Mercado Pago por el monto configurado (por defecto, $4.990 CLP).
3. Mercado Pago envía un webhook firmado. Autómata valida la firma HMAC y consulta el pago directamente en la API.
4. Solo se acepta `approved` cuando referencia, monto y moneda coinciden exactamente con el pedido.
5. El trabajador reclama el pedido pagado, genera el informe con Gemini y lo publica en el enlace privado.
6. Ingresos, reversiones y uso del modelo se registran en un libro contable auditable.

Los parámetros de retorno del navegador nunca aprueban un pago por sí solos.

## Desarrollo local

Requiere Node.js 20 o superior.

```powershell
npm install
npm test
npm run web
```

Sin las credenciales externas, el sitio carga normalmente pero mantiene deshabilitado el botón de pago.

## Variables de entorno

| Variable | Uso |
|---|---|
| `GEMINI_API_KEY` | Generación de informes. |
| `SUPABASE_URL` | URL del proyecto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso del servidor a pedidos y libro contable. Nunca se envía al navegador. |
| `MERCADOPAGO_ACCESS_TOKEN` | Credencial productiva de Checkout Pro. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Firma secreta de las notificaciones. |
| `PUBLIC_BASE_URL` | URL HTTPS pública, sin barra final. |
| `AUTOMATA_ADMIN_TOKEN` | Token privado del panel administrativo y heartbeat. |
| `AUTOMATA_PRODUCT_PRICE_CLP` | Precio unitario, mínimo $1.000. |
| `AUTOMATA_MAX_REPORTS_PER_DAY` | Límite diario duro de generación. |
| `AUTOMATA_MAX_REPORT_ATTEMPTS` | Reintentos máximos por pedido pagado. |
| `AUTOMATA_SUPPORT_EMAIL` | Contacto visible de soporte. |

Usa `.env.example` como referencia. Nunca guardes valores reales en Git ni en imágenes.

## Base de datos

Ejecuta `supabase/schema.sql` en el SQL Editor de Supabase. Crea:

- `automata_state`: estado del agente experimental.
- `automata_orders`: pedidos, pagos, estados e informes.
- `automata_ledger`: ingresos, reversiones y generaciones.

Todas las tablas tienen RLS habilitado. El navegador no recibe una clave de Supabase; el acceso ocurre a través del backend.

## Mercado Pago

1. Crea una aplicación en **Tus integraciones**.
2. Configura Checkout Pro con credenciales productivas.
3. En Webhooks, registra `https://automata-online.onrender.com/api/payments/mercadopago/webhook` para eventos de pagos.
4. Guarda el Access Token y la firma secreta directamente en Render.
5. Haz una compra real controlada y confirma que el pedido pasa por `paid`, `processing` y `delivered`.

El proyecto no almacena números de tarjeta ni credenciales del comprador.

## Operación y seguridad

- El worker procesa solo pedidos pagados y utiliza una actualización condicional para evitar doble generación.
- El heartbeat de GitHub ejecuta `/api/tick` cada 15 minutos como recuperación ante reinicios.
- Hay límites por IP, tamaño máximo de solicitudes, CSP, token de entrega aleatorio y límites diarios de generación.
- El antiguo agente experimental sigue disponible en `/api/agent/tick`, separado del flujo comercial y protegido por el token administrativo.
- Un pago revertido o con datos inconsistentes nunca se contabiliza como ingreso disponible.

El sistema puede cobrar, verificar, producir y entregar automáticamente; conseguir clientes y registrar el primer pago real sigue dependiendo de publicar la oferta y de una compra auténtica.
