/**
 * Jest Test Setup
 * Configures testing environment for Chrome Extension
 */

// Mock chrome API
global.chrome = {
  runtime: {
    sendMessage: jest.fn((message, callback) => {
      if (callback) callback({});
    }),
    lastError: null,
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: jest.fn((keys, callback) => {
        if (callback) callback({});
      }),
      set: jest.fn((items, callback) => {
        if (callback) callback();
      }),
      remove: jest.fn((keys, callback) => {
        if (callback) callback();
      })
    },
    onChanged: {
      addListener: jest.fn()
    }
  },
  alarms: {
    create: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: {
      addListener: jest.fn()
    }
  },
  action: {
    onClicked: {
      addListener: jest.fn()
    }
  },
  tabs: {
    sendMessage: jest.fn()
  },
  i18n: {
    getMessage: jest.fn((key) => key)
  }
} as any;

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('')
  })
) as any;

// Mock AbortController
global.AbortController = class AbortController {
  signal = { aborted: false };
  abort = jest.fn();
};

// Mock Date.now for consistent testing
const originalDateNow = Date.now;
beforeEach(() => {
  Date.now = jest.fn(() => 1000000);
});

afterEach(() => {
  Date.now = originalDateNow;
  jest.clearAllMocks();
});
