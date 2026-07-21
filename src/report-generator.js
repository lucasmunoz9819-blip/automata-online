function reportPrompt(order) {
  return `Actúa como analista estratégico senior. Redacta en español un informe personalizado, claro y accionable.

DATOS DEL CLIENTE
Tema: ${order.topic}
Resultado o decisión buscada: ${order.objective}
Contexto aportado: ${order.context || 'No se aportó contexto adicional.'}

REGLAS OBLIGATORIAS
- No inventes cifras, hechos, experiencias, fuentes ni resultados garantizados.
- Separa hechos aportados, supuestos e inferencias. Señala qué debe verificarse.
- Si falta información, trabaja con escenarios y explica los supuestos.
- No presentes el contenido como asesoría médica, legal o financiera profesional.
- No incluyas instrucciones para dañar, engañar, vulnerar sistemas o infringir la ley.
- Protege datos personales: no repitas correo ni nombre completo.
- Evita frases genéricas; conecta cada recomendación con el caso.

FORMATO MARKDOWN
# Informe Estratégico Express
## Resumen ejecutivo
## Lectura del problema
## Tres opciones viables
Para cada opción: ventajas, desventajas, esfuerzo, riesgo y cuándo elegirla.
## Recomendación razonada
## Plan de acción de 7 días
Usa una lista numerada con tareas verificables.
## Riesgos y mitigaciones
## Supuestos que debes validar
## Próxima decisión

Extensión objetivo: 900 a 1400 palabras. Entrega únicamente el informe.`;
}

export async function generateReport(config, order, { fetchImpl = fetch } = {}) {
  if (!config.geminiApiKey) throw new Error('El generador no está configurado');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: reportPrompt(order) }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 3000 }
      })
    });
    if (!response.ok) throw new Error(`El generador respondió ${response.status}: ${(await response.text()).slice(0, 240)}`);
    const payload = await response.json();
    const markdown = payload.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('').trim();
    if (!markdown || markdown.length < 500) throw new Error('El generador devolvió un informe incompleto');
    return {
      markdown: markdown.slice(0, 30_000),
      usage: {
        promptTokens: Number(payload.usageMetadata?.promptTokenCount ?? 0),
        outputTokens: Number(payload.usageMetadata?.candidatesTokenCount ?? 0),
        totalTokens: Number(payload.usageMetadata?.totalTokenCount ?? 0),
        model: config.model
      }
    };
  } finally {
    clearTimeout(timer);
  }
}
