import ollama from 'ollama'

export async function invokeLLM(props) {
  const response = await ollama.chat({
    model: props.model,
    messages: [{ role: props.role, content: props.content }],
  })
  return response.message.content
}

export async function generateTitle(string) {
  let eventName = string
  try {
    const generated = await invokeLLM({
      model: "qwen2.5:0.5b",
      role: "user",
      content: `Find the name of the event in this social media post. If there is none, generate a simple name in English. Be as concise as possible. Answer only. No questions. Do not converse. \n\n${string}`
    })
    if (!/I'm sorry/gi.test(generated)) {
      eventName = generated;
    }
    if (eventName.indexOf('\n') > 0) {
      eventName = eventName.substring(0, eventName.indexOf('\n'));
    }
  } catch (e) {
    console.error(e)
  }
  return eventName.substring(0, 100);
}
