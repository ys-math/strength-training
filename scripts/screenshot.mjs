// Renders the built dashboard to docs/dashboard.png — the image in README.md.
//
// The data is baked in at build time, so the screenshot goes stale the moment a new
// export lands. This regenerates it. CI runs it whenever strong_workouts.csv changes
// (.github/workflows/screenshot.yml); run it by hand with `npm run screenshot`.
//
// Usage: npm run build && npm run screenshot [-- --theme cozy --out path.png]
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

// Must match `base` in vite.config.ts and the storage key in src/lib/theme.ts.
const BASE = '/strength-training/'
const THEME_STORAGE_KEY = 'strength-training:theme'

const theme = arg('theme', 'modern-dark')
const out = resolve(root, arg('out', 'docs/dashboard.png'))
const port = Number(arg('port', '4173'))
const width = Number(arg('width', '1280'))

if (!existsSync(resolve(root, 'dist/index.html'))) {
  console.error('No dist/ found. Run `npm run build` first.')
  process.exit(1)
}

// Serve the production build rather than the dev server: this is the artifact that
// actually ships, and it renders without Vite's HMR client in the page.
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
})
const stopServer = () => server.kill('SIGTERM')
process.on('exit', stopServer)
process.on('SIGINT', () => process.exit(130))

const url = `http://localhost:${port}${BASE}`

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`vite preview did not answer on ${url} within ${timeoutMs}ms`)
}

let browser
try {
  await waitForServer()

  browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width, height: 1200 },
    deviceScaleFactor: 2,
  })

  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  // Stamp the theme before the page's own blocking script reads it, so the shot never
  // depends on what a previous run left behind.
  await page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value)
      } catch {
        // private mode — the inline script falls back to the default theme
      }
    },
    [THEME_STORAGE_KEY, theme],
  )

  await page.goto(url, { waitUntil: 'networkidle' })
  // Recharts sets isAnimationActive={false} everywhere, so nothing is animating in.
  // This beat is for webfont swap and the final layout pass.
  await page.waitForTimeout(1000)

  // A blank or stub frame is a failed run, not a screenshot. Check the page actually
  // rendered its data before overwriting the committed image: the empty state, a missing
  // prescription, or a chart that didn't mount all mean "don't ship this".
  if (await page.getByText('No workout data found').count())
    throw new Error('the app rendered its empty state — is strong_workouts.csv populated?')

  const charts = await page.locator('svg.recharts-surface').count()
  if (charts === 0) throw new Error('no chart rendered')

  const resolvedTheme = await page.evaluate(() => document.documentElement.dataset.theme)
  if (resolvedTheme !== theme)
    throw new Error(`theme did not apply: asked for ${theme}, page shows ${resolvedTheme}`)

  if (errors.length) throw new Error(`page errors:\n  ${errors.join('\n  ')}`)

  await page.screenshot({ path: out, fullPage: true })
  console.log(`Wrote ${out} — ${resolvedTheme}, ${width}px wide, ${charts} charts`)
} catch (err) {
  console.error(String(err?.message ?? err))
  process.exitCode = 1
} finally {
  await browser?.close()
  stopServer()
}
