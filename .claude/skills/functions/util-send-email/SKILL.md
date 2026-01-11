---
name: util-send-email
description: XanoScript util.send_email function - sends emails using Xano built-in provider or Resend. Use for notifications, alerts, and user communications.
---

# util.send_email

Sends an email using either Xano's built-in email service or the Resend provider.

## Syntax

```xs
util.send_email {
  service_provider = "xano"  // or "resend"
  subject = "Email Subject"
  message = "Email body content"
  // Optional fields for Resend:
  // api_key = $env.resend_key
  // to = "recipient@example.com"
  // from = "sender@example.com"
  // cc = ["cc@example.com"]
  // bcc = ["bcc@example.com"]
  // reply_to = "reply@example.com"
  // scheduled_at = "2025-11-26T01:01:02.00"
} as $result
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `service_provider` | text | Yes | `"xano"` (built-in) or `"resend"` |
| `subject` | text | Yes | Email subject line |
| `message` | text | Yes | Email body content (HTML supported) |
| `api_key` | text | Resend only | Resend API key (use $env variable) |
| `to` | text/array | Resend only | Recipient email(s) |
| `from` | text | Resend only | Sender email address |
| `cc` | array | No | CC recipients |
| `bcc` | array | No | BCC recipients |
| `reply_to` | text | No | Reply-to address |
| `scheduled_at` | text | No | ISO 8601 datetime for scheduled send |

## Return Value

Returns an object with:
- `id` - Unique email ID
- `remaining` - Remaining emails in quota (Xano provider)
- `status` - Send status ("success")

## Examples

### Basic Email with Xano Provider

```xs
query "send-email" verb=POST {
  description = "Send email using Xano built-in provider"

  input {
    text subject { description = "Email subject" }
    text message { description = "Email body" }
  }

  stack {
    util.send_email {
      service_provider = "xano"
      subject = $input.subject
      message = $input.message
    } as $result
  }

  response = {
    status: "sent",
    result: $result
  }
}
// Returns: { "status": "sent", "result": { "id": "...", "remaining": 99, "status": "success" } }
```

### Email with Resend Provider

```xs
query "send-resend-email" verb=POST {
  input {
    text to { description = "Recipient email" }
    text subject { description = "Email subject" }
    text message { description = "Email body (HTML)" }
  }

  stack {
    util.send_email {
      api_key = $env.RESEND_API_KEY
      service_provider = "resend"
      subject = $input.subject
      message = $input.message
      to = $input.to
      from = "noreply@yourdomain.com"
    } as $result
  }

  response = $result
}
```

### Email with CC and BCC

```xs
query "send-team-email" verb=POST {
  input {
    text subject { description = "Email subject" }
    text message { description = "Email body" }
  }

  stack {
    util.send_email {
      api_key = $env.RESEND_API_KEY
      service_provider = "resend"
      subject = $input.subject
      message = $input.message
      to = "primary@example.com"
      cc = ["team1@example.com", "team2@example.com"]
      bcc = ["archive@example.com"]
      from = "notifications@yourdomain.com"
      reply_to = "support@yourdomain.com"
    } as $result
  }

  response = $result
}
```

### Scheduled Email

```xs
query "schedule-email" verb=POST {
  input {
    text to { description = "Recipient" }
    text subject { description = "Subject" }
    text message { description = "Body" }
    timestamp send_at { description = "When to send" }
  }

  stack {
    util.send_email {
      api_key = $env.RESEND_API_KEY
      service_provider = "resend"
      subject = $input.subject
      message = $input.message
      to = $input.to
      from = "scheduler@yourdomain.com"
      scheduled_at = $input.send_at
    } as $result
  }

  response = $result
}
```

## Service Providers

### Xano (Built-in)
- **Use for**: Testing and development
- **Routing**: All emails go to workspace admin email
- **Quota**: Limited daily sends
- **No API key required**

### Resend
- **Use for**: Production email sending
- **Features**: Full recipient control, scheduling, tracking
- **Requires**: Resend API key and verified domain
- **Docs**: https://resend.com/docs

## Important Notes

1. **HTML Support** - Message body can contain HTML for formatting
2. **Environment Variables** - Store API keys in $env, never hardcode
3. **Xano Provider** - Routes all emails to admin (for testing only)
4. **Rate Limits** - Check `remaining` in response for quota tracking
5. **Error Handling** - Failed sends throw errors, use try/catch if needed

## Test API Group

**API Group:** xs-util (ID: 269)
**Base URL:** `https://xhib-njau-6vza.d2.dev.xano.io/api:3KzrYiuB`

| Endpoint | ID | Purpose | Status |
|----------|-----|---------|--------|
| send-email | 2126 | Send email via Xano provider | Working |

## Related Functions

- `util.template_engine` - Create dynamic email content with TWIG
