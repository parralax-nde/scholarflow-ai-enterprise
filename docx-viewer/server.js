import express from 'express'

const app = express()
const port = Number(process.env.PORT || 3000)
const apiBase = (process.env.API_BASE_URL || 'http://backend:8000').replace(/\/$/, '')

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'docx-viewer' })
})

app.get('/render/:docxId', async (req, res) => {
  const { docxId } = req.params
  const sourceUrl = `${apiBase}/export/docx/files/${encodeURIComponent(docxId)}`

  try {
    const response = await fetch(sourceUrl)
    if (!response.ok) {
      res.status(response.status).send(`<h1>DOCX not found</h1><p>Artifact id: ${docxId}</p>`)
      return
    }

    const arrayBuffer = await response.arrayBuffer()
    const mammoth = await import('mammoth')
    const result = await mammoth.convertToHtml({ buffer: Buffer.from(arrayBuffer) })

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(`<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DOCX Viewer</title>
    <style>
      body { margin: 0; font-family: Georgia, serif; background: #e7d7bb; color: #2e1f15; }
      .sheet { max-width: 880px; margin: 24px auto; background: #f8eedb; border: 1px solid #d8bd8e; border-radius: 10px; padding: 28px 34px; box-shadow: 0 8px 20px rgba(36, 20, 10, 0.15); }
      h1, h2, h3 { font-family: 'Times New Roman', serif; margin-top: 0; }
      p { line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ccb184; padding: 6px 8px; }
      .note { font-size: 12px; color: #6e563f; margin-top: 18px; }
    </style>
  </head>
  <body>
    <main class="sheet">
      ${result.value || '<p>Empty document.</p>'}
      <p class="note">Rendered by self-hosted DOCX viewer service.</p>
    </main>
  </body>
</html>`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    res.status(500).send(`<h1>Viewer error</h1><pre>${message}</pre>`)
  }
})

app.listen(port, () => {
  console.log(`docx-viewer listening on :${port}`)
})
