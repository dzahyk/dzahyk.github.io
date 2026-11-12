/* Contact form: sends the message straight to the owner's inbox through Web3Forms.
   The owner's email address never appears on the site; only a publishable access key (config.js) does.
   States: inline field errors (no browser bubbles), sending (form aria-busy, 15 s timeout),
   sent (a confirmation panel with a way to write another), and failed (values kept, LinkedIn offered). */
(() => {
  const form = document.getElementById('projectBriefForm');
  if (!form) return;
  const config = window.portfolioConfig || {};
  const settings = config.contactForm || {};
  const endpoint = settings.endpoint || 'https://api.web3forms.com/submit';
  const accessKey = String(settings.accessKey || '').trim();
  const ready = accessKey.length > 0;
  const linkedin = config.links?.linkedin || '';
  const button = document.getElementById('briefSubmit');
  const status = document.getElementById('briefFormStatus');
  const topic = document.getElementById('briefService');
  const message = form.elements.goal;
  const buttonLabel = button.innerHTML;
  form.noValidate = true;

  // Preselect a topic from ?service= links, if one matches.
  const requested = new URLSearchParams(location.search).get('service');
  if ([...topic.options].some(option => option.value === requested)) topic.value = requested;

  function setStatus(text, tone = '', withLink = false) {
    status.replaceChildren(document.createTextNode(text));
    if (withLink && linkedin) {
      const link = document.createElement('a');
      link.href = linkedin;
      link.rel = 'noopener';
      link.textContent = 'LinkedIn ↗';
      status.append(' ', link);
    }
    status.dataset.tone = tone;
  }

  if (!ready) {
    button.disabled = true;
    setStatus('The form is not connected yet. Please reach me on', 'note', true);
  }

  /* ---------- Inline validation ---------- */
  const fields = [...form.querySelectorAll('input[required], select[required], textarea[required]')];
  const messages = {
    senderName: 'Please add your name.',
    senderEmail: { valueMissing: 'Please add your email, so I can reply.', typeMismatch: 'This email address looks incomplete.' },
    service: 'Please choose a topic.',
    goal: { valueMissing: 'Please write a short message.', tooShort: 'A little more, please: at least 10 characters.' }
  };
  function errorFor(field) {
    const v = field.validity;
    if (v.valid) return '';
    const text = messages[field.name];
    if (typeof text === 'string') return text;
    return (text && (v.valueMissing ? text.valueMissing : v.typeMismatch ? text.typeMismatch : v.tooShort ? text.tooShort : '')) || field.validationMessage;
  }
  function showError(field, text) {
    const id = `${field.name}Error`;
    let note = document.getElementById(id);
    const described = (field.getAttribute('aria-describedby') || '').split(' ').filter(token => token && token !== id);
    if (!text) {
      field.removeAttribute('aria-invalid');
      note?.remove();
      if (described.length) field.setAttribute('aria-describedby', described.join(' ')); else field.removeAttribute('aria-describedby');
      return;
    }
    if (!note) {
      note = document.createElement('span');
      note.className = 'brief-error';
      note.id = id;
      field.after(note);
    }
    note.textContent = text;
    field.setAttribute('aria-describedby', [...described, id].join(' '));
    field.setAttribute('aria-invalid', 'true');
  }
  fields.forEach(field => {
    // Errors appear once a filled field is left, then clear as soon as it is fixed.
    field.addEventListener('blur', () => { if (field.value.trim()) showError(field, errorFor(field)); });
    field.addEventListener('input', () => { if (field.hasAttribute('aria-invalid')) showError(field, errorFor(field)); });
    field.addEventListener('change', () => { if (field.hasAttribute('aria-invalid')) showError(field, errorFor(field)); });
  });
  function readValues() {
    let first = null;
    fields.forEach(field => {
      if (!field.value.trim()) field.value = ''; // spaces alone do not count as an answer
      const text = errorFor(field);
      showError(field, text);
      if (text && !first) first = field;
    });
    if (first) {
      setStatus('Please check the highlighted fields.', 'error');
      first.focus();
      return null;
    }
    const values = Object.fromEntries(new FormData(form).entries());
    for (const key of Object.keys(values)) values[key] = String(values[key]).trim();
    return values;
  }

  /* ---------- Message length ---------- */
  if (message) {
    const counter = document.createElement('span');
    counter.className = 'brief-count';
    counter.setAttribute('aria-hidden', 'true');
    const max = Number(message.getAttribute('maxlength')) || 1500;
    const paint = () => {
      counter.textContent = `${message.value.length} / ${max}`;
      counter.dataset.near = String(message.value.length > max * .9);
    };
    message.after(counter);
    message.addEventListener('input', paint);
    form.addEventListener('reset', () => setTimeout(paint));
    paint();
  }

  function buildPayload(values) {
    const label = [...topic.options].find(option => option.value === values.service)?.textContent || values.service;
    return {
      access_key: accessKey,
      subject: `Portfolio contact — ${label}`,
      from_name: 'Portfolio contact form',
      name: values.senderName,
      email: values.senderEmail, // used as reply-to; the visitor's address, not the owner's
      topic: label,
      message: values.goal,
      timing: values.timeline,
      company: values.budget || 'Not specified',
      botcheck: values.botcheck ? true : ''
    };
  }

  /* ---------- Sent: a confirmation panel in place of the fields ---------- */
  const sent = document.createElement('div');
  sent.className = 'brief-sent';
  sent.hidden = true;
  sent.tabIndex = -1;
  sent.innerHTML = '<span class="brief-sent-mark" aria-hidden="true">✓</span><h3>Message sent.</h3><p></p><button type="button" class="brief-again">Write another message</button>';
  form.append(sent);
  sent.querySelector('.brief-again').addEventListener('click', () => {
    form.classList.remove('is-sent');
    sent.hidden = true;
    setStatus('');
    form.elements.senderName?.focus();
  });

  async function send(event) {
    event.preventDefault();
    if (!ready || button.disabled) return;
    const values = readValues();
    if (!values) return;
    if (values.botcheck) return; // a filled honeypot means a bot; drop silently
    button.disabled = true;
    button.textContent = 'Sending…';
    form.setAttribute('aria-busy', 'true');
    setStatus('Sending your message…', 'busy');
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 15000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildPayload(values)),
        signal: timeout.signal
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) throw new Error(result.message || `HTTP ${response.status}`);
      sent.querySelector('p').textContent = `Thank you, ${values.senderName}. It is in my inbox now, and I will reply to ${values.senderEmail}.`;
      form.reset();
      form.classList.add('is-sent');
      sent.hidden = false;
      setStatus('Message sent.', 'success');
      sent.focus();
    } catch (error) {
      const slow = error?.name === 'AbortError';
      setStatus(slow ? 'The connection took too long, so nothing was sent. Your text is still here; try again, or reach me on'
        : 'The message could not be sent right now. Your text is still here; try again in a moment, or reach me on', 'error', true);
    } finally {
      clearTimeout(timer);
      form.removeAttribute('aria-busy');
      button.disabled = false;
      button.innerHTML = buttonLabel;
    }
  }

  form.addEventListener('submit', send);
  window.portfolioBrief = { buildPayload };
})();
