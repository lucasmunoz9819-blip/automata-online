function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('El modelo no devolvio JSON');
  return JSON.parse(match[0]);
}

export async function decide(config, context) {
  if (config.provider === 'mock') {
    if (context.state.turn === 0) return { thought: 'Primero inspeccionare mi espacio.', action: 'list_files', args: { path: '.' } };
    if (context.state.turn === 1) return { thought: 'Registrare una nota inicial util.', action: 'write_file', args: { path: 'bitacora.md', content: '# Bitacora\n\nAgente iniciado correctamente.\n' } };
    return { thought: 'Conservare recursos hasta recibir un objetivo concreto.', action: 'reflect', args: { note: `Turno ${context.state.turn}: sistema estable.` } };
  }
  if (config.provider === 'gemini') {
    if (!config.geminiApiKey) throw new Error('Falta GEMINI_API_KEY');
    const prompt = `Eres ${context.state.name}, un agente auditable. Objetivo: ${context.state.goals.join('; ')}.\nEstado: ${JSON.stringify(context.state)}\nHerramientas: list_files, read_file, write_file, reflect, propose_modification, replicate, public_context. Para public_context usa source weather, exchange o country; solo consulta una fuente cuando sea util.\nDevuelve SOLO JSON valido: {"thought":"...","action":"...","args":{}}. No inventes herramientas.`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
    const response = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } })
    });
    if (!response.ok) throw new Error(`Gemini respondio ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const body = await response.json();
    return extractJson(body.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
  }
  if (config.provider !== 'ollama') throw new Error(`Proveedor no soportado: ${config.provider}`);
  const prompt = `Eres ${context.state.name}, un agente auditable. Objetivo: ${context.state.goals.join('; ')}.\nEstado: ${JSON.stringify(context.state)}\nHerramientas: list_files, read_file, write_file, reflect, propose_modification, replicate, public_context. Para public_context usa source weather, exchange o country; solo consulta una fuente cuando sea util.\nDevuelve SOLO JSON: {"thought":"...","action":"...","args":{}}. No inventes herramientas.`;
  const response = await fetch(`${config.ollamaUrl}/api/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.model, prompt, stream: false, format: 'json' })
  });
  if (!response.ok) throw new Error(`Ollama respondio ${response.status}`);
  return extractJson((await response.json()).response);
}
