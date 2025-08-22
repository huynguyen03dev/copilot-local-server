# Role Normalization for Client Compatibility

## Overview

The GitHub Copilot API Server includes role normalization functionality to ensure compatibility with various AI clients, including Cline, that may send message roles in different formats.

## Problem Solved

Some AI clients (like Cline VSCode extension) send message roles in formats that don't exactly match the OpenAI standard:
- **Capitalized roles**: `"System"`, `"User"`, `"Assistant"` instead of `"system"`, `"user"`, `"assistant"`
- **Alternative role names**: `"human"`, `"ai"`, `"bot"` instead of standard roles
- **Whitespace issues**: `" user "`, `"\tassistant\t"` with extra spaces/tabs

Without normalization, these requests would fail with validation errors like:
```
400 messages.0.role: Role must be one of: system, user, assistant
```

## Solution

The server now automatically normalizes message roles before validation:

### 1. Case Normalization
- `"System"` → `"system"`
- `"USER"` → `"user"`
- `"Assistant"` → `"assistant"`

### 2. Whitespace Trimming
- `" user "` → `"user"`
- `"\tsystem\t"` → `"system"`
- `"\nassistant\n"` → `"assistant"`

### 3. Alternative Role Mapping
- `"human"` → `"user"`
- `"ai"` → `"assistant"`
- `"bot"` → `"assistant"`
- `"model"` → `"assistant"`
- `"chatbot"` → `"assistant"`
- `"gpt"` → `"assistant"`

## Supported Role Variations

### System Role
- `system`, `System`, `SYSTEM`
- With whitespace: `" system "`, `"\tsystem\t"`

### User Role  
- `user`, `User`, `USER`
- `human`, `Human`, `HUMAN`
- With whitespace: `" user "`, `"\thuman\t"`

### Assistant Role
- `assistant`, `Assistant`, `ASSISTANT`
- `ai`, `AI`, `Ai`
- `bot`, `Bot`, `BOT`
- `model`, `Model`, `MODEL`
- `chatbot`, `Chatbot`, `CHATBOT`
- `gpt`, `GPT`, `Gpt`
- With whitespace: `" assistant "`, `"\tai\t"`

## Examples

### Before (Would Fail)
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "System",
      "content": "You are Cline, a helpful AI assistant"
    },
    {
      "role": "User", 
      "content": "Hello!"
    }
  ]
}
```

### After (Now Works)
The same request now automatically normalizes to:
```json
{
  "model": "gpt-4",
  "messages": [
    {
      "role": "system",
      "content": "You are Cline, a helpful AI assistant"
    },
    {
      "role": "user",
      "content": "Hello!"
    }
  ]
}
```

## Client Compatibility

### ✅ Cline VSCode Extension
- Handles capitalized roles (`System`, `User`, `Assistant`)
- Works with standard Cline configuration

### ✅ Continue.dev
- Supports alternative role names
- Handles various formatting styles

### ✅ Custom OpenAI Clients
- Backward compatible with standard lowercase roles
- Supports common role variations

### ✅ Anthropic-style Clients
- Maps `human` → `user` and `ai` → `assistant`
- Maintains Claude-style conversation format

## Testing

### Unit Tests
```bash
npm test tests/unit/role-normalization.test.ts
```

### Integration Tests
```bash
npm test tests/integration/enhanced-integration.test.ts
```

### Manual Testing
```bash
# Test role normalization
bun run scripts/test-role-normalization.ts

# Test HTTP compatibility
chmod +x scripts/test-cline-compatibility.sh
./scripts/test-cline-compatibility.sh
```

## Development Debugging

In development mode, the server logs role transformations:

```
🔄 Role normalized: "System" → "system"
📊 Message role statistics: {
  total: 2,
  transformed: 2,
  byRole: { system: 1, user: 1, assistant: 0 },
  transformationRate: "100.0%"
}
```

## Error Handling

Invalid roles still produce helpful error messages:

```json
{
  "error": {
    "message": "messages.0.role: Role must be one of: system, user, assistant (received: \"admin\"). Did you mean \"assistant\", \"ai\", or \"bot\"? Supported variations include: system, System, SYSTEM, user, User, USER, human, Human, HUMAN, assistant..."
  }
}
```

## Security Considerations

- Only maps to the three standard OpenAI roles: `system`, `user`, `assistant`
- Rejects potentially dangerous roles like `admin`, `root`, `superuser`
- Maintains strict validation after normalization
- Logs transformations for audit purposes in development

## Configuration

Role normalization is always enabled and cannot be disabled. This ensures maximum client compatibility while maintaining security.

## Backward Compatibility

- ✅ Existing clients using standard roles continue to work unchanged
- ✅ No breaking changes to API responses
- ✅ All existing tests continue to pass
- ✅ Performance impact is minimal (transformation only when needed)

## Troubleshooting

### Issue: Cline still shows role validation errors
**Solution**: Ensure you're using the latest version of the server with role normalization enabled.

### Issue: Custom role names not working
**Solution**: Check if your role name is in the supported variations list. If not, consider using standard roles or request addition of your role mapping.

### Issue: Roles being transformed unexpectedly
**Solution**: Check development logs for role transformation messages. Ensure your client is sending the intended role format.

## Future Enhancements

- Add configuration for custom role mappings
- Support for additional client-specific role formats
- Metrics for role normalization usage
- Performance optimizations for high-volume scenarios
