import type {DocTopic} from '../index.js'

export const fileDocs: DocTopic = {
  name: 'file',
  title: 'File Management Documentation',
  description: 'Upload, list, and manage files in your Xano workspace',
  relatedTopics: ['workspace'],
  content: `
# File Management Documentation

## Overview

The file management system in Xano allows you to upload, store, and manage files
within your workspace. Files can be made public or private and are accessible
through your API endpoints.

Use cases include:
- Storing user-uploaded images and documents
- Managing media files for your application
- Hosting static assets

## Key Concepts

### File Access Types
- **public**: Files accessible via public URL without authentication
- **private**: Files requiring authentication to access

### File Types
- **image**: PNG, JPG, GIF, WebP, etc.
- **video**: MP4, MOV, AVI, etc.
- **audio**: MP3, WAV, etc.
- **other**: Documents, PDFs, etc.

## CLI Commands

### List Files
\`\`\`bash
# List all files
xano file list -w <workspace_id>

# With pagination
xano file list -w <workspace_id> --page 1 --per-page 50

# Filter by access type
xano file list -w <workspace_id> --access public

# Search files
xano file list -w <workspace_id> -s "logo"

# JSON output
xano file list -w <workspace_id> -o json
\`\`\`

**Example Output:**
\`\`\`
Files:
  - logo.png (ID: 123, 1.2 MB, public)
  - document.pdf (ID: 124, 500 KB, private)
\`\`\`

### Upload File
\`\`\`bash
# Upload a public file
xano file upload ./image.png -w <workspace_id>

# Upload a private file
xano file upload ./document.pdf -w <workspace_id> --access private

# Specify file type
xano file upload ./video.mp4 -w <workspace_id> --type video

# JSON output
xano file upload ./image.png -w <workspace_id> -o json
\`\`\`

**Example Output:**
\`\`\`
File uploaded successfully!
ID: 123
Name: image.png
Size: 1.2 MB
Access: public
URL: https://your-workspace.xano.io/vault/...
\`\`\`

### Delete File
\`\`\`bash
# Delete a single file
xano file delete <file_id> -w <workspace_id>

# Force delete (no confirmation)
xano file delete <file_id> -w <workspace_id> --force
\`\`\`

### Bulk Delete Files
\`\`\`bash
# Delete multiple files
xano file bulk-delete -w <workspace_id> --ids 123,124,125

# Force delete
xano file bulk-delete -w <workspace_id> --ids 123,124,125 --force
\`\`\`

**Warning:** File deletion is permanent and cannot be undone.

## File Storage Best Practices

1. **Use appropriate access levels**: Only make files public if needed
2. **Organize with naming conventions**: Use prefixes like \`users/\`, \`products/\`
3. **Optimize file sizes**: Compress images before uploading
4. **Clean up unused files**: Regularly remove orphaned files
5. **Use CDN for public files**: Enable CDN for better performance

## File Size Limits

File size limits depend on your Xano plan:
- Free tier: Limited file storage
- Paid plans: Higher limits based on plan

## Working with Files in API Endpoints

### Accepting File Uploads
\`\`\`xanoscript
api POST "upload-avatar" {
  input {
    file avatar {
      description = "User avatar image"
    }
  }

  stack {
    # Save uploaded file
    file.create $input.avatar as $saved_file
  }

  response = $saved_file
}
\`\`\`

### Returning File URLs
\`\`\`xanoscript
stack {
  db.get user {
    field_name = "id"
    field_value = $input.user_id
  } as $user

  # File URL is available on file fields
  var $result {
    value = {
      name: $user.name,
      avatar_url: $user.avatar.url
    }
  }
}
\`\`\`

## Related Documentation

- \`xano docs workspace\` - Workspace management
- \`xano docs api\` - API endpoints for file operations
- \`xano docs table\` - Storing file references in tables
`.trim(),
}
