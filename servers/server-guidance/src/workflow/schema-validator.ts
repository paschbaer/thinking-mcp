/** Strict JSON Schema validation factory (FR-007, FR-030, FR-042). */
import { createHash } from "node:crypto";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SchemaValidator {
  validate(payload: unknown): ValidationResult;
  readonly schemaHash: string;
}

export function createValidator(schema: unknown): SchemaValidator {
  const schemaHash = `sha256:${createHash("sha256").update(JSON.stringify(schema)).digest("hex")}`;
  const validate = getCompile()(schema);
  return {
    schemaHash,
    validate(payload: unknown): ValidationResult {
      const valid = validate(payload) as boolean;
      const errors = valid ? [] : collectErrors(validate);
      return { valid, errors };
    },
  };
}

type AjvValidate = ((data: unknown) => boolean) & { errors?: { instancePath: string; message?: string }[] | null };

function collectErrors(validate: AjvValidate): string[] {
  return (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message ?? ""}`.trim());
}

let compileFn: ((schema: unknown) => AjvValidate) | null = null;

/** Lazily constructs the draft-2020-12 compiler (Ajv) with strict mode off. */
function getCompile(): (schema: unknown) => AjvValidate {
  if (!compileFn) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Ajv2020 = require("ajv/dist/2020.js").default as new (opts: object) => {
      compile: (s: unknown) => AjvValidate;
    };
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    compileFn = (schema) => ajv.compile(schema);
  }
  return compileFn;
}

// `require` shim for ESM (node:module createRequire)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
