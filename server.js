const express = require('express');
const cors = require('cors');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

const MAIL_USER = process.env.MAIL_USER || 'ganesan@grid9cleantech.com';
const MAIL_PASS = process.env.MAIL_PASS || '';
const IMAP_HOST = process.env.IMAP_HOST || 'mail.grid9cleantech.com';
const SMTP_HOST = process.env.SMTP_HOST || 'mail.grid9cleantech.com';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '993');
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');

app.get('/', (req, res) => res.json({ status: 'Grid9 Mail Backend running' }));

app.get('/api/emails', async (req, res) => {
  try {
    const emails = await fetchEmails();
    res.json({ success: true, count: emails.length, emails });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/send-email', async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to || !subject || !text) return res.json({ success: false, error: 'Missing fields' });
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: MAIL_USER, pass: MAIL_PASS },
      tls: { rejectUnauthorized: false }
    });
    await transporter.sendMail({
      from: MAIL_USER,
      to,
      subject,
      text
    });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

function fetchEmails() {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: MAIL_USER,
      password: MAIL_PASS,
      host: IMAP_HOST,
      port: IMAP_PORT,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });

    imap.once('error', (err) => reject(err));

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err, box) => {
        if (err) { imap.end(); return reject(err); }
        const total = box.messages.total;
        if (total === 0) { imap.end(); return resolve([]); }
        const start = Math.max(1, total - 29);
        const f = imap.seq.fetch(`${start}:${total}`, { bodies: '' });
        const emails = [];
        f.on('message', (msg) => {
          let buffer = '';
          msg.on('body', (stream) => { stream.on('data', (chunk) => { buffer += chunk.toString('utf8'); }); });
          msg.once('end', () => {
            simpleParser(buffer).then((parsed) => {
              emails.push({
                from: parsed.from ? parsed.from.text : '',
                to: parsed.to ? parsed.to.text : '',
                subject: parsed.subject || '(no subject)',
                date: parsed.date ? parsed.date.toISOString().split('T')[0] : '',
                text: parsed.text || ''
              });
            }).catch(() => {});
          });
        });
        f.once('error', (err) => { imap.end(); reject(err); });
        f.once('end', () => { setTimeout(() => { imap.end(); resolve(emails); }, 2000); });
      });
    });

    imap.connect();
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Grid9 Mail Server running on port ${PORT}`));
