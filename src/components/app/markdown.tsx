'use client'

import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Check, Copy } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

import { useTheme } from 'next-themes'

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  const { resolvedTheme } = useTheme()
  return (
    <div className="auralis-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? '')
            const text = String(children).replace(/\n$/, '')
            const isBlock = match || text.includes('\n')
            if (!isBlock) {
              return (
                <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[0.85em] text-stone-800 dark:bg-stone-800 dark:text-stone-200" {...props}>
                  {children}
                </code>
              )
            }
            return <CodeBlock language={match?.[1] ?? 'text'} text={text} theme={resolvedTheme === 'dark' ? 'dark' : 'light'} />
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300">
                {children}
              </a>
            )
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-700">
                <table className="w-full text-sm">{children}</table>
              </div>
            )
          },
          th({ children }) {
            return <th className="border-b border-stone-200 bg-stone-50 px-3 py-2 text-left font-medium dark:border-stone-700 dark:bg-stone-800/60">{children}</th>
          },
          td({ children }) {
            return <td className="border-b border-stone-100 px-3 py-2 align-top dark:border-stone-800">{children}</td>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})

function CodeBlock({ language, text, theme }: { language: string; text: string; theme: 'light' | 'dark' }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-stone-200 dark:border-stone-700">
      <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-3 py-1.5 dark:border-stone-700 dark:bg-stone-800/80">
        <span className="font-mono text-xs text-stone-500 dark:text-stone-400">{language}</span>
        <button
          type="button"
          aria-label="Copy code"
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-stone-500 transition-colors hover:bg-stone-200 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={theme === 'dark' ? oneDark : oneLight}
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8125rem', background: theme === 'dark' ? '#1c1917' : '#fafaf9' }}
        codeTagProps={{ style: { fontFamily: 'var(--font-geist-mono), monospace' } }}
      >
        {text}
      </SyntaxHighlighter>
    </div>
  )
}
