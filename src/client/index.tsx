import { memo, useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-conversation/client'

// dsh-client-ui-settings declares this slot. Mirror the one entry conjure
// registers into, to avoid a dependency on that package for a single type.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.plugins.tab': { kind: 'list'; scope: 'root'; owner: { children?: never } }
  }
}

const DEFAULT_HEIGHT = 400
const PARTIAL_UPDATE_KEY = 'conjure.partialUpdate'

function partialUpdateEnabled(): boolean {
  try {
    return localStorage.getItem(PARTIAL_UPDATE_KEY) === '1'
  } catch {
    return false
  }
}

function setPartialUpdate(on: boolean): void {
  try {
    localStorage.setItem(PARTIAL_UPDATE_KEY, on ? '1' : '0')
  } catch {}
}

const SETTINGS_STYLE_ID = 'conjure-settings-style'
const SETTINGS_STYLE = `
.conjure-settings { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
.conjure-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px;
  color: var(--dsw-alias-label-primary, inherit);
  background: var(--dsw-alias-bg-surface, transparent);
  border: 1px solid var(--dsw-alias-border-subtle, rgba(127, 127, 127, 0.24));
  border-radius: 12px;
}
.conjure-setting-copy { min-width: 0; }
.conjure-setting-title { font-weight: 500; }
.conjure-setting-description {
  margin-top: 4px;
  color: var(--dsw-alias-label-tertiary, currentColor);
  font-size: 13px;
}
.conjure-switch { display: inline-flex; align-items: center; gap: 8px; flex: none; cursor: pointer; }
.conjure-switch input {
  width: 34px;
  height: 20px;
  margin: 0;
  appearance: none;
  cursor: pointer;
  border-radius: 999px;
  background: var(--dsw-alias-fill-tertiary, #555);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-subtle, transparent);
  transition: background 120ms ease;
}
.conjure-switch input::after {
  display: block;
  width: 16px;
  height: 16px;
  margin: 2px;
  content: '';
  border-radius: 50%;
  background: var(--dsw-alias-label-primary, #fff);
  transition: transform 120ms ease;
}
.conjure-switch input:checked { background: var(--dsw-static-deepseek-500, #4d7cff); }
.conjure-switch input:checked::after { transform: translateX(14px); }
.conjure-switch input:focus-visible {
  outline: 2px solid var(--dsw-static-deepseek-500, #4d7cff);
  outline-offset: 2px;
}
`

function ensureSettingsStyle(): void {
  if (document.getElementById(SETTINGS_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SETTINGS_STYLE_ID
  style.textContent = SETTINGS_STYLE
  document.head.append(style)
}

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

function ConjureSettingsTab() {
  const [partial, setPartial] = useState(partialUpdateEnabled)
  return (
    <div className="conjure-settings">
      <div className="conjure-setting-row">
        <div className="conjure-setting-copy">
          <div className="conjure-setting-title">Partial update</div>
          <div className="conjure-setting-description">
            Let the model patch part of the previous render instead of resending the whole page.
            This browser only.
          </div>
        </div>
        <label className="conjure-switch">
          <span>{partial ? 'On' : 'Off'}</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Partial update mode"
            checked={partial}
            onChange={(event) => {
              const on = event.currentTarget.checked
              setPartialUpdate(on)
              setPartial(on)
            }}
          />
        </label>
      </div>
    </div>
  )
}

export const inject = ['slots', 'sessions']

export function apply(ctx: Context): void {
  harness = ctx
  ctx.slots.inject('conversation.chat.node', () =>
    ctx.slots.register(
      { name: 'conversation.chat.node', key: 'assistant-step', priority: -1 },
      ConjureAssistantView,
    ),
  )
  ensureSettingsStyle()
  ctx.slots.inject('settings.plugins.tab', () =>
    ctx.slots.register(
      { name: 'settings.plugins.tab', id: 'conjure', order: 100, label: 'Conjure' },
      ConjureSettingsTab,
    ),
  )
}
