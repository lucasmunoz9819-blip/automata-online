# Autómata Local

Un agente persistente, auditable y ejecutable sin fondos. Incluye ciclo autónomo, memoria, niveles de supervivencia, herramientas de archivos, identidad, economía simulada, descendencia aislada y soporte opcional para Ollama.

## Inicio rápido

No requiere instalar paquetes:

```powershell
Copy-Item config.example.json config.json
node src/cli.js demo
node src/cli.js status
node src/cli.js logs
```

Para ejecución continua:

```powershell
node src/cli.js run
```

## Usar un modelo local

1. Instala Ollama por separado.
2. Descarga un modelo compatible, por ejemplo `ollama pull qwen3:4b`.
3. En `config.json`, cambia `"provider": "mock"` por `"provider": "ollama"`.

El modo `mock` sirve para validar todo el sistema sin modelo, cuenta, claves API ni dinero.

## Componentes

- `src/agent.js`: bucle de decisión y observación.
- `src/providers.js`: cerebro de demostración y adaptador Ollama.
- `src/tools.js`: herramientas autorizadas y descendencia aislada.
- `.automata/state.json`: estado persistente.
- `.automata/audit.jsonl`: registro inmutable por anexado.
- `SOUL.md`: identidad legible y versionable.
- `workspace/`: único espacio de escritura del agente.

## Modelo económico

Los créditos son simulados. Cada turno consume `costPerTurn`; el agente pasa por `normal`, `low_compute`, `critical` y `dead`. Los adaptadores de pagos reales deben añadirse únicamente después de pruebas, límites monetarios y revisión de seguridad.

## Replicación

La herramienta `replicate` genera identidades descendientes dormidas bajo `children/`. No inicia procesos ni compra infraestructura. Esto permite probar linaje y estrategias sin propagación descontrolada.

## Seguridad estructural

- Escritura confinada a `workspace/`.
- Descendientes limitados y dormidos.
- Sin terminal ni red en la configuración inicial.
- Cada decisión y resultado queda auditado.
- Estado detenido al agotarse los créditos.

Estas garantías están implementadas en código, no solamente declaradas en un prompt.

## Automodificación

El agente puede preparar cambios bajo `.automata/proposals/`. Cada propuesta contiene motivo, archivo y parche, queda auditada y comienza como `pending_review`. Aplicarla exige revisión externa, de modo que el agente puede evolucionar su diseño sin reemplazar silenciosamente sus propios controles.

## Lo que aún requiere infraestructura externa

El núcleo funciona completamente gratis. Una billetera con fondos reales, compra de servidores, dominios, correo y publicación pública necesitan proveedores externos y sus credenciales. No se simulan como si fueran reales: deben añadirse como adaptadores explícitos cuando existan presupuesto y cuentas.

## Publicación gratuita

1. Sube este directorio a un repositorio de GitHub.
2. Crea un proyecto Supabase y ejecuta `supabase/schema.sql` en su SQL Editor.
3. Crea una API key gratuita en Google AI Studio.
4. En Render, crea un Blueprint desde el repositorio; detectará `render.yaml`.
5. Completa `GEMINI_API_KEY`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Render.
6. Guarda en GitHub Actions los secretos `AUTOMATA_URL` y `AUTOMATA_ADMIN_TOKEN`.

El workflow `heartbeat.yml` despierta el servicio y ejecuta un turno cada 15 minutos. Render entrega una URL `onrender.com`, por lo que el dominio propio es opcional.

No publiques ninguna service-role key, clave de billetera ni token administrativo en el repositorio o en el navegador.
