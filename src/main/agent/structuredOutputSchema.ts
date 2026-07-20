type JsonObject = Record<string, unknown>

// OpenAI strict structured outputs rejects these even though local Zod
// validation still enforces them after parsing the response.
const strippedKeywords = [
  'default',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'multipleOf',
  'pattern',
  'format'
]

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function makeNullable(node: JsonObject): JsonObject {
  if (typeof node.type === 'string') {
    return node.type === 'null' ? node : { ...node, type: [node.type, 'null'] }
  }
  if (Array.isArray(node.type)) {
    return node.type.includes('null') ? node : { ...node, type: [...node.type, 'null'] }
  }
  if (Array.isArray(node.anyOf)) {
    const hasNull = node.anyOf.some((branch) => isObject(branch) && branch.type === 'null')
    return hasNull ? node : { ...node, anyOf: [...node.anyOf, { type: 'null' }] }
  }
  return { anyOf: [node, { type: 'null' }] }
}

function sanitizeNode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeNode)
  if (!isObject(node)) return node

  const result: JsonObject = {}
  for (const [key, value] of Object.entries(node)) {
    if (strippedKeywords.includes(key)) continue
    if (key === 'oneOf') {
      result.anyOf = sanitizeNode(value)
      continue
    }
    if (key === 'const') {
      result.enum = [value]
      continue
    }
    if (key === 'properties' && isObject(value)) {
      const properties: JsonObject = {}
      for (const [name, property] of Object.entries(value)) properties[name] = sanitizeNode(property)
      result.properties = properties
      continue
    }
    if (['items', 'prefixItems', 'anyOf', 'allOf'].includes(key)) {
      result[key] = sanitizeNode(value)
      continue
    }
    result[key] = value
  }

  if (isObject(result.properties)) {
    const names = Object.keys(result.properties)
    const previouslyRequired = new Set(Array.isArray(result.required) ? (result.required as string[]) : [])
    for (const name of names) {
      if (!previouslyRequired.has(name)) {
        result.properties[name] = makeNullable(result.properties[name] as JsonObject)
      }
    }
    result.required = names
    result.additionalProperties = false
  }

  return result
}

export function sanitizeStructuredOutputSchema(schema: unknown): JsonObject {
  const sanitized = sanitizeNode(schema)
  if (!isObject(sanitized)) throw new Error('The structured output schema must be an object.')
  delete sanitized.$schema
  return sanitized
}

// The sanitizer relaxes formerly-optional properties to nullable so the
// model may return null where the Zod schema expects the key to be absent.
export function stripNullProperties(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNullProperties)
  if (!isObject(value)) return value
  const result: JsonObject = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null) continue
    result[key] = stripNullProperties(entry)
  }
  return result
}
