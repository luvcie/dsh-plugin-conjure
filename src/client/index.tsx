import { memo, useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-conversation/client'

const DEFAULT_HEIGHT = 400

const HEAD = '<style>html,body{margin:0;padding:0;background:transparent;height:100%}</style>'

const TAIL = `<script>
const measure = () => {
  let h = 0
  for (const el of document.body.children) h = Math.max(h, el.getBoundingClientRect().bottom)
  parent.postMessage({ conjureHeight: Math.ceil(h) }, '*')
}
new ResizeObserver(measure).observe(document.documentElement)
addEventListener('load', measure)
measure()
</script>`

const ConjureAssistantView = memo(function ConjureAssistantView(
  { node }: { node: ChatNode<'assistant-step'> },
) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)

  const html = node.data.blocks
    .map((b) => (b.kind === 'text' ? b.text : ''))
    .join('')
    .replace(/^\s*```[a-z]*\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .replace(/^[^<]*(?=<(!--|!doctype|[a-z]))/i, '')
    .trim()

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const reported = (event.data as { conjureHeight?: unknown })?.conjureHeight
      if (typeof reported === 'number' && reported > 0) setHeight(reported)
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
