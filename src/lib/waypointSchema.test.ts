import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './io'
import { SCHEMA_VERSION, WAYPOINT_MAX, type Project } from './schema'
import { sampleProject } from './sample'
import { formatDiagnostics } from './diagnostics'
import { branchProject } from '../test/branchProject'
import { simulateRoute } from './simulate'
import { analyze } from './graph'
import { compareRoutes } from './compare'
import { analyzePacing } from './pacing'
import { stateProject } from '../test/stateProject'

type Raw = { schemaVersion: number; project: Record<string, unknown> & { transitions: Record<string, unknown>[] } }
const exportOf = (p: Project) => JSON.parse(serializeProject(p)) as Raw
const errorsOf = (e: unknown) => {
  const r = parseProject(JSON.stringify(e))
  if (r.ok) throw new Error('expected rejection')
  return formatDiagnostics('en', r.errors).join('\n')
}
const withPoints = (p: Project, ids: string[]): Project => ({
  ...p,
  transitions: p.transitions.map((t) => (ids.includes(t.id) ? { ...t, waypoints: [{ x: 10.5, y: -20 }, { x: 99999, y: -99999 }] } : t)),
})

describe('schema 7 waypoints', () => {
  it('writes schemaVersion 7 and round-trips points on scene, IF and Set Flag connections exactly', () => {
    expect(SCHEMA_VERSION).toBe(9)
    const p = withPoints(stateProject(), ['a', 'b', 'yes', 'bad_end']) // scene→SET, SET→IF, IF.TRUE→scene, scene→scene
    const text = serializeProject(p)
    expect(exportOf(p).schemaVersion).toBe(9)
    const r = parseProject(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project).toEqual(p)
    expect(JSON.parse(serializeProject(r.project)).project).toEqual(JSON.parse(text).project)
    const e = exportOf(r.project)
    expect(e.project.transitions.find((t) => t.id === 'no')).not.toHaveProperty('waypoints')
    expect(e.project.transitions.find((t) => t.id === 'yes')).toMatchObject({ sourcePort: 'true', waypoints: [{ x: 10.5, y: -20 }, { x: 99999, y: -99999 }] })
  })
  it.each([1, 2, 3, 4, 5, 6])('schema %i files import unchanged without points', (v) => {
    const base = v >= 5 ? branchProject() : sampleProject()
    const e = exportOf(base)
    e.schemaVersion = v
    if (v < 6) delete e.project.flags
    if (v < 5) for (const k of ['logicNodes', 'comments', 'sceneTypes']) delete e.project[k]
    const r = parseProject(JSON.stringify(e))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.transitions.every((t) => t.waypoints === undefined)).toBe(true)
    expect(r.project.transitions.map((t) => [t.id, t.source, t.target, t.sourcePort])).toEqual(base.transitions.map((t) => [t.id, t.source, t.target, t.sourcePort]))
    expect(exportOf(r.project).schemaVersion).toBe(9)
  })
  it('rejects malformed points without repair', () => {
    const mutate = (fn: (t: Record<string, unknown>) => void) => {
      const e = exportOf(branchProject())
      fn(e.project.transitions[0])
      return e
    }
    expect(errorsOf(mutate((t) => (t.waypoints = [{ x: 1 }])))).toMatch(/waypoints/)
    expect(errorsOf(mutate((t) => (t.waypoints = [{ x: 1, y: 'a' }])))).toMatch(/waypoints/)
    expect(errorsOf(mutate((t) => (t.waypoints = [{ x: 1e9, y: 0 }])))).toMatch(/waypoints/)
    expect(errorsOf(mutate((t) => (t.waypoints = [{ x: 1, y: 1, z: 2 }])))).toMatch(/z|waypoints/)
    expect(errorsOf(mutate((t) => (t.waypoints = Array.from({ length: WAYPOINT_MAX + 1 }, () => ({ x: 0, y: 0 })))))).toMatch(/waypoints/)
    expect(errorsOf(mutate((t) => (t.waypoints = 'a,b')))).toMatch(/waypoints/)
    expect(errorsOf(mutate((t) => (t.waypoints = [{ x: null, y: 0 }])))).toMatch(/waypoints/)
    expect(errorsOf({ ...exportOf(branchProject()), schemaVersion: 10 })).toMatch(/schema version 10/)
  })
})

describe('reroute points are presentation only', () => {
  const plain = stateProject()
  const routed = withPoints(plain, plain.transitions.map((t) => t.id))
  const route = ['a', 'b', 'yes', 'bad_end']
  const alt = ['a', 'b', 'no', 'good_end']
  it('simulation, analysis, comparison and pacing are identical with and without points', () => {
    expect(simulateRoute(routed, route)).toEqual(simulateRoute(plain, route))
    expect(simulateRoute(routed, ['a', 'b'])).toEqual(simulateRoute(plain, ['a', 'b']))
    expect(analyze(routed)).toEqual(analyze(plain))
    expect(compareRoutes(routed, route, alt)).toEqual(compareRoutes(plain, route, alt))
    expect(analyzePacing(simulateRoute(routed, route))).toEqual(analyzePacing(simulateRoute(plain, route)))
  })
})
