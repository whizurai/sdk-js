# @whizurai/sdk-js

Official TypeScript/JavaScript SDK for the Whizurai Platform.

## Installation

```bash
npm install @whizurai/sdk-js
```

## Quick Start

```typescript
import { WhizuraiClient } from '@whizurai/sdk-js';

const client = new WhizuraiClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.whizurai.com' // Optional, defaults to public API
});

// Generate text
const response = await client.generate({
  prompt: 'Hello, world!',
  model: 'gpt-4'
});

console.log(response.content);
```

## Documentation

- [Full Documentation](https://github.com/whizurai/docs)
- [API Reference](https://github.com/whizurai/docs/blob/main/api/README.md)
- [Examples](https://github.com/whizurai/examples)

## License

MIT
