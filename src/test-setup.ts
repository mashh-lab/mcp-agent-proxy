/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-explicit-any */
import { expect } from 'vitest'

// Extend expect with custom matchers
expect.extend({
  toBeOneOf(received: unknown, values: unknown[]) {
    const pass = values.includes(received)
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be one of ${values.join(', ')}`,
        pass: true,
      }
    } else {
      return {
        message: () => `expected ${received} to be one of ${values.join(', ')}`,
        pass: false,
      }
    }
  },
})

// Type declaration for custom matcher
declare global {
  namespace Vi {
    interface AsymmetricMatchersContaining {
      toBeOneOf: (values: unknown[]) => any
    }
  }
}
