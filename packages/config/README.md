# Config Package - Code Structure

> **📂 This document explains the file/folder structure** within the config package. For working instructions, see [AGENTS.md](./AGENTS.md).

---

## 📁 Directory Structure

```
packages/config/
├── typescript/                 # TypeScript configurations
│   ├── base.json               # Base TypeScript config
│   ├── nextjs.json             # Next.js specific config
│   ├── react.json              # React specific config
│   └── node.json               # Node.js specific config
│
├── eslint/                     # ESLint configurations
│   ├── base.js                 # Base ESLint config
│   ├── next.js                 # Next.js ESLint config
│   ├── react.js                # React ESLint config
│   └── node.js                 # Node.js ESLint config
│
├── prettier/                   # Prettier configurations
│   └── index.js                # Prettier config
│
├── package.json                # Package metadata
├── AGENTS.md                   # Working instructions
└── README.md                   # This file
```

---

## 📝 Configuration Types

### 1. TypeScript Configs (`typescript/`)

Shared TypeScript compiler options.

#### Base Config (`typescript/base.json`)
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "incremental": true
  }
}
```

#### Next.js Config (`typescript/nextjs.json`)
```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Usage in Apps**:
```json
// apps/web/tsconfig.json
{
  "extends": "@vibe-habitat/config/typescript/nextjs.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@workspace/ui/*": ["../../packages/ui/src/*"]
    }
  }
}
```

---

### 2. ESLint Configs (`eslint/`)

Shared ESLint rules and configurations.

#### Base Config (`eslint/base.js`)
```javascript
module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { 
      argsIgnorePattern: "^_" 
    }],
    "@typescript-eslint/no-explicit-any": "warn",
  },
};
```

#### Next.js Config (`eslint/next.js`)
```javascript
module.exports = {
  extends: [
    "./base.js",
    "next/core-web-vitals",
  ],
  rules: {
    "@next/next/no-html-link-for-pages": "off",
  },
};
```

**Usage in Apps**:
```javascript
// apps/web/.eslintrc.js
module.exports = {
  extends: ["@vibe-habitat/config/eslint/next"],
};
```

---

### 3. Prettier Config (`prettier/`)

Shared code formatting rules.

#### Prettier Config (`prettier/index.js`)
```javascript
module.exports = {
  semi: true,
  trailingComma: "es5",
  singleQuote: false,
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  arrowParens: "always",
};
```

**Usage in Apps**:
```javascript
// apps/web/prettier.config.js
module.exports = require("@vibe-habitat/config/prettier");
```

---

## 📦 Package Exports

```json
{
  "name": "@vibe-habitat/config",
  "exports": {
    "./typescript/base.json": "./typescript/base.json",
    "./typescript/nextjs.json": "./typescript/nextjs.json",
    "./typescript/react.json": "./typescript/react.json",
    "./typescript/node.json": "./typescript/node.json",
    "./eslint/base": "./eslint/base.js",
    "./eslint/next": "./eslint/next.js",
    "./eslint/react": "./eslint/react.js",
    "./eslint/node": "./eslint/node.js",
    "./prettier": "./prettier/index.js"
  }
}
```

---

## 🎯 Configuration Strategy

### Inheritance Chain

```
TypeScript:
base.json
  ├─→ nextjs.json (for Next.js apps)
  ├─→ react.json (for React apps)
  └─→ node.json (for Node.js apps)

ESLint:
base.js
  ├─→ next.js (for Next.js apps)
  ├─→ react.js (for React apps)
  └─→ node.js (for Node.js apps)
```

### Override Pattern

Apps can extend and override:

```json
// apps/web/tsconfig.json
{
  "extends": "@vibe-habitat/config/typescript/nextjs.json",
  "compilerOptions": {
    // Override or add app-specific options
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## 📝 Common Configurations

### For Next.js Apps

```json
// tsconfig.json
{
  "extends": "@vibe-habitat/config/typescript/nextjs.json"
}
```

```javascript
// .eslintrc.js
module.exports = {
  extends: ["@vibe-habitat/config/eslint/next"],
};
```

### For React Libraries

```json
// tsconfig.json
{
  "extends": "@vibe-habitat/config/typescript/react.json"
}
```

```javascript
// .eslintrc.js
module.exports = {
  extends: ["@vibe-habitat/config/eslint/react"],
};
```

### For Node.js Apps

```json
// tsconfig.json
{
  "extends": "@vibe-habitat/config/typescript/node.json"
}
```

```javascript
// .eslintrc.js
module.exports = {
  extends: ["@vibe-habitat/config/eslint/node"],
};
```

---

## 🔄 Updating Configs

### When to Update

1. **TypeScript version upgrade**: Update compiler options
2. **New ESLint rules**: Add to base or specific configs
3. **Project-wide standards**: Update shared configs
4. **Framework updates**: Update framework-specific configs

### Update Process

1. Update config file in `packages/config`
2. Test in one app first
3. Roll out to all apps
4. Document breaking changes

---

## 🧪 Testing Configs

### TypeScript Config Test

```bash
# In an app
bun tsc --noEmit
```

### ESLint Config Test

```bash
# In an app
bun eslint .
```

---

## 📦 Dependencies

### Peer Dependencies
- `typescript`: TypeScript compiler
- `eslint`: Linter
- `prettier`: Code formatter
- `@typescript-eslint/parser`: TypeScript parser for ESLint
- `@typescript-eslint/eslint-plugin`: TypeScript rules for ESLint

---

## 🔗 Related Documentation

- **Working Instructions**: [AGENTS.md](./AGENTS.md)
- **Package Overview**: [../AGENTS.md](../AGENTS.md)
- **Usage in Apps**: [../../apps/AGENTS.md](../../apps/AGENTS.md)

---

## 📚 External Resources

- [TypeScript tsconfig Reference](https://www.typescriptlang.org/tsconfig)
- [ESLint Configuration](https://eslint.org/docs/latest/use/configure/)
- [Prettier Options](https://prettier.io/docs/en/options.html)

---

**For Development**: See [AGENTS.md](./AGENTS.md) for usage patterns and contribution guidelines.
