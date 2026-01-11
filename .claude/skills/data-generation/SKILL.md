---
name: data-generation
description: Use this skill when populating tables with test data, creating realistic demo data, or seeding databases for development.
---

# Data Generation Patterns

## CRITICAL: Seed Data BEFORE Building APIs!

**You cannot test APIs without data. Always seed test data before building endpoints!**

### Correct Build Order
```
1. Tables      → Create the schema
2. Test Data   → Seed 3-5 records per table ← YOU ARE HERE
3. APIs        → Build the endpoints
4. Test        → Verify APIs return seeded data
```

### Minimum Test Data Requirements

| Table Type | Minimum Records | Why |
|------------|-----------------|-----|
| Core entities | 3-5 records | Test list/pagination/filtering |
| Lookup tables | All valid values | Test enum/type coverage |
| Junction tables | 5-10 records | Test relationships |

### Include Data Seeding in Task Breakdown!

```
EPIC: Build User Feature
  ├── SUBTASK: Create user table
  ├── SUBTASK: Seed 5 test users ← Don't forget this!
  ├── SUBTASK: Build GET /users endpoint
  └── SUBTASK: Test GET /users returns data
```

---

## When to Use
When you need to populate tables with realistic test data for development, demos, or testing.

## Core Concepts

The MCP server can generate test data using two operations:
- `workspace_table_content_post` - Insert single record
- `workspace_table_content_bulk_post` - Insert multiple records (batch)

### Bulk Insert Format
```json
{
  "items": [
    { "column1": "value1", "column2": "value2" },
    { "column1": "value3", "column2": "value4" }
  ]
}
```

---

## Realistic Data Generation Guidelines

### Names
- Use diverse, realistic names (mix of cultures, genders)
- First names: Sarah, James, Maria, Chen, Ahmed, Priya, Carlos
- Last names: Johnson, Smith, Garcia, Kim, Patel, Williams, Chen

### Companies
- Use realistic company name patterns:
  - "[Industry] [Suffix]": "TechVision Solutions", "Global Logistics Corp"
  - "[Founder] & [Founder]": "Smith & Partners"
  - "[Name][Tech term]": "DataFlow", "CloudBridge", "NexGen"
- Include varied industries: Technology, Healthcare, Finance, Manufacturing, Retail
- Company sizes: startup (1-50), small (51-200), medium (201-1000), enterprise (1000+)

### Contact Information
- Emails: firstname.lastname@company.com or firstname@company.com
- Phones: Use realistic formats (555-XXX-XXXX for US)
- Titles: CEO, CTO, VP Sales, Director of Marketing, Sales Manager, Account Executive

### Deals & Pipeline
- Values: Range from $5,000 to $500,000 based on company size
- Stages: Distribute across pipeline (more in early stages, fewer in later)
- Close dates: Within 30-180 days

---

## CRM Data Generation Examples

### 1. Generate Users (Sales Team)
**Intent**:
```
Insert records into the user table (id 428). Body: items = [
  {"name": "Sarah Johnson", "email": "sarah@acme.com", "password": "hashed_pwd_1", "role": "admin"},
  {"name": "James Chen", "email": "james@acme.com", "password": "hashed_pwd_2", "role": "manager"},
  {"name": "Maria Garcia", "email": "maria@acme.com", "password": "hashed_pwd_3", "role": "rep"}
]
```

### 2. Generate Companies
**Intent**:
```
Insert records into the company table (id 429). Body: items = [
  {"name": "TechVision Solutions", "domain": "techvision.com", "industry": "Technology", "size": "medium"},
  {"name": "Global Health Partners", "domain": "globalhealthpartners.com", "industry": "Healthcare", "size": "enterprise"},
  {"name": "Summit Financial Group", "domain": "summitfinancial.com", "industry": "Finance", "size": "large"}
]
```

### 3. Generate Contacts (referencing companies)
**Intent**:
```
Insert records into the contact table (id 430). Body: items = [
  {"first_name": "Michael", "last_name": "Roberts", "email": "mroberts@techvision.com", "title": "CTO", "company_id": 1},
  {"first_name": "Jennifer", "last_name": "Lee", "email": "jlee@techvision.com", "title": "VP Engineering", "company_id": 1},
  {"first_name": "David", "last_name": "Kim", "email": "dkim@globalhealthpartners.com", "title": "CEO", "company_id": 2}
]
```

---

## Intent Patterns for Data Generation

| Action | Pattern | Example |
|--------|---------|---------|
| Single record | "Insert a record into [table]. Body: {fields}" | "Insert a record into user table. Body: {name: 'John', email: 'john@test.com'}" |
| Bulk records | "Insert records into [table] (id N). Body: items = [...]" | See examples above |
| Generate N records | "Generate N realistic [entity] records for [table]" | "Generate 10 realistic company records for the company table" |
| Seed full dataset | "Seed the CRM with test data: N users, N companies, N contacts, N deals" | "Seed the CRM with test data: 5 users, 10 companies, 20 contacts, 15 deals" |

---

## Best Practices

### 1. Respect Referential Integrity
Insert in dependency order:
1. `user` (no dependencies)
2. `company` (no dependencies)
3. `contact` (requires company_id)
4. `deal` (requires contact_id, company_id, user_id)
5. `activity` (requires various foreign keys)
6. `note` (polymorphic, insert last)

### 2. Use Realistic Distributions
- **Pipeline stages**: 30% lead, 25% qualified, 20% proposal, 15% negotiation, 10% closed
- **Activity types**: 40% calls, 35% emails, 15% meetings, 10% tasks
- **User roles**: 1 admin, 1-2 managers, rest are reps

### 3. Provide Context
Always provide `table_id` in context when the intent doesn't include it:
```json
{
  "table_id": 429,
  "workspace_id": 37
}
```

---

## Troubleshooting

### Foreign Key Errors
Make sure referenced records exist. Insert in order of dependencies.

### Enum Value Errors
Use exact enum values:
- `user.role`: admin, manager, rep
- `deal.stage`: lead, qualified, proposal, negotiation, closed_won, closed_lost
- `activity.type`: call, email, meeting, task

### Missing Required Fields
Each table has required fields. Check schema before inserting.

## Related Skills
- [effective-intents](../effective-intents/SKILL.md) - General intent patterns
- [table-patterns](../table-patterns/SKILL.md) - Table design
