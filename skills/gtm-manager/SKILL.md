---
name: gtm-manager
description: 'Manage Google Tag Manager containers, tags, triggers, and variables. Use for any GTM-related task including listing, inspecting, creating, updating, or deleting GTM resources.'
---

# GTM Manager

Programmatically manage Google Tag Manager via the Tag Manager API v2.

## Setup

### Prerequisites
- Node.js installed
- `googleapis` and `open` npm packages: `npm install googleapis open`
- GCP project with Tag Manager API enabled
- OAuth client credentials JSON (for interactive use) or service account key (for automation)

### Environment Variables
Set these to avoid passing credentials on every command:
```bash
export GTM_CREDENTIALS_PATH=/path/to/client_secrets.json
export GTM_TOKEN_PATH=/path/to/token.json
export GTM_ACCOUNT_ID=your_account_id
export GTM_CONTAINER_ID=your_container_id
```

For service account auth:
```bash
export GTM_SERVICE_KEY_PATH=/path/to/service-account.json
```

## Authentication

### OAuth (Interactive)
First-time setup opens a browser for Google login:
```bash
node scripts/auth-oauth.js --credentials ./client_secrets.json --token ./token.json
```

### Service Account
For automation (service account must have GTM permissions):
```bash
node scripts/auth-service.js --service-key ./service-account.json
```

## Available Scripts

All scripts output JSON to stdout. Use `--help` on any script for full options.

### Identity

**Show current authenticated user:**
```bash
node scripts/whoami.js --credentials $GTM_CREDENTIALS_PATH --token $GTM_TOKEN_PATH
```

### List Operations

**List accounts:**
```bash
node scripts/list-accounts.js --credentials $GTM_CREDENTIALS_PATH --token $GTM_TOKEN_PATH
```

**List containers in an account:**
```bash
node scripts/list-containers.js --account 6224254648
```

**List tags:**
```bash
node scripts/list-tags.js --account 6224254648 --container 181424855
```

**List triggers:**
```bash
node scripts/list-triggers.js --account 6224254648 --container 181424855
```

**List variables:**
```bash
node scripts/list-variables.js --account 6224254648 --container 181424855
```

**List versions:**
```bash
node scripts/list-versions.js --account 6224254648 --container 181424855
```

### Inspect Operations

**Inspect tag by ID:**
```bash
node scripts/inspect-tag.js --id 59 --account 6224254648 --container 181424855
```

**Search tags by name:**
```bash
node scripts/inspect-tag.js --name "Google Ads" --account 6224254648 --container 181424855
```

**Inspect trigger:**
```bash
node scripts/inspect-trigger.js --id 17 --account 6224254648 --container 181424855
```

**Inspect variable:**
```bash
node scripts/inspect-variable.js --name "Zenoti" --account 6224254648 --container 181424855
```

### Create Operations

**Create tag from JSON:**
```bash
node scripts/create-tag.js --json ./tag-config.json --account 6224254648 --container 181424855
```

**Create trigger from inline JSON:**
```bash
node scripts/create-trigger.js --json '{"name":"My Trigger","type":"customEvent","customEventFilter":[...]}' --account 6224254648 --container 181424855
```

**Create variable:**
```bash
node scripts/create-variable.js --json ./variable-config.json --account 6224254648 --container 181424855
```

### Update Operations

**Update tag:**
```bash
node scripts/update-tag.js --id 59 --json ./updated-tag.json --account 6224254648 --container 181424855
```

**Update trigger:**
```bash
node scripts/update-trigger.js --id 17 --json ./updated-trigger.json --account 6224254648 --container 181424855
```

### Delete Operations

**Delete tag:**
```bash
node scripts/delete-tag.js --id 59 --account 6224254648 --container 181424855
```

**Delete trigger:**
```bash
node scripts/delete-trigger.js --id 17 --account 6224254648 --container 181424855
```

### Utility Operations

**Duplicate tag with new name and trigger:**
```bash
node scripts/duplicate-tag.js --id 59 --name "Google Ads | Zenoti Booking | Dallas" --trigger 85 --account 6224254648 --container 181424855
```

