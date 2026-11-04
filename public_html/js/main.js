/*
 * Kontaktformular: auf- und zuklappen, prüfen und an /kontakt.php senden.
 * Das PHP-Skript verschickt die Nachricht per E-Mail. Die Empfänger-Adresse
 * steht nur auf dem Server (private/config.php) und nirgends im Code der Seite.
 */
(function () {
    'use strict';

    var contact = document.querySelector('[data-contact]');
    if (!contact) return;

    var toggle = contact.querySelector('[data-contact-toggle]');
    var panel = contact.querySelector('[data-contact-panel]');
    var form = contact.querySelector('[data-contact-form]');
    var success = contact.querySelector('[data-contact-success]');
    var againButton = contact.querySelector('[data-contact-again]');
    var status = form.querySelector('[data-form-status]');
    var submitButton = form.querySelector('[data-submit]');
    var submitLabel = form.querySelector('[data-submit-label]');

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    var messages = {
        name: {
            valueMissing: 'Bitte gib deinen Namen ein.'
        },
        email: {
            valueMissing: 'Bitte gib deine E-Mail-Adresse ein.',
            typeMismatch: 'Bitte gib eine gültige E-Mail-Adresse ein, z. B. name@beispiel.ch.'
        },
        message: {
            valueMissing: 'Bitte schreib eine Nachricht.'
        }
    };

    var sending = false;

    // Mit JavaScript übernehmen wir die Prüfung selbst (deutsche Meldungen direkt am Feld).
    form.noValidate = true;

    /* ---------- Auf- und zuklappen ---------- */

    function isOpen() {
        return contact.hasAttribute('data-open');
    }

    function setOpen(open) {
        contact.toggleAttribute('data-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        panel.inert = !open;

        if (open) revealPanel();
    }

    // Nach dem Aufklappen so scrollen, dass das Formular sichtbar ist.
    function revealPanel() {
        var done = false;

        function scroll() {
            if (done) return;
            done = true;
            var rect = contact.getBoundingClientRect();
            var overflow = rect.bottom - (window.innerHeight - 16);
            if (overflow > 0) {
                window.scrollBy({
                    top: Math.min(overflow, rect.top - 16),
                    behavior: reduceMotion.matches ? 'auto' : 'smooth'
                });
            }
        }

        if (reduceMotion.matches) {
            scroll();
            return;
        }
        panel.addEventListener('transitionend', scroll, { once: true });
        window.setTimeout(scroll, 450);
    }

    setOpen(false);

    toggle.addEventListener('click', function () {
        setOpen(!isOpen());
    });

    // Direkter Link auf r2sev.com/#kontakt öffnet das Formular.
    function openFromHash() {
        if (window.location.hash === '#kontakt' && !isOpen()) setOpen(true);
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);

    /* ---------- Prüfen ---------- */

    var fields = ['name', 'email', 'message'].map(function (name) {
        return form.elements[name];
    });

    function errorFor(field) {
        if (field.value.trim() === '') return messages[field.name].valueMissing;
        if (field.validity.typeMismatch) return messages[field.name].typeMismatch;
        return '';
    }

    function showError(field, text) {
        var errorEl = document.getElementById(field.id + '-error');
        if (text) {
            field.setAttribute('aria-invalid', 'true');
            field.setAttribute('aria-describedby', errorEl.id);
            errorEl.textContent = text;
            errorEl.hidden = false;
        } else {
            field.removeAttribute('aria-invalid');
            field.removeAttribute('aria-describedby');
            errorEl.textContent = '';
            errorEl.hidden = true;
        }
    }

    function validate() {
        var firstInvalid = null;
        fields.forEach(function (field) {
            var text = errorFor(field);
            showError(field, text);
            if (text && !firstInvalid) firstInvalid = field;
        });
        if (firstInvalid) firstInvalid.focus();
        return !firstInvalid;
    }

    fields.forEach(function (field) {
        // Fehlermeldung verschwindet, sobald das Feld korrigiert ist.
        field.addEventListener('input', function () {
            if (field.getAttribute('aria-invalid') === 'true' && !errorFor(field)) showError(field, '');
        });
        field.addEventListener('blur', function () {
            if (field.getAttribute('aria-invalid') === 'true') showError(field, errorFor(field));
        });
    });

    /* ---------- Senden ---------- */

    function setSending(value) {
        sending = value;
        submitButton.disabled = value;
        submitLabel.textContent = value ? 'Wird gesendet …' : 'Nachricht senden';
        form.setAttribute('aria-busy', String(value));
    }

    function setStatus(text) {
        status.textContent = text;
        status.hidden = !text;
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (sending) return;

        setStatus('');
        if (!validate()) return;

        setSending(true);

        // Nach 40 Sekunden ohne Antwort abbrechen, damit niemand endlos wartet.
        var controller = 'AbortController' in window ? new AbortController() : null;
        var timeout = controller
            ? window.setTimeout(function () {
                  controller.abort();
              }, 40000)
            : null;

        fetch(form.action, {
            method: 'POST',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            body: new FormData(form),
            signal: controller ? controller.signal : undefined
        })
            .then(function (response) {
                return response
                    .json()
                    .catch(function () {
                        return {};
                    })
                    .then(function (data) {
                        if (response.ok && data.ok) {
                            showSuccess();
                            return;
                        }
                        setSending(false);
                        if (data.error === 'validation' && data.fields) {
                            showServerErrors(data.fields);
                        } else if (data.error === 'rate_limit') {
                            failWith('Du hast gerade schon mehrere Nachrichten geschickt. Bitte versuch es in einer Stunde nochmal.');
                        } else {
                            failWith('Das hat leider nicht geklappt. Bitte versuch es später nochmal.');
                        }
                    });
            })
            .catch(function () {
                setSending(false);
                failWith('Keine Verbindung. Bitte prüf dein Internet und versuch es nochmal.');
            })
            .then(function () {
                window.clearTimeout(timeout);
            });
    });

    function failWith(text) {
        setStatus(text);
        submitButton.focus();
    }

    // Fehler, die erst der Server findet (z. B. zu lange Eingaben), direkt am Feld anzeigen.
    function showServerErrors(fieldErrors) {
        var firstInvalid = null;
        fields.forEach(function (field) {
            var text = fieldErrors[field.name] || '';
            showError(field, text);
            if (text && !firstInvalid) firstInvalid = field;
        });
        if (firstInvalid) firstInvalid.focus();
        else failWith('Bitte prüf deine Angaben.');
    }

    function showSuccess() {
        setSending(false);
        form.reset();
        form.hidden = true;
        success.hidden = false;
        success.focus({ preventScroll: true });
    }

    againButton.addEventListener('click', function () {
        success.hidden = true;
        form.hidden = false;
        form.elements.name.focus();
    });
})();
