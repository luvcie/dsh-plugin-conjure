import { memo, useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-conversation/client'

const DEFAULT_HEIGHT = 400

const BOOTSTRAP = `<!doctype html><html><head></head><body><script>
var opened = false
function measure() {
  if (!document.body) return
  var h = 0, c = document.body.children
  for (var i = 0; i < c.length; i++) h = Math.max(h, c[i].getBoundingClientRect().bottom)
  parent.postMessage({ conjureHeight: Math.ceil(h) }, '*')
}
function onSubmit(e) {
  e.preventDefault()
  var form = e.target, fields = {}
  new FormData(form).forEach(function (v, k) { fields[k] = String(v) })
  var btn = e.submitter
  if (btn && btn.name) fields[btn.name] = btn.value
  parent.postMessage({ conjureSubmit: { id: form.getAttribute('id') || form.getAttribute('name') || '', fields: fields } }, '*')
}
function onMessage(e) {
  var d = e.data
  if (d && typeof d.conjureWrite === 'string') { ensureOpen(); document.write(d.conjureWrite); measure() }
  else if (d && d.conjureEnd) { ensureOpen(); document.close(); measure() }
}
function listen() {
  addEventListener('message', onMessage)
  addEventListener('submit', onSubmit, true)
}
function ensureOpen() {
  if (opened) return
  opened = true
  // document.open() removes every window event listener; re-register after it.
  document.open()
  document.write('<style>html,body{margin:0;padding:0;background:transparent;height:100%}</style>')
  listen()
  new ResizeObserver(measure).observe(document.documentElement)
}
listen()
parent.postMessage({ conjureReady: true }, '*')
</script></body></html>`

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
  const sent = useRef(0)
  const ended = useRef(false)
  const [ready, setReady] = useState(false)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [hover, setHover] = useState(false)

  const content = node.data.blocks
    .map((b) => (b.kind === 'text' ? b.text : ''))
    .join('')
    .replace(/^\s*```[a-z]*\s*/i, '')
    .replace(/^[^<]*(?=<(!--|!doctype|[a-z]))/i, '')
  const running = node.data.status === 'running'
  const pending = running && !content.startsWith('<')

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const d = event.data as {
        conjureReady?: boolean
        conjureHeight?: unknown
        conjureSubmit?: { id?: string; fields?: Record<string, string> }
      }
      if (d.conjureReady) {
        setReady(true)
        return
      }
      if (d.conjureSubmit) {
        const { id, fields } = d.conjureSubmit
        const lines = Object.entries(fields ?? {}).map(([k, v]) => `${k}: ${v}`)
        sendPrompt(`The user submitted a form${id ? ` (${id})` : ''}:\n${lines.join('\n')}\n\nReply with the updated HTML.`)
        return
      }
      if (document.fullscreenElement) return
      if (typeof d.conjureHeight === 'number' && d.conjureHeight > 0) setHeight(d.conjureHeight)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    const win = frame.current?.contentWindow
    if (!win || !ready || !content.startsWith('<')) return
    if (content.length > sent.current) {
      win.postMessage({ conjureWrite: content.slice(sent.current) }, '*')
      sent.current = content.length
    }
    if (!running && !ended.current) {
      ended.current = true
      win.postMessage({ conjureEnd: true }, '*')
    }
  }, [content, running, ready])

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <iframe
        ref={frame}
        srcDoc={BOOTSTRAP}
        sandbox="allow-scripts allow-forms"
        allow="fullscreen"
        onLoad={() => setReady(true)}
        style={{ width: '100%', height, border: 0, display: 'block', colorScheme: 'normal' }}
      />
      {pending && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'currentColor',
            opacity: 0.5,
            pointerEvents: 'none',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 12 12"
                to="360 12 12"
                dur="0.8s"
                repeatCount="indefinite"
              />
            </path>
          </svg>
        </div>
      )}
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
