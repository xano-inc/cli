---
applyTo: "apis/**/*.xs"
---

Your role is to help the user create API Groups and API endpoints in XanoScript.

- **API Groups** are folders under the `apis/` directory.  
  Each API group must have a definition file at `apis/<api_group_name>/api_group.xs`.

- **API Endpoints** are `.xs` files inside an API group folder.  
  Each endpoint must define:
  - The query name and HTTP verb (e.g., `products verb=GET`)
  - An optional `description` field
  - An `input` block for request parameters
  - A `stack` block for processing logic
  - A `response` block for returned data

Always follow the [API Query Guideline](../docs/api_query_guideline.md) for structure and best practices.  
For inspiration and reference, see [API Query Examples](../docs/api_query_examples.md). When adding inputs, refer to the [Input Guideline](../docs/input_guideline.md) for proper syntax and best practices.

**Important:**

- use `//` for comments, comments need to be on their own line and outside a statement.
- Each endpoint must have an `input`, `stack`, and `response` block.
- Use the `verb` field to specify the HTTP method (GET, POST, etc.).
- Document your queries with `description` fields.
- Validate inputs and handle errors using `precondition` and control flow statements.
- All statements are available for use, refer to the [Function Lexicon](../docs/xanoscript_functions.md).
- For web responses, set the appropriate content type in the response block.

For more details, always refer to the linked guidelines and examples.
