---
name: file-management
description: Use this skill when working with file operations in Xano - uploading, downloading, storing, and managing files.
---

# File Management Patterns

## Status: Placeholder

This skill is under development. It will cover:

- File upload handling in API endpoints
- File storage operations
- File metadata management
- Image processing
- File validation and security
- Presigned URLs for direct uploads
- File type detection and restrictions

---

## Coming Soon

### File Upload Endpoint Pattern

```xs
query "upload" verb=POST {
  input {
    file attachment
    text folder?
  }

  stack {
    // File handling logic will go here
  }

  response = $file_result
}
```

### File Storage Operations

- `file.upload` - Upload file to storage
- `file.get` - Retrieve file metadata
- `file.delete` - Remove file from storage
- `file.url` - Generate access URL

---

## Related Skills
- [sql-lambda-patterns](../sql-lambda-patterns/SKILL.md) - Main development patterns
- [api-testing](../api-testing/SKILL.md) - Testing file endpoints
