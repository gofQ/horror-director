import { describe, expect, it } from 'vitest'
import { memoryBackend } from '../test/memoryBackend'
import {
  applyRestore, buildBackup, copyProgress, discardOrphan, emptyRecord, listOrphans, loadProgress, orphanKey, orphanProgress, parseBackup, planRestore, progressKey,
  PROGRESS_PREFIX, saveProgress, serializeBackup, UNREADABLE_PREFIX, preserveDamaged,
} from './progressStorage'
import { RECORD_PREFIX } from './library'
import type { Entries, TaskProgress } from './production/progress'

const rec = (status: TaskProgress['status'] = 'inProgress', notes = ''): TaskProgress => ({ status, notes, history: [] })
const E = (o: Record<string, TaskProgress>): Entries => o

describe('progress storage', () => {
  it('uses keys outside the project record namespace', () => {
    expect(progressKey('p1').startsWith(RECORD_PREFIX)).toBe(false)
    expect(orphanKey('p1').startsWith(RECORD_PREFIX)).toBe(false)
  })

  it('round-trips and isolates projects and engines', () => {
    const b = memoryBackend()
    const a = saveProgress(b, 'pA', null, E({ 'unreal:T-x': rec('verified'), 'unity:T-x': rec('blocked') }), 1)
    expect(a.ok).toBe(true)
    saveProgress(b, 'pB', null, E({ 'unreal:T-x': rec('notStarted') }), 2)
    const la = loadProgress(b, 'pA')
    const lb = loadProgress(b, 'pB')
    expect(la.state === 'ok' && la.record.entries['unreal:T-x'].status).toBe('verified')
    expect(la.state === 'ok' && la.record.entries['unity:T-x'].status).toBe('blocked')
    expect(lb.state === 'ok' && Object.keys(lb.record.entries)).toEqual(['unreal:T-x'])
    expect(lb.state === 'ok' && lb.record.entries['unreal:T-x'].status).toBe('notStarted')
    expect(loadProgress(b, 'pC')).toEqual({ state: 'empty' })
    expect(loadProgress(null, 'pA')).toEqual({ state: 'unavailable' })
  })

  it('increments the revision and detects a write from another tab', () => {
    const b = memoryBackend()
    const first = saveProgress(b, 'p', null, E({ 'unreal:T-a': rec() }), 1)
    if (!first.ok) throw new Error('x')
    expect(first.record.rev).toBe(0)
    const second = saveProgress(b, 'p', first.record, E({ 'unreal:T-a': rec('submitted') }), 2)
    if (!second.ok) throw new Error('x')
    expect(second.record.rev).toBe(1)
    // another tab saved from the same base first
    const stale = saveProgress(b, 'p', first.record, E({ 'unreal:T-a': rec('blocked') }), 3)
    expect(stale).toEqual({ ok: false, error: { code: 'conflict' } })
    const now = loadProgress(b, 'p')
    expect(now.state === 'ok' && now.record.entries['unreal:T-a'].status).toBe('submitted')
    // creating when another tab already created
    expect(saveProgress(b, 'p', null, E({}), 4)).toEqual({ ok: false, error: { code: 'conflict' } })
  })

  it('reports quota and broken storage without losing the stored copy', () => {
    const b = memoryBackend()
    const ok = saveProgress(b, 'p', null, E({ 'unreal:T-a': rec('verified') }), 1)
    if (!ok.ok) throw new Error('x')
    b.failWhen = (k) => k.startsWith(PROGRESS_PREFIX)
    expect(saveProgress(b, 'p', ok.record, E({ 'unreal:T-a': rec('blocked') }), 2)).toEqual({ ok: false, error: { code: 'storageFull' } })
    b.failWhen = null
    b.dropWrites = true
    expect(saveProgress(b, 'p', ok.record, E({ 'unreal:T-a': rec('blocked') }), 3)).toEqual({ ok: false, error: { code: 'verifyFailed' } })
    b.dropWrites = false
    const now = loadProgress(b, 'p')
    expect(now.state === 'ok' && now.record.entries['unreal:T-a'].status).toBe('verified')
  })

  it('treats damaged, unsupported and mismatched records as damaged and never overwrites them', () => {
    const b = memoryBackend({ [progressKey('p1')]: '{not json', [progressKey('p2')]: JSON.stringify({ v: 2, entries: {} }), [progressKey('p3')]: JSON.stringify(emptyRecord('other', 1)) })
    expect(loadProgress(b, 'p1')).toMatchObject({ state: 'damaged', reason: 'unreadable', raw: '{not json' })
    expect(loadProgress(b, 'p2')).toMatchObject({ state: 'damaged', reason: 'unsupported' })
    expect(loadProgress(b, 'p3')).toMatchObject({ state: 'damaged', reason: 'mismatch' })
    expect(saveProgress(b, 'p1', null, E({}), 5)).toEqual({ ok: false, error: { code: 'damaged' } })
    expect(b.data.get(progressKey('p1'))).toBe('{not json')
    const key = preserveDamaged('{not json', 'p1', b, 77)
    expect(key).toBe(`${UNREADABLE_PREFIX}p1:77`)
    expect(b.data.get(key!)).toBe('{not json')
    // entries violating the strict schema are damaged too
    const bad = memoryBackend({ [progressKey('p')]: JSON.stringify({ v: 1, projectId: 'p', rev: 0, updatedAt: 1, entries: { 'unreal:T': { status: 'verified!!', notes: '', history: [] } } }) })
    expect(loadProgress(bad, 'p').state).toBe('damaged')
  })

  it('duplicate copies progress with a note; the source is unchanged', () => {
    const b = memoryBackend()
    saveProgress(b, 'a', null, E({ 'unreal:T-x': rec('verified') }), 1)
    expect(copyProgress(b, 'a', 'b', 'Source', 9)).toBeNull()
    const lb = loadProgress(b, 'b')
    expect(lb.state === 'ok' && lb.record.entries['unreal:T-x'].status).toBe('verified')
    expect(lb.state === 'ok' && lb.record.entries['unreal:T-x'].history.at(-1)?.note).toContain('copied from "Source"')
    const la = loadProgress(b, 'a')
    expect(la.state === 'ok' && la.record.entries['unreal:T-x'].history).toEqual([])
    expect(copyProgress(b, 'none', 'c', 'x', 1)).toBeNull()
    expect(loadProgress(b, 'c').state).toBe('empty')
  })

  it('a deleted project’s progress is moved to the orphan namespace, listed and only removed explicitly', () => {
    const b = memoryBackend()
    saveProgress(b, 'gone', null, E({ 'unreal:T-x': rec('verified') }), 1)
    saveProgress(b, 'live', null, E({ 'unreal:T-x': rec('blocked') }), 1)
    expect(orphanProgress(b, 'gone', 'Old project', 50)).toBeNull()
    expect(b.data.has(progressKey('gone'))).toBe(false)
    const list = listOrphans(b, ['live'])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ projectId: 'gone', projectName: 'Old project', entries: 1, readable: true })
    expect(discardOrphan(b, `${RECORD_PREFIX}anything`)).toBe(false)
    expect(discardOrphan(b, list[0].key)).toBe(true)
    expect(listOrphans(b, ['live'])).toEqual([])
    expect(loadProgress(b, 'live').state).toBe('ok')
  })

  it('a failed orphan move leaves the live progress in place', () => {
    const b = memoryBackend()
    saveProgress(b, 'gone', null, E({ 'unreal:T-x': rec('verified') }), 1)
    b.failWhen = (k) => k.includes('progress-orphan')
    expect(orphanProgress(b, 'gone', 'x', 1)).toEqual({ code: 'storageFull' })
    expect(loadProgress(b, 'gone').state).toBe('ok')
    // and a live progress key of an unknown project is still listed (never silently lost)
    b.failWhen = null
    expect(listOrphans(b, []).map((o) => o.projectId)).toEqual(['gone'])
  })
})

