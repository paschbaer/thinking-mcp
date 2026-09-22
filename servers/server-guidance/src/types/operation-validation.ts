/** Explicit success policy for a required operation (FR-036). */
export interface OperationValidationPolicy {
  protocolRequestMustSucceed?: boolean;
  toolResultMustNotBeError?: boolean;
  requiredContent?: boolean;
  structuredContent?: { schema: string };
  rules?: unknown[];
  warningThreshold?: number;
  exitCodeMustBeZero?: boolean;
}
