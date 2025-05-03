# Token Counting Implementation and Testing Plan

## Overview

Token counting is critical for the Claude Code provider to accurately estimate context window usage and handle rate limiting. This document outlines the implementation of token counting and a testing plan to ensure accuracy.

## Current Implementation

The current token counting implementation in `claude-code.ts` uses a naive approach that may not accurately reflect Claude's actual token counting algorithm.

```typescript
// Current implementation (simplified)
function countTokens(text: string): number {
  // Simple token counting based on whitespace
  return text.split(/\s+/).length;
}
```

## Improved Implementation

A more accurate token counting implementation should:

1. Use the same tokenization algorithm as Claude
2. Handle special tokens correctly
3. Account for different languages and character sets

### Proposed Solution

```typescript
// Improved implementation using Claude-compatible tokenization
import { encode } from 'gpt-3-encoder'; // As a fallback/approximation

export function countTokens(text: string): number {
  try {
    // For Claude API, the tiktoken-compatible library would be ideal
    // We use GPT tokenizer as a reasonable approximation
    return encode(text).length;
  } catch (error) {
    // Fallback to naive counting if tokenizer fails
    console.warn('Tokenizer failed, using fallback method', error);
    return text.split(/\s+/).length;
  }
}

// For more accuracy, we could implement a Claude-specific tokenizer
// based on the official Claude tokenization rules when available
```

## Testing Plan

### Unit Tests

Create comprehensive unit tests for token counting:

```typescript
describe('Token Counting', () => {
  test('Empty string has 0 tokens', () => {
    expect(countTokens('')).toBe(0);
  });
  
  test('Simple English text', () => {
    expect(countTokens('Hello world')).toBe(2);
  });
  
  test('Code snippets', () => {
    const code = `function test() {\n  return true;\n}`;
    // The expected value should be determined by Claude's actual tokenization
    expect(countTokens(code)).toBeGreaterThan(5);
  });
  
  test('Special characters', () => {
    expect(countTokens('!@#$%^&*()')).not.toBe(0);
  });
  
  test('Unicode characters', () => {
    expect(countTokens('你好世界')).toBeGreaterThan(0);
  });
  
  test('Mixed content', () => {
    const mixed = 'Hello world!\n```python\nprint("hello")\n```\n你好';
    // Compare with Claude's actual token count for this input
    expect(countTokens(mixed)).toBeGreaterThan(10);
  });
});
```

### Integration Tests

Test token counting in the context of the Claude Code provider:

```typescript
describe('Claude Code Token Counting Integration', () => {
  let claudeCode: ClaudeCodeHandler;
  
  beforeEach(() => {
    claudeCode = new ClaudeCodeHandler({});
  });
  
  test('Prompt token counting matches Claude API', async () => {
    const prompt = 'Write a function to calculate Fibonacci numbers.';
    
    // Mock Claude API response with token counts
    const mockResponse = {
      usage: {
        input_tokens: 10, // Expected value from Claude API
        output_tokens: 50
      }
    };
    
    // Mock API call
    jest.spyOn(claudeCode, 'executeClaudeCodeCommand').mockResolvedValue(JSON.stringify(mockResponse));
    
    // Test our token counting against Claude's reported count
    const estimatedTokens = claudeCode.countPromptTokens(prompt);
    const actualTokens = (await claudeCode.sendPrompt(prompt)).usage.input_tokens;
    
    // Should be within 10% of actual
    expect(Math.abs(estimatedTokens - actualTokens) / actualTokens).toBeLessThan(0.1);
  });
  
  test('Response token counting matches Claude API', async () => {
    const prompt = 'Write a short poem about programming.';
    const response = 'Coding in silence,\nBugs emerge from the shadows,\nLogic brings the dawn.';
    
    // Similar testing for response tokens
    // ...
  });
});
```

### Benchmark Tests

Create benchmark tests to compare different token counting implementations:

```typescript
describe('Token Counting Benchmarks', () => {
  const testCases = [
    { name: 'Small text', text: 'Hello world' },
    { name: 'Medium text', text: 'A paragraph with several sentences...' },
    { name: 'Large text', text: /* Large multi-paragraph text */ },
    { name: 'Code', text: /* Large code sample */ },
  ];
  
  test('Benchmark different implementations', () => {
    for (const testCase of testCases) {
      console.time(`naive-${testCase.name}`);
      const naiveCount = naiveTokenCount(testCase.text);
      console.timeEnd(`naive-${testCase.name}`);
      
      console.time(`improved-${testCase.name}`);
      const improvedCount = countTokens(testCase.text);
      console.timeEnd(`improved-${testCase.name}`);
      
      // Log results for comparison
      console.log(`${testCase.name}: naive=${naiveCount}, improved=${improvedCount}`);
    }
  });
});
```

## Implementation Plan

1. Research Claude's tokenization algorithm
2. Implement improved token counting function
3. Add comprehensive unit tests
4. Add integration tests with mock Claude API responses
5. Benchmark against different text types and sizes
6. Document the token counting approach and limitations

## Monitoring and Improvement

After implementation:

1. Log both estimated and actual token counts in production
2. Calculate error rates and adjust the algorithm
3. Continuously improve based on real-world usage patterns
4. Consider caching token counts for frequently used prompts