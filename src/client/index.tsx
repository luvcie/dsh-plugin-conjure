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
document.addEventListener('submit', (e) => {
  e.preventDefault()
  const form = e.target
  const fields = {}
  for (const [k, v] of new FormData(form).entries()) fields[k] = String(v)
  const btn = e.submitter
  if (btn && btn.name) fields[btn.name] = btn.value
  parent.postMessage({ conjureSubmit: { id: form.getAttribute('id') || form.getAttribute('name') || '', fields } }, '*')
}, true)
</script>`

let harness: Context | null = null

function sendPrompt(text: string): void {
  const sessions = harness?.sessions
  const current = sessions?.list.getSnapshot().current
  if (!sessions || !current) return
  const scoped = sessions.scope(current)
  const session = scoped ? sessions.sessionOf(scoped) : undefined
  void session?.prompt([{ type: 'text', text }], 'queue')
}

const ConjureAssistantView = memo(function ConjureAssistantView(
  { node }: { node: ChatNode<'assistant-step'> },
) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [hover, setHover] = useState(false)

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
      const data = event.data as {
        conjureHeight?: unknown
        conjureSubmit?: { id?: string; fields?: Record<string, string> }
      }
      if (data.conjureSubmit) {
        const { id, fields } = data.conjureSubmit
        const lines = Object.entries(fields ?? {}).map(([k, v]) => `${k}: ${v}`)
        sendPrompt(`The user submitted a form${id ? ` (${id})` : ''}:\n${lines.join('\n')}\n\nReply with the updated HTML.`)
        return
      }
      if (document.fullscreenElement) return
      if (typeof data.conjureHeight === 'number' && data.conjureHeight > 0) setHeight(data.conjureHeight)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <iframe
        ref={frame}
        srcDoc={HEAD + html + TAIL}
        sandbox="allow-scripts allow-forms"
        allow="fullscreen"
        style={{ width: '100%', height, border: 0, display: 'block', colorScheme: 'normal' }}
      />
      <button
        type="button"
        aria-label="Open full screen"
        title="Full screen"
        onClick={() => frame.current?.requestFullscreen?.().catch(() => {})}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          padding: 0,
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          color: '#fff',
          background: 'rgba(0,0,0,.45)',
          opacity: hover ? 1 : 0,
          pointerEvents: hover ? 'auto' : 'none',
          transition: 'opacity .15s',
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
    </div>
  )
})

export const inject = ['slots', 'sessions']

export function apply(ctx: Context): void {
  harness = ctx
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register(
      { name: 'conversation.chat.node', key: 'assistant-step', priority: -1 },
      ConjureAssistantView,
    ),
  )
}
