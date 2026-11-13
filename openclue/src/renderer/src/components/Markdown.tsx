import { memo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children)
  }
  return ''
}

function CodeBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)
  const code = textOf(children)
  const lang = /language-([\w-]+)/.exec(className ?? '')?.[1]
  return (
    <div className="group my-2.5 overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div className="flex items-center justify-between border-b border-white/8 px-3 py-1 text-[10.5px] tracking-wide text-white/40 uppercase">
        <span>{lang ?? 'code'}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 normal-case text-white/50 transition hover:bg-white/10 hover:text-white"
          onClick={() => {
            void navigator.clipboard.writeText(code.replace(/\n$/, ''))
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const isBlock = /language-/.test(className ?? '') || textOf(children).includes('\n')
    return isBlock ? <CodeBlock className={className}>{children}</CodeBlock> : <code>{children}</code>
  },
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        if (href && /^https:\/\//.test(href)) void window.openclue.openExternal(href)
      }}
      title={href}
    >
      {children}
    </a>
  ),
  img: ({ alt }) => <span className="text-white/40">[image{alt ? `: ${alt}` : ''}]</span>
}

/** Markdown with GFM + syntax highlighting. Raw HTML is never rendered. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md selectable">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
