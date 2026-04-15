import OpenAI from "openai";

export async function generateFamilyDescription(params: {
  name: string;
  category?: string;
  phase?: string;
  changelog?: Array<{ version: string; message: string; impact?: string }>;
}): Promise<ReadableStream<Uint8Array>> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const changelogText =
    params.changelog && params.changelog.length > 0
      ? params.changelog
          .map((c) => `  - v${c.version}: ${c.message}${c.impact ? ` (Impact: ${c.impact})` : ""}`)
          .join("\n")
      : "  No changelog entries yet.";

  const prompt = `You are a BIM specialist writing documentation for a Revit family.

Write a concise technical description for the following Revit family:

Family Name: ${params.name}
Category: ${params.category ?? "Unspecified"}
Current Phase: ${params.phase ?? "INTAKE"}
Changelog:
${changelogText}

Write 2-3 paragraphs describing:
1. What this family is and its purpose in BIM projects
2. Key parametric features and use cases
3. Current development status and next steps based on the phase

Keep it professional, technical, and useful for the BIM team. Write in the same language as the family name (Spanish or English).`;

  const stream = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    stream: true,
    max_tokens: 500,
  });

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) {
          controller.enqueue(new TextEncoder().encode(text));
        }
      }
      controller.close();
    },
  });
}
