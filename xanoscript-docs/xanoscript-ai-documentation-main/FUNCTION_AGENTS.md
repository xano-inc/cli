---
applyTo: "functions/**/*.xs"
---

# Xanoscript Custom Functions Guide

This document serves as instructions for generating custom functions in Xanoscript. As an AI agent (e.g., copilot), use these guidelines to create reusable, well-structured functions based on user requests. Always prioritize clarity, validation, and error handling. Reference examples and syntax from supporting docs.

## Core Principles

- **Reusability**: Functions should encapsulate specific logic (e.g., calculations, data processing, API integrations) for use in queries, tasks, or other functions.
- **Validation**: Use `input` filters, `precondition`, and conditionals to ensure robust inputs.
- **Documentation**: Include `description` in the function and blocks for readability.
- **Output**: Always end with a `response` block; include tests where applicable.
- **Simplicity**: Keep logic concise; use built-in helpers (e.g., `math.add`, `array.filter`) from Xanoscript syntax.
- **Edge Cases**: Handle nulls, empties, and errors explicitly.

## Function Structure

Every custom function follows this template (note the absence of comments, xanoscript does not support them, instead it uses description fields):

```xs
function <namespace>/<function_name> {
  description = "<Brief description of purpose and inputs/outputs>"

  input {
    <type> <param_name>[?=default] [filters=<filters>]  {
      description = "<Param description>"
      [sensitive = true/false]
    }

  }

  stack {
    var $<var_name> {
      value = <expression>
      description = "<Purpose>"
    }

    precondition (<condition>) {
      error_type = "inputerror"
      error = "<Error message>"
    }
  }

  response = $<result_var>

  test "<test_name>" {
    input = { <param>: <value>, ... }
    expect.to_equal ($response.<field>) {
      value = <expected>
    }
  }
}
```

- **Namespace**: Use folders like `utils/`, `maths/`, `hr/` for organization (e.g., `utils/parse_url`).
- **Input Types**: `int`, `text`, `decimal`, `bool`, `timestamp`, `decimal[]` (arrays), etc. Mark optional with `?`.
- **Filters**: `trim`, `lower`, `min:0`, `max:100`, etc.
- **Stack Logic**: Sequential execution; group complex sections with `group { ... }`.

## Step-by-Step Creation Process

1. **Understand Request**: Identify purpose (e.g., "Format phone numbers"). Extract inputs/outputs.
2. **Define Inputs**: List params with types, defaults, validations.
3. **Build Stack**:
   - Init vars.
   - Validate (preconditions first, then conditionals).
   - Compute core logic (loops, math, API calls).
   - Handle errors with `throw` or `try_catch`.
4. **Set Response**: Return single value or object (e.g., `{ formatted: $result, original: $input }`).
5. **Add Tests**: Cover happy path and 1-2 edge cases.
6. **Review**: Ensure no side effects; mock external deps (e.g., DB, API) if needed.

## Common Patterns

- **Calculations**: Use `math.add`, `math.mul` in loops for sums/products.
- **Arrays**: `array.filter`, `array.merge`, `foreach` for processing lists.
- **Validation**: Preconditions for quick fails; conditionals for branches.
- **API/DB**: `api.request` or `db.query` with mocks in tests.
- **Errors**: `throw { name = "ValidationError", value = "Msg" }`.

## Best Practices

- **Naming**: Kebab-case for names; descriptive vars (e.g., `$total_weight`).
- **Comments**: Use `description` in vars/blocks; Comments can be used using `//` but should be placed before or after a statement block.
- **Performance**: Avoid deep nests; use efficient helpers.
- **Security**: Mark `sensitive = true` for PII; validate all inputs.
- **Length**: Aim for <200 lines; refactor if complex.
- **Versioning**: If updating, note changes in description.

## References

- [Full examples](../docs/function_examples.md)
- [Function lexicon](../docs/xanoscript_functions.md)
- [Syntax details](../docs/functions.md)
- [Function guidelines (adapt for function calls)](../docs/function_guideline.md)
- [Input guidelines](../docs/input_guideline.md)

When generating, output only the Xanoscript code unless specified. If unclear, ask for clarification on inputs/outputs.
