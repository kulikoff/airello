import { generateText } from 'ai';

const { text } = await generateText({
  model: "xai/grok-4.6",
  prompt: 'Explain the concept of quantum entanglement.',
});

console.log(text);