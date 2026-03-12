import type { ToolDefinition } from "./types";

// ---------------------------------------------------------------------------
// JSON Schema builder types
// ---------------------------------------------------------------------------

type JsonSchemaType = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export interface JsonSchemaProperty {
  type: JsonSchemaType | JsonSchemaType[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchemaProperty;
}

export interface ParametersSchema {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

// ---------------------------------------------------------------------------
// createToolDefinition — convenience factory
// ---------------------------------------------------------------------------

export function createToolDefinition(
  name: string,
  description: string,
  parameters: ParametersSchema,
): ToolDefinition {
  return { name, description, parameters };
}

// ---------------------------------------------------------------------------
// Type-safe JSON Schema property builders
// ---------------------------------------------------------------------------

export function stringProp(opts: {
  description?: string;
  enum?: string[];
  default?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
} = {}): JsonSchemaProperty {
  return { type: "string", ...opts };
}

export function numberProp(opts: {
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: number;
} = {}): JsonSchemaProperty {
  return { type: "number", ...opts };
}

export function integerProp(opts: {
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: number;
} = {}): JsonSchemaProperty {
  return { type: "integer", ...opts };
}

export function booleanProp(opts: {
  description?: string;
  default?: boolean;
} = {}): JsonSchemaProperty {
  return { type: "boolean", ...opts };
}

export function arrayProp(items: JsonSchemaProperty, opts: {
  description?: string;
} = {}): JsonSchemaProperty {
  return { type: "array", items, ...opts };
}

export function objectProp(
  properties: Record<string, JsonSchemaProperty>,
  opts: {
    description?: string;
    required?: string[];
    additionalProperties?: boolean;
  } = {},
): JsonSchemaProperty {
  return { type: "object", properties, ...opts };
}

// ---------------------------------------------------------------------------
// parametersSchema — builds the top-level "parameters" object for a tool
// ---------------------------------------------------------------------------

export function parametersSchema(
  properties: Record<string, JsonSchemaProperty>,
  required: string[] = [],
): ParametersSchema {
  return {
    type: "object",
    properties,
    required: required.length > 0 ? required : undefined,
    additionalProperties: false,
  };
}
