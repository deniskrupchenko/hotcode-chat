module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.base.json",
    tsconfigRootDir: __dirname,
    sourceType: "module"
  },
  plugins: ["@typescript-eslint", "import", "react", "react-hooks", "jsx-a11y"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "next",
    "next/core-web-vitals",
    "prettier"
  ],
  settings: {
    react: {
      version: "detect"
    },
    next: {
      rootDir: ["apps/web/"]
    },
    "import/resolver": {
      typescript: {
        project: [
          "tsconfig.base.json",
          "apps/web/tsconfig.json",
          "functions/tsconfig.json",
          "shared/tsconfig.json"
        ]
      }
    }
  },
  rules: {
    "import/order": [
      "error",
      {
        "groups": [
          "builtin",
          "external",
          "internal",
          "parent",
          "sibling",
          "index",
          "object",
          "type"
        ],
        "newlines-between": "always",
        "alphabetize": {
          "order": "asc",
          "caseInsensitive": true
        }
      }
    ],
    "react/react-in-jsx-scope": "off"
  },
  ignorePatterns: [
    "dist",
    ".next",
    "node_modules",
    "apps/web/.next",
    "apps/web/out",
    "functions/lib",
    "**/*.js"
  ]
};

