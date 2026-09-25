import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { db } from '../db.js';
import { sendMail } from '../mail.js';

const router = Router();
const concerns = new Set([
  'Registration problem',
  'Cannot find my records',
  'Incorrect information',
  'Account/login issue',
  'Other inquiry'
]);

router.post('/registrar-inquiries', async (req, res) => {
  const { name, email, contact, studentId, concern, message } = req.body || {};
  if (!name || !email || !concern || !message) {
    return res.status(400).json({ error: 'Name, email, concern, and message are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!concerns.has(String(concern))) {
    return res.status(400).json({ error: 'Select a valid concern.' });
  }
  if (String(message).trim().length < 10) {
    return res.status(400).json({ error: 'Please provide more detail in your message.' });
  }

  const referenceNo = `REG-${new Date().getFullYear()}-${String(randomInt(100000, 1000000))}`;
  db.prepare(
    `INSERT INTO registrar_inquiries
      (reference_no, name, email, contact, student_id, concern, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(referenceNo, String(name).trim(), String(email).trim(), String(contact || '').trim(),
    String(studentId || '').trim(), concern, String(message).trim());

  const recipient = String(process.env.REGISTRAR_EMAIL || 'registrar@stagnes.edu.ph').trim();
  await sendMail({
    to: recipient,
    subject: `Registrar inquiry ${referenceNo}: ${concern}`,
    text: [
      `Reference: ${referenceNo}`,
      `Name: ${String(name).trim()}`,
      `Email: ${String(email).trim()}`,
      `Contact: ${String(contact || '').trim() || 'Not provided'}`,
      `Student/Alumni ID: ${String(studentId || '').trim() || 'Not provided'}`,
      `Concern: ${concern}`,
      '',
      String(message).trim()
    ].join('\n')
  });
  return res.status(201).json({
    message: 'Your inquiry has been sent to the Registrar.',
    referenceNo
  });
});

export default router;
