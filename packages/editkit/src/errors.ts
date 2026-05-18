export class EditkitError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PARSE_ERROR"
      | "APPLY_FAILED"
      | "MISSING_FILE"
      | "AMBIGUOUS_MATCH"
      | "INVALID_FORMAT",
  ) {
    super(message);
    this.name = "EditkitError";
  }
}