**Duplicate tag with parameter overrides:**
```bash
node scripts/duplicate-tag.js --id 59 --json '{"name":"New Tag","parameter":[{"key":"conversionLabel","type":"template","value":"newLabel123"}]}' --account 6224254648 --container 181424855
```

**Publish container:**
```bash
node scripts/publish.js --version-name "v1.0" --notes "Added location tags" --account 6224254648 --container 181424855
```

## Common Tag Types

| Type | Description |
|------|-------------|
| `awct` | Google Ads Conversion Tracking |
| `gaawe` | GA4 Event |
| `googtag` | Google Tag |
| `html` | Custom HTML |
| `sp` | Google Ads Remarketing |
| `gclidw` | Conversion Linker |

## Common Trigger Types

| Type | Description |
|------|-------------|
| `pageview` | Page View |
| `customEvent` | Custom Event (dataLayer.push) |
| `click` | Click - All Elements |
| `linkClick` | Click - Just Links |
| `formSubmission` | Form Submission |
| `windowLoaded` | Window Loaded |
| `domReady` | DOM Ready |
| `init` | Initialization |

## Example: Create Location-Specific Triggers

Create a custom event trigger for a specific location:

```javascript
// trigger-config.json
{
  "name": "Zenoti | Booking | Dallas",
  "type": "customEvent",
  "customEventFilter": [
    {
      "type": "equals",
      "parameter": [
        { "type": "template", "key": "arg0", "value": "{{_event}}" },
        { "type": "template", "key": "arg1", "value": "purchase" }
      ]
    }
  ],
  "filter": [
    {
      "type": "equals",
      "parameter": [
        { "type": "template", "key": "arg0", "value": "{{Data Layer Send To}}" },
        { "type": "template", "key": "arg1", "value": "G-58T61GCMLL" }
      ]
    },
    {
      "type": "equals",
      "parameter": [
        { "type": "template", "key": "arg0", "value": "{{Ecomm | Variable | Center Name}}" },
        { "type": "template", "key": "arg1", "value": "AYA Medical Spa Dallas" }
      ]
    }
  ]
}
```

## Example: Create Google Ads Conversion Tag

```javascript
// gads-tag-config.json
{
  "name": "Google Ads | Zenoti Booking | Dallas",
  "type": "awct",
  "parameter": [
    { "type": "boolean", "key": "enableNewCustomerReporting", "value": "false" },
    { "type": "boolean", "key": "enableConversionLinker", "value": "true" },
    { "type": "boolean", "key": "enableProductReporting", "value": "false" },
    { "type": "template", "key": "conversionValue", "value": "{{Zenoti Purchase Total}}" },
    { "type": "template", "key": "conversionCookiePrefix", "value": "_gcl" },
    { "type": "boolean", "key": "enableShippingData", "value": "false" },
    { "type": "template", "key": "conversionId", "value": "1069545890" },
    { "type": "template", "key": "conversionLabel", "value": "51WLCJKPi-8bEKLz__0D" },
    { "type": "boolean", "key": "rdp", "value": "false" }
  ],
  "firingTriggerId": ["85"],
  "tagFiringOption": "oncePerEvent"
}
```

## Workflow: Bulk Create Location Tags

1. First, inspect an existing tag to use as template:
   ```bash
   node scripts/inspect-tag.js --name "Google Ads | Zenoti" --account $GTM_ACCOUNT_ID --container $GTM_CONTAINER_ID
   ```

2. Create triggers for each location:
   ```bash
   node scripts/create-trigger.js --json ./trigger-dallas.json ...
   ```

3. Duplicate the tag for each location with new trigger and conversion label:
   ```bash
   node scripts/duplicate-tag.js --id 59 --name "Google Ads | Zenoti Booking | Dallas" --trigger 85 --json '{"parameter":[{"key":"conversionLabel","type":"template","value":"51WLCJKPi-8bEKLz__0D"}]}'
   ```

4. Verify changes:
   ```bash
   node scripts/list-tags.js --account $GTM_ACCOUNT_ID --container $GTM_CONTAINER_ID
   ```

5. When ready, publish:
   ```bash
   node scripts/publish.js --version-name "Added location tags" --account $GTM_ACCOUNT_ID --container $GTM_CONTAINER_ID
   ```
