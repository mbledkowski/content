import fsp from 'fs/promises'
import { fileURLToPath } from 'url'
import { assert, test, describe, expect } from 'vitest'
import { setup, $fetch, isDev } from '@nuxt/test-utils'
import { hash } from 'ohash'
import { join } from 'pathe'
import { testMarkdownParser } from './features/parser-markdown'
import { testPathMetaTransformer } from './features/transformer-path-meta'
import { testYamlParser } from './features/parser-yaml'
import { testNavigation } from './features/navigation'
// import { testMDCComponent } from './features/mdc-component'
import { testJSONParser } from './features/parser-json'
import { testCSVParser } from './features/parser-csv'
import { testRegex } from './features/regex'
import { testMarkdownParserExcerpt } from './features/parser-markdown-excerpt'
import { renderPage, pullingForHMR, expectNoClientErrors, waitFor } from './utils'

const fixturePath = fileURLToPath(new URL('./fixtures/basic', import.meta.url))
describe('fixtures:basic', async () => {
  await setup({
    rootDir: fixturePath,
    browser: true,
    server: true
  })

  const QUERY_ENDPOINT = '/api/_content/query'
  const fetchDocument = (_id: string) => {
    const params = { first: true, where: { _id } }
    const qid = hash(params)
    return $fetch(`${QUERY_ENDPOINT}/${qid}`, {
      params: { _params: JSON.stringify(params) }
    })
  }

  test('List contents', async () => {
    const params = { only: '_id' }
    const qid = hash(params)
    const docs = await $fetch(`${QUERY_ENDPOINT}/${qid}`, {
      params: { _params: JSON.stringify(params) }
    })

    const ids = docs.map(doc => doc._id)

    assert(ids.length > 0)
    assert(ids.includes('content:index.md'))

    // Ignored files should be listed
    assert(ids.includes('content:.dot-ignored.md') === false, 'Ignored files with `.` should not be listed')
    assert(ids.includes('content:-dash-ignored.md') === false, 'Ignored files with `-` should not be listed')

    assert(ids.includes('fa-ir:fa:index.md') === true, 'Files with `fa-ir` prefix should be listed')
  })

  test('Get contents index', async () => {
    const index = await fetchDocument('content:index.md')

    expect(index).toHaveProperty('body')

    expect(index.body).toMatchSnapshot('basic-index-body')
  })

  test('Get ignored contents', async () => {
    const ignored = await fetchDocument('content:.dot-ignored.md').catch(_err => null)

    expect(ignored).toBeNull()
  })

  test('Search contents using `locale` helper', async () => {
    const fa = await $fetch('/locale-fa')

    expect(fa).toContain('fa-ir:fa:index.md')
    expect(fa).not.toContain('content:index.md')

    const en = await $fetch('/locale-en')

    expect(en).not.toContain('fa-ir:fa:index.md')
    expect(en).toContain('content:index.md')
  })

  test('Use default locale for unscoped contents', async () => {
    const index = await fetchDocument('content:index.md')

    expect(index).toMatchObject({
      _locale: 'en'
    })
  })

  test('features:multi-part-path', async () => {
    const html = await $fetch('/features/multi-part-path')
    expect(html).contains('Persian')
  })

  test('features:<ContentDoc> head management (if same path)', async () => {
    const html = await $fetch('/head')
    expect(html).contains('<title>Head overwritten</title>')
    expect(html).contains('<meta property="og:image" content="https://picsum.photos/200/300">')
    expect(html).contains('<meta name="description" content="Description overwritten"><meta property="og:image" content="https://picsum.photos/200/300">')
  })
  test('features:<ContentDoc> head management (not same path)', async () => {
    const html = await $fetch('/bypass-head')
    expect(html).not.contains('<title>Head overwritten</title>')
    expect(html).not.contains('<meta property="og:image" content="https://picsum.photos/200/300">')
    expect(html).not.contains('<meta name="description" content="Description overwritten"><meta property="og:image" content="https://picsum.photos/200/300">')
  })

  testNavigation()

  testMarkdownParser()
  testMarkdownParserExcerpt()

  testYamlParser()

  testCSVParser()

  testJSONParser()

  testPathMetaTransformer()

  // testMDCComponent()

  testRegex()

  if (!isDev()) {
    return
  }

  describe('hmr', async () => {
    await fsp.mkdir(join(fixturePath, 'content-tests'), { recursive: true })

    test('should work', async () => {
      await fsp.writeFile(join(fixturePath, 'content-tests/index.md'), '# Hello')
      await waitFor(1000)

      const { page, pageErrors, consoleLogs } = await renderPage('/_tests')

      expect(await page.$('h1').then(r => r.textContent())).toBe('Hello')

      await fsp.writeFile(join(fixturePath, 'content-tests/index.md'), '# Hello HMR')

      await pullingForHMR(async () => {
        expect(await page.$('h1').then(r => r.textContent())).toBe('Hello HMR')
      })

      // ensure no errors
      expectNoClientErrors(pageErrors, consoleLogs)

      await page.close()
    })

    test('should work with parentheses', async () => {
      await fsp.writeFile(join(fixturePath, 'content-tests/foo(bar).md'), '# Foo Bar')
      await waitFor(1000)

      const { page, pageErrors, consoleLogs } = await renderPage('/_tests/foo(bar)')

      expect(await page.$('h1').then(r => r.textContent())).toBe('Foo Bar')

      await fsp.writeFile(join(fixturePath, 'content-tests/foo(bar).md'), '# Foo Bar Baz')

      await pullingForHMR(async () => {
        expect(await page.$('h1').then(r => r.textContent())).toBe('Foo Bar Baz')
      })

      // ensure no errors
      expectNoClientErrors(pageErrors, consoleLogs)

      await page.close()
    })
  })
})
