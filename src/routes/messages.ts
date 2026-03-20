// src/routes/messages.ts - Enhanced Chat System with Moderation (v3)
import { Hono } from 'hono'
import { authMiddleware, requireRole } from '../middleware/auth'
import { createNotification, sanitize } from '../lib/db'
import type { Env } from '../lib/db'

type Variables = { user: any }
const messages = new Hono<{ Bindings: Env; Variables: Variables }>()

// ── List conversations ────────────────────────────────────────────────────────
messages.get('/conversations', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    let query = '', params: any[] = []

    if (user.role === 'admin') {
      // Admin sees all conversations
      query = `SELECT conv.id, conv.project_id, conv.customer_id, conv.vendor_id,
        p.title as project_title, cu.name as customer_name, vu.name as vendor_name,
        cu.avatar_url as customer_avatar, vu.avatar_url as vendor_avatar,
        (SELECT content FROM messages WHERE conversation_id=conv.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id=conv.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id=conv.id) as message_count,
        (SELECT COUNT(*) FROM messages WHERE conversation_id=conv.id AND is_flagged=1) as flagged_count
        FROM conversations conv
        JOIN projects p ON conv.project_id=p.id
        JOIN users cu ON conv.customer_id=cu.id
        JOIN users vu ON conv.vendor_id=vu.id
        ORDER BY last_message_at DESC NULLS LAST LIMIT 50`
      params = []
    } else {
      query = `SELECT conv.id, conv.project_id, conv.customer_id, conv.vendor_id,
        p.title as project_title, cu.name as customer_name, vu.name as vendor_name,
        cu.avatar_url as customer_avatar, vu.avatar_url as vendor_avatar,
        (SELECT content FROM messages WHERE conversation_id=conv.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE conversation_id=conv.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_id=conv.id AND sender_id!=? AND is_read=0) as unread_count
        FROM conversations conv
        JOIN projects p ON conv.project_id=p.id
        JOIN users cu ON conv.customer_id=cu.id
        JOIN users vu ON conv.vendor_id=vu.id
        WHERE conv.customer_id=? OR conv.vendor_id=?
        ORDER BY last_message_at DESC NULLS LAST`
      params = [user.id, user.id, user.id]
    }
    const result = await c.env.DB.prepare(query).bind(...params).all()
    return c.json({ conversations: result.results })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Get messages in conversation ──────────────────────────────────────────────
messages.get('/:conversationId', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const convId = c.req.param('conversationId')

    let conv: any
    if (user.role === 'admin') {
      conv = await c.env.DB.prepare(`
        SELECT conv.*, p.title as project_title, cu.name as customer_name, vu.name as vendor_name
        FROM conversations conv JOIN projects p ON conv.project_id=p.id
        JOIN users cu ON conv.customer_id=cu.id JOIN users vu ON conv.vendor_id=vu.id
        WHERE conv.id=?`).bind(convId).first()
    } else {
      conv = await c.env.DB.prepare(
        'SELECT * FROM conversations WHERE id=? AND (customer_id=? OR vendor_id=?)'
      ).bind(convId, user.id, user.id).first()
    }
    if (!conv) return c.json({ error: 'Conversation not found' }, 404)

    const result = await c.env.DB.prepare(`
      SELECT m.*, u.name as sender_name, u.avatar_url as sender_avatar, u.role as sender_role
      FROM messages m JOIN users u ON m.sender_id=u.id
      WHERE m.conversation_id=? ORDER BY m.created_at ASC`).bind(convId).all()

    if (user.role !== 'admin') {
      await c.env.DB.prepare('UPDATE messages SET is_read=1 WHERE conversation_id=? AND sender_id!=?').bind(convId, user.id).run()
    }
    return c.json({ messages: result.results, conversation: conv })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Start or retrieve conversation ───────────────────────────────────────────
messages.post('/start', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { project_id, vendor_id } = await c.req.json()
    if (!project_id || !vendor_id) return c.json({ error: 'project_id and vendor_id required' }, 400)

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(project_id).first() as any
    if (!project) return c.json({ error: 'Project not found' }, 404)

    const customerId = user.role === 'customer' ? user.id : project.customer_id

    let conv = await c.env.DB.prepare(
      'SELECT * FROM conversations WHERE project_id=? AND customer_id=? AND vendor_id=?'
    ).bind(project_id, customerId, vendor_id).first() as any

    if (!conv) {
      const res = await c.env.DB.prepare(
        'INSERT INTO conversations (project_id, customer_id, vendor_id) VALUES (?, ?, ?)'
      ).bind(project_id, customerId, vendor_id).run()
      conv = { id: res.meta.last_row_id, project_id, customer_id: customerId, vendor_id }
    }
    return c.json({ conversation: conv })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Helper: Mask sensitive information in messages ────────────────────────────
function maskSensitiveInfo(text: string): { masked: string; hadSensitive: boolean } {
  if (!text) return { masked: text, hadSensitive: false }
  let masked = text
  let hadSensitive = false

  // Mask Indian phone numbers (10 digits, optionally starting with +91 or 0)
  const phoneRegex = /(?:(?:\+?91|0)?[-\s]?)?[6-9]\d{9}|\+91[-\s]?\d{10}|0\d{10}/g
  if (phoneRegex.test(masked)) {
    hadSensitive = true
    masked = masked.replace(phoneRegex, '**PHONE MASKED**')
  }

  // Mask email addresses
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
  if (emailRegex.test(masked)) {
    hadSensitive = true
    masked = masked.replace(emailRegex, '**EMAIL MASKED**')
  }

  // Mask WhatsApp references
  const waRegex = /whatsapp\s*(?:number|no\.?|num)?:?\s*[\d\s\-\+]+/gi
  if (waRegex.test(masked)) {
    hadSensitive = true
    masked = masked.replace(waRegex, '**WHATSAPP MASKED**')
  }

  // Mask complete addresses (house/flat/plot + number patterns)
  const addressRegex = /(?:house|flat|plot|door|apt|apartment|bldg|building|floor|sector|block|survey)\s*(?:no\.?|number|#)?\s*[\w\-\/]+[,\s]+[\w\s,]+(?:street|road|lane|nagar|colony|layout|extension|phase|area|district)/gi
  if (addressRegex.test(masked)) {
    hadSensitive = true
    masked = masked.replace(addressRegex, '**ADDRESS MASKED**')
  }

  // Mask GPS/map coordinates
  const coordsRegex = /(?:lat(?:itude)?|lon(?:gitude)?|gps|location|coords?|coordinates?)\s*[:=]?\s*-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/gi
  if (coordsRegex.test(masked)) {
    hadSensitive = true
    masked = masked.replace(coordsRegex, '**LOCATION MASKED**')
  }

  // Mask PIN codes (Indian 6-digit postal codes)
  const pinRegex = /\b[1-9][0-9]{5}\b/g
  if (pinRegex.test(masked)) {
    hadSensitive = true
    masked = masked.replace(pinRegex, '**PIN MASKED**')
  }

  return { masked, hadSensitive }
}

// ── Send message ──────────────────────────────────────────────────────────────
messages.post('/:conversationId/send', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const convId = c.req.param('conversationId')
    const { content, attachment_url, attachment_name, attachment_type } = await c.req.json()
    if (!content?.trim() && !attachment_url) return c.json({ error: 'Message content or attachment required' }, 400)

    const conv = await c.env.DB.prepare(
      'SELECT * FROM conversations WHERE id=? AND (customer_id=? OR vendor_id=?)'
    ).bind(convId, user.id, user.id).first() as any
    if (!conv) return c.json({ error: 'Conversation not found or access denied' }, 404)

    // Apply sensitive info masking
    const rawContent = content ? sanitize(content) : ''
    const { masked: safeContent, hadSensitive } = maskSensitiveInfo(rawContent)

    const result = await c.env.DB.prepare(
      'INSERT INTO messages (conversation_id, sender_id, content, attachment_url, attachment_name) VALUES (?, ?, ?, ?, ?)'
    ).bind(convId, user.id, safeContent, attachment_url || null, attachment_name || null).run()

    const msgId = result.meta.last_row_id
    const recipientId = conv.customer_id === user.id ? conv.vendor_id : conv.customer_id
    const preview = safeContent.substring(0, 60) + (safeContent.length > 60 ? '...' : '')
    await createNotification(c.env.DB, recipientId, '💬 New Message',
      attachment_url ? `${user.name} sent you a file: ${attachment_name || 'attachment'}` : `${user.name}: ${preview}`,
      'message', parseInt(convId), 'conversation')

    return c.json({
      message: {
        id: msgId, conversation_id: parseInt(convId), sender_id: user.id,
        sender_name: user.name, content: safeContent,
        attachment_url: attachment_url || null, attachment_name: attachment_name || null,
        is_read: 0, is_flagged: 0, created_at: new Date().toISOString()
      },
      masked: hadSensitive,
      warning: hadSensitive ? 'Sensitive information (phone/email/address/location) was masked for privacy protection.' : undefined
    }, 201)
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Mark conversation as read ─────────────────────────────────────────────────
messages.post('/:conversationId/read', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const convId = c.req.param('conversationId')
    await c.env.DB.prepare('UPDATE messages SET is_read=1 WHERE conversation_id=? AND sender_id!=?').bind(convId, user.id).run()
    return c.json({ message: 'Marked as read' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Unread count ─────────────────────────────────────────────────────────────
messages.get('/unread/count', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const result = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM messages m
      JOIN conversations conv ON m.conversation_id=conv.id
      WHERE (conv.customer_id=? OR conv.vendor_id=?) AND m.sender_id!=? AND m.is_read=0`
    ).bind(user.id, user.id, user.id).first() as any
    return c.json({ count: result?.count || 0 })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Flag message (user report) ────────────────────────────────────────────────
messages.patch('/:conversationId/messages/:msgId/flag', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { msgId, conversationId } = c.req.param()
    const conv = await c.env.DB.prepare(
      'SELECT * FROM conversations WHERE id=? AND (customer_id=? OR vendor_id=?)'
    ).bind(conversationId, user.id, user.id).first()
    if (!conv) return c.json({ error: 'Unauthorized' }, 403)
    await c.env.DB.prepare('UPDATE messages SET is_flagged=1 WHERE id=?').bind(msgId).run()
    return c.json({ message: 'Message reported for review' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

// ── Delete own message ────────────────────────────────────────────────────────
messages.delete('/:conversationId/messages/:msgId', authMiddleware, async (c) => {
  try {
    const user = c.get('user')
    const { msgId } = c.req.param()
    const msg = await c.env.DB.prepare('SELECT * FROM messages WHERE id=?').bind(msgId).first() as any
    if (!msg) return c.json({ error: 'Message not found' }, 404)
    if (msg.sender_id !== user.id && user.role !== 'admin') return c.json({ error: 'Can only delete your own messages' }, 403)
    await c.env.DB.prepare('DELETE FROM messages WHERE id=?').bind(msgId).run()
    return c.json({ message: 'Message deleted' })
  } catch (e: any) { return c.json({ error: e.message }, 500) }
})

export default messages
