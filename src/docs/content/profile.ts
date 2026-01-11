import type {DocTopic} from '../index.js'

export const profileDocs: DocTopic = {
  name: 'profile',
  title: 'Profile Documentation',
  description: 'Manage authentication profiles for connecting to Xano instances',
  relatedTopics: ['workspace', 'getting-started'],
  content: `
# Profile Documentation

## Overview

Profiles in the Xano CLI manage your authentication credentials and default settings
for connecting to Xano instances. Each profile stores an access token, origin URL,
and optional default workspace.

Use cases include:
- Managing multiple Xano accounts
- Switching between production and staging environments
- Team member access management
- CI/CD pipeline configuration

## Key Concepts

### Profile Components
- **Access Token**: Your API authentication token
- **Origin**: The Xano instance URL (e.g., https://app.xano.com)
- **Workspace ID**: Optional default workspace
- **Project ID**: Optional project context

### Profile Storage
Profiles are stored in \`~/.xano/credentials.yaml\` on your local machine.

## CLI Commands

### Create Profile with Wizard
The easiest way to create a profile:

\`\`\`bash
# Interactive wizard
xano profile wizard

# With profile name pre-set
xano profile wizard --name production
\`\`\`

**Wizard Flow:**
1. Enter your access token
2. Select or enter instance URL
3. Choose a profile name
4. Optionally set default workspace

### Create Profile Manually
\`\`\`bash
# Create with token
xano profile create --name myprofile --token <your_token>

# Create with custom origin
xano profile create --name staging --token <token> --origin https://staging.xano.com
\`\`\`

### List Profiles
\`\`\`bash
# List all profiles
xano profile list
\`\`\`

**Example Output:**
\`\`\`
Available profiles:
  - production (default)
  - staging
  - development
\`\`\`

### Set Default Profile
\`\`\`bash
# Set default profile
xano profile set-default production
\`\`\`

### Get Default Profile
\`\`\`bash
# Show current default
xano profile get-default
\`\`\`

### Edit Profile
\`\`\`bash
# Edit existing profile
xano profile edit myprofile --workspace 40
\`\`\`

### Delete Profile
\`\`\`bash
# Delete a profile
xano profile delete staging
\`\`\`

### Get Current User Info
\`\`\`bash
# Show authenticated user
xano profile me
\`\`\`

### Print Access Token
\`\`\`bash
# Print token (useful for scripts)
xano profile token
\`\`\`

### Print Project ID
\`\`\`bash
# Print project ID
xano profile project
\`\`\`

## Using Profiles with Commands

### Specify Profile per Command
\`\`\`bash
# Use specific profile
xano workspace list --profile staging
xano api list -w 40 -p production
\`\`\`

### Environment Variable
\`\`\`bash
# Set profile via environment
export XANO_PROFILE=production
xano workspace list
\`\`\`

### Profile with Default Workspace
When a profile has a default workspace, you don't need to specify \`-w\`:

\`\`\`bash
# If profile has workspace=40 set
xano api list  # Uses workspace 40
\`\`\`

## Profile Configuration File

Profiles are stored in YAML format:

\`\`\`yaml
# ~/.xano/credentials.yaml
profiles:
  production:
    token: your_access_token
    origin: https://app.xano.com
    workspace: 40
  staging:
    token: staging_token
    origin: https://staging.xano.com
default: production
\`\`\`

## Getting an Access Token

1. Log in to your Xano dashboard
2. Go to Account Settings
3. Navigate to API Keys
4. Generate a new Metadata API key
5. Copy the token for use with the CLI

## Best Practices

1. **Use descriptive profile names**: \`production\`, \`staging\`, \`dev-team\`
2. **Set default workspace**: Reduces repetitive flag usage
3. **Secure your credentials**: Don't commit credentials.yaml to version control
4. **Rotate tokens periodically**: For security compliance
5. **Use environment variables in CI/CD**: Keep tokens out of scripts

## Security Considerations

- Access tokens grant full API access
- Store credentials securely
- Use separate tokens for different environments
- Revoke compromised tokens immediately

## Related Documentation

- \`xano docs getting-started\` - Initial setup guide
- \`xano docs workspace\` - Workspace management
`.trim(),
}
