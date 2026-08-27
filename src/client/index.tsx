import { memo, useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-conversation/client'

const HEAD = '<style>html,body{margin:0;padding:0;background:transparent}</style>'

const TAIL = `<script>
const send = () => parent.postMessage({ conjureHeight: document.documentElement.scrollHeight }, '*')
new ResizeObserver(send).observe(document.documentElement)
send()
</script>`

const ConjureAssistantView = memo(function ConjureAssistantView(
  { node }: { node: ChatNode<'assistant-step'> },
) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(0)

  const html = node.data.blocks
    .map((b) => (b.kind === 'text' ? b.text : ''))
    .join('')
    .replace(/^\s*```[a-z]*\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const reported = (event.data as { conjureHeight?: unknown })?.conjureHeight
      if (typeof reported === 'number') setHeight(reported)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <iframe
      ref={frame}
      srcDoc={HEAD + html + TAIL}
      sandbox="allow-scripts"
      style={{ width: '100%', height, border: 0, display: 'block', colorScheme: 'normal' }}
    />
  )
})

export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register(
      { name: 'conversation.chat.node', key: 'assistant-step', priority: -1 },
      ConjureAssistantView,
    ),
  )
}
