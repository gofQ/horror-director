import { Fragment, type ReactNode } from 'react'

/** Minimal, safe renderer for the Markdown subset the production planner emits (no HTML injection, no libraries). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    out.push(tok.startsWith('**') ? <strong key={i++}>{tok.slice(2, -2)}</strong> : <code key={i++}>{tok.slice(1, -1)}</code>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const splitRow = (row: string): string[] =>
  row
    .replace(/^\|\s*/, '')
    .replace(/\s*\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, '|').replace(/\\\\/g, '\\').trim())

export function MarkdownPreview({ source, testId }: { source: string; testId?: string }) {
  const lines = source.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
    } else if (line.startsWith('|')) {
      const rows: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++])
      const [head, , ...body] = rows
      blocks.push(
        <div className="md-table-wrap" key={k++}>
          <table className="md-table">
            <thead>
              <tr>{splitRow(head).map((c, j) => <th key={j}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, j) => (
                <tr key={j}>{splitRow(r).map((c, x) => <td key={x}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
    } else if (/^(- |\d+\. )/.test(line)) {
      const ordered = /^\d+\. /.test(line)
      const items: string[] = []
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/, ''))
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(<Tag key={k++}>{items.map((x, j) => <li key={j}>{inline(x)}</li>)}</Tag>)
    } else if (line.startsWith('> ')) {
      const q: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) q.push(lines[i++].slice(2))
      blocks.push(<blockquote key={k++}>{q.map((x, j) => <Fragment key={j}>{inline(x)}<br /></Fragment>)}</blockquote>)
    } else if (line.startsWith('#')) {
      const level = line.match(/^#+/)![0].length
      const text = line.replace(/^#+\s*/, '')
      const H = (`h${Math.min(level + 1, 6)}`) as 'h2'
      blocks.push(<H key={k++} className="md-h">{text}</H>)
      i++
    } else {
      blocks.push(<p key={k++}>{inline(line)}</p>)
      i++
    }
  }
  return (
    <div className="md-preview" data-testid={testId} tabIndex={0} role="region">
      {blocks}
    </div>
  )
}