describe('backup and restore', () => {
  const backup = buildBackup([{ projectId: 'p', projectName: 'P', entries: E({ 'unreal:T-a': rec('verified', 'n'), 'unity:T-a': rec('blocked') }) }], 5)

  it('serializes and parses strictly', () => {
    const text = serializeBackup(backup)
    const r = parseBackup(text)
    expect(r.ok && r.backup.projects[0].entries['unity:T-a'].status).toBe('blocked')
    expect(parseBackup('nope')).toEqual({ ok: false, code: 'notJson' })
    expect(parseBackup('{"format":"x"}')).toEqual({ ok: false, code: 'format' })
    expect(parseBackup(JSON.stringify({ ...backup, version: 9 }))).toEqual({ ok: false, code: 'version' })
    expect(parseBackup(JSON.stringify({ ...backup, projects: [{ projectId: 'p', projectName: 'P', entries: { 'unreal:T': { status: 'bad' } } }] }))).toEqual({ ok: false, code: 'malformed' })
    expect(parseBackup(JSON.stringify({ ...backup, extra: 1 }))).toEqual({ ok: false, code: 'malformed' })
  })

  it('classifies new / identical / collision and keeps existing records unless chosen', () => {
    const existing = E({ 'unreal:T-a': rec('inProgress'), 'unity:T-a': rec('blocked'), 'unity:T-b': rec() })
    const items = planRestore(backup.projects[0].entries, existing)
    expect(items.map((i) => [i.key, i.kind])).toEqual([['unity:T-a', 'identical'], ['unreal:T-a', 'collision']])
    expect(applyRestore(existing, items, new Set())['unreal:T-a'].status).toBe('inProgress')
    const merged = applyRestore(existing, items, new Set(['unreal:T-a']))
    expect(merged['unreal:T-a'].status).toBe('verified')
    expect(merged['unity:T-b']).toBeDefined()
    expect(existing['unreal:T-a'].status).toBe('inProgress') // input untouched
    const fresh = applyRestore({}, planRestore(backup.projects[0].entries, {}), new Set())
    expect(Object.keys(fresh).sort()).toEqual(['unity:T-a', 'unreal:T-a'])
  })

  it('skips entries with an unknown engine prefix', () => {
    const items = planRestore({ 'ps4:T-a': rec() }, {})
    expect(applyRestore({}, items, new Set())).toEqual({})
  })
})
