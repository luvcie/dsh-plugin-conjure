export const name = 'conjure'

export const inject = ['systemPrompt']

const instruction = `Respond with a complete, self-contained HTML fragment, not markdown.
Use HTML, CSS (inline styles or a <style> block), SVG, and <script> as needed.
Do not wrap the output in code fences. Return only the HTML.

You may include <form> elements. When the user submits one, its field values arrive as the next message. Reply with updated HTML that reflects the submission. Put choices in <button name="..." value="...">.`

export function apply(ctx) {
  ctx.systemPrompt.section({ name: 'conjure:html', order: 50, text: instruction })
}
