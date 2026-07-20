import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  changeConceptDraftSchema,
  proposalDraftSchema,
  understandingQuizDraftSchema,
  workspaceAgentStepSchema
} from './schemas'
import { sanitizeStructuredOutputSchema, stripNullProperties } from './structuredOutputSchema'

const realSchemas = {
  workspaceAgentStep: workspaceAgentStepSchema,
  understandingQuizDraft: understandingQuizDraftSchema,
  changeConceptDraft: changeConceptDraftSchema,
  proposalDraft: proposalDraftSchema
}

type JsonObject = Record<string, unknown>

function walk(node: unknown, visit: (node: JsonObject) => void): void {
  if (Array.isArray(node)) {
    for (const entry of node) walk(entry, visit)
    return
  }
  if (typeof node !== 'object' || node === null) return
  visit(node as JsonObject)
  for (const value of Object.values(node)) walk(value, visit)
}

describe('sanitizeStructuredOutputSchema', () => {
  for (const [name, schema] of Object.entries(realSchemas)) {
    it(`emits a strict-mode-safe schema for ${name}`, () => {
      const sanitized = sanitizeStructuredOutputSchema(z.toJSONSchema(schema))
      const serialized = JSON.stringify(sanitized)
      for (const keyword of ['"oneOf"', '"$schema"', '"default"', '"const"', '"exclusiveMinimum"', '"exclusiveMaximum"', '"minLength"', '"maxLength"', '"minimum"', '"maximum"', '"minItems"', '"maxItems"', '"pattern"', '"format"', '"multipleOf"']) {
        expect(serialized, `${name} must not contain ${keyword}`).not.toContain(keyword)
      }
      walk(sanitized, (node) => {
        if (typeof node.properties !== 'object' || node.properties === null) return
        expect(node.additionalProperties).toBe(false)
        expect([...(node.required as string[])].sort()).toEqual(Object.keys(node.properties).sort())
      })
    })
  }

  it('makes formerly-optional properties nullable', () => {
    const sanitized = sanitizeStructuredOutputSchema(z.toJSONSchema(workspaceAgentStepSchema))
    const branches = ((sanitized.properties as JsonObject).action as JsonObject).anyOf as JsonObject[]
    const search = branches.find((branch) => {
      const type = ((branch.properties as JsonObject).type as JsonObject).enum as string[]
      return type[0] === 'search'
    }) as JsonObject
    expect((search.required as string[]).sort()).toEqual(['path', 'query', 'type'])
    expect(((search.properties as JsonObject).path as JsonObject).type).toEqual(['string', 'null'])
  })

  it('wraps optional union properties in a nullable anyOf', () => {
    const sanitized = sanitizeStructuredOutputSchema(
      z.toJSONSchema(z.object({ value: z.union([z.string(), z.boolean()]).optional() }))
    )
    const value = (sanitized.properties as JsonObject).value as JsonObject
    expect((value.anyOf as JsonObject[]).some((branch) => branch.type === 'null')).toBe(true)
  })

  it('round-trips a null-bearing model response through the zod schema', () => {
    const response = {
      note: 'Look for the config loader.',
      action: { type: 'search', query: 'loadConfig', path: null }
    }
    const parsed = workspaceAgentStepSchema.parse(stripNullProperties(response))
    expect(parsed.action).toEqual({ type: 'search', query: 'loadConfig' })
  })

  it('leaves non-null responses unchanged', () => {
    const response = {
      note: 'Read the loader implementation.',
      action: { type: 'read_file', relativePath: 'src/config.ts', startLine: 1, endLine: 40 }
    }
    expect(stripNullProperties(response)).toEqual(response)
    expect(workspaceAgentStepSchema.parse(stripNullProperties(response)).action.type).toBe('read_file')
  })

  it('never removes null array elements', () => {
    expect(stripNullProperties({ items: [1, null, 'two'] })).toEqual({ items: [1, null, 'two'] })
  })
})
