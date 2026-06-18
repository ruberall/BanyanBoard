import '@testing-library/jest-dom'
import { resolve, join } from 'path'
import { existsSync } from 'fs'

const srcDir = resolve(__dirname)

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module') as {
  _resolveFilename: (request: string, parent: NodeModule | null, isMain: boolean, options?: object) => string
}
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function (
  request: string,
  parent: NodeModule | null,
  isMain: boolean,
  options?: object,
): string {
  if (request.startsWith('@/')) {
    const relative = request.slice(2)
    const candidates = [
      join(srcDir, relative + '.ts'),
      join(srcDir, relative + '.tsx'),
      join(srcDir, relative, 'index.ts'),
      join(srcDir, relative, 'index.tsx'),
      join(srcDir, relative),
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
  }
  return originalResolveFilename(request, parent, isMain, options)
}
