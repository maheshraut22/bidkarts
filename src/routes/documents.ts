// src/routes/documents.ts - Document upload routes
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import type { Env } from '../lib/db'

type Variables = { user: any }
const documents = new Hono<{ Bindings: Env; Variables: Variables }>()

// GET /api/documents/project/:id
documents.get('/project/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const projectId = c.req.param('id')

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)

    // Allow customer owner, selected vendor, or admin
    if (user.role === 'customer' && project.customer_id !== user.id) {
      return c.json({ error: 'Forbidden' }, 403)
    }

    const result = await c.env.DB.prepare(
      'SELECT * FROM documents WHERE project_id = ? ORDER BY uploaded_at DESC'
    ).bind(projectId).all()

    return c.json({ documents: result.results })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// POST /api/documents - Upload document (simulated, base64 or URL)
documents.post('/', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { project_id, doc_type, file_name, file_url, file_size } = await c.req.json()

    if (!project_id || !doc_type || !file_name) {
      return c.json({ error: 'Project ID, document type, and file name are required' }, 400)
    }

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(project_id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)
    if (project.customer_id !== user.id && user.role !== 'admin') {
      return c.json({ error: 'Forbidden' }, 403)
    }

    // Validate file types
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx']
    const ext = file_name.toLowerCase().substring(file_name.lastIndexOf('.'))
    if (!allowed.includes(ext)) {
      return c.json({ error: 'File type not allowed. Accepted: PDF, JPG, PNG, DOC' }, 400)
    }

    const result = await c.env.DB.prepare(
      'INSERT INTO documents (project_id, user_id, doc_type, file_name, file_url, file_size) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(project_id, user.id, doc_type, file_name, file_url || `/uploads/${file_name}`, file_size || 0).run()

    return c.json({
      document: { id: result.meta.last_row_id, project_id, doc_type, file_name },
      message: 'Document uploaded successfully'
    }, 201)
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// DELETE /api/documents/:id
documents.delete('/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const id = c.req.param('id')
    const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first() as any
    if (!doc) return c.json({ error: 'Not found' }, 404)
    if (doc.user_id !== user.id && user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403)
    await c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run()
    return c.json({ message: 'Document deleted' })
  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

export default documents
